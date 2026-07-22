import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  jwtVerify,
  createRemoteJWKSet,
  decodeProtectedHeader,
  type JWTPayload,
} from 'jose';
import { eq, sql } from 'drizzle-orm';

const REFRESH_USED_PREFIX = 'refresh:used:';
// A rotated-away refresh token stays replay-safe for this long: if the
// client's response to a refresh was lost (timeout, cold-start retry) and
// it presents the same now-rotated token again, we hand back the session we
// already created instead of treating it as theft. Long enough to absorb a
// retried HTTP round-trip, short enough that a token stolen from a real
// leak (log, crash report) is still useless within seconds of rotation.
const REFRESH_GRACE_PREFIX = 'refresh:grace:';
const REFRESH_GRACE_SECONDS = 30;

interface RefreshGraceReplay {
  userId: string;
  sessionToken: string;
  refreshToken: string;
  expiresAt: string;
  role: string;
}
import { AuthService } from './auth.service';
import { DRIZZLE } from '../database/database.module';
import type { DrizzleDB } from '../database/database.module';
import {
  user as userTable,
  session as sessionTable,
} from '../database/schema/auth.schema';
import { randomUUID } from 'crypto';
import { CacheService } from '../cache/cache.service';

interface SupabaseJwtPayload extends JWTPayload {
  email?: string;
  user_metadata?: { full_name?: string; name?: string; avatar_url?: string };
  app_metadata?: { role?: string;[key: string]: unknown };
  role?: string;
}

const ASYMMETRIC_ALGORITHMS = new Set(['ES256', 'RS256', 'EdDSA']);

@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger(SupabaseAuthService.name);
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cache: CacheService,
  ) { }

  private getJwks(): ReturnType<typeof createRemoteJWKSet> {
    if (!this.jwks) {
      const supabaseUrl = this.configService.get<string>('supabase.url');
      if (!supabaseUrl) {
        throw new UnauthorizedException('Supabase URL not configured');
      }
      const jwksUrl = new URL(
        '/auth/v1/.well-known/jwks.json',
        supabaseUrl,
      );
      this.jwks = createRemoteJWKSet(jwksUrl);
    }
    return this.jwks;
  }

  private getVerifyOptions(): { issuer: string; audience: string } {
    const supabaseUrl = this.configService.get<string>('supabase.url');
    if (!supabaseUrl) {
      throw new UnauthorizedException('Supabase URL not configured');
    }
    const baseUrl = supabaseUrl.replace(/\/$/, '');
    return {
      issuer: `${baseUrl}/auth/v1`,
      audience: 'authenticated',
    };
  }

  async verifyToken(token: string): Promise<SupabaseJwtPayload> {
    const header = decodeProtectedHeader(token);
    const alg = header.alg;
    const verifyOptions = this.getVerifyOptions();

    if (alg && ASYMMETRIC_ALGORITHMS.has(alg)) {
      try {
        const { payload } = await jwtVerify(token, this.getJwks(), verifyOptions);
        return payload as SupabaseJwtPayload;
      } catch (err) {
        // If it's a cold start, JWKS might take a split second to fetch.
        this.logger.error('JWT verification failed (JWKS may be unreachable on cold start)', err instanceof Error ? err.stack : String(err));
        throw new UnauthorizedException('Authentication service is warming up. Please try again in a moment.');
      }
    }

    const jwtSecret = this.configService.get<string>('supabase.jwtSecret');
    if (!jwtSecret) {
      throw new UnauthorizedException(
        'Supabase JWT secret not configured for HS256 verification',
      );
    }

    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      ...verifyOptions,
    });
    return payload as SupabaseJwtPayload;
  }

  /**
   * Resolves a verified Supabase JWT payload to a local user record,
   * creating it on first sight. Anchored on `supabaseUserId` (the JWT `sub`
   * claim) rather than email — email can change or be reused, `sub` can't.
   *
   * Pre-existing accounts created by the old email-keyed exchange flow are
   * backfilled with their `supabaseUserId` the first time they're resolved
   * through this method, so there's no separate data migration to run.
   */
  async resolveOrCreateUser(payload: SupabaseJwtPayload): Promise<{
    userId: string;
    role: string;
    banned: boolean;
  }> {
    const supabaseUserId = payload.sub;
    if (!supabaseUserId) {
      throw new UnauthorizedException('Supabase JWT missing sub claim');
    }
    const email = payload.email;
    if (!email) {
      throw new UnauthorizedException('Supabase JWT missing email claim');
    }

    const [bySupabaseId] = await this.db
      .select()
      .from(userTable)
      .where(eq(userTable.supabaseUserId, supabaseUserId))
      .limit(1);
    if (bySupabaseId) {
      return {
        userId: bySupabaseId.id,
        role: bySupabaseId.role,
        banned: bySupabaseId.banned,
      };
    }

    const name =
      payload.user_metadata?.full_name ??
      payload.user_metadata?.name ??
      email.split('@')[0];
    const jwtRole =
      payload.app_metadata?.role ??
      (payload.role !== 'authenticated' && payload.role !== 'anon' ? payload.role : undefined) ??
      'user';

    try {
      // Special Sync Logic: We only overwrite the local DB role if the Supabase JWT
      // carries a high-privilege 'admin' role. This prevents manual Postgres
      // admin assignments from being reverted back to 'user' by a stale JWT.
      const syncRoleSql = sql`CASE
        WHEN ${userTable.role} = 'admin' THEN 'admin'
        ELSE ${jwtRole}
      END`;

      await this.db
        .insert(userTable)
        .values({
          id: randomUUID(),
          name,
          email,
          role: jwtRole,
          emailVerified: true,
          image: payload.user_metadata?.avatar_url ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          supabaseUserId,
        })
        .onConflictDoUpdate({
          target: userTable.email,
          set: {
            role: syncRoleSql,
            supabaseUserId,
            updatedAt: new Date(),
          },
        });

      const [resolvedUser] = await this.db
        .select()
        .from(userTable)
        .where(eq(userTable.email, email))
        .limit(1);

      if (!resolvedUser) {
        throw new InternalServerErrorException('Failed to find or create user');
      }

      return {
        userId: resolvedUser.id,
        role: resolvedUser.role,
        banned: resolvedUser.banned,
      };
    } catch (err) {
      this.logger.error(
        `Database error resolving user for email=${email}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Database error resolving user');
    }
  }

  /**
   * Single entry point for request-time auth: verify a bearer credential as
   * a Supabase access token and resolve it to a local user, or return null
   * if it isn't one (wrong shape, bad signature, expired) — callers (the
   * guards) fall back to legacy session-token lookup on null rather than
   * treating every non-Supabase credential as an error.
   */
  async authenticateBearerToken(token: string): Promise<{
    userId: string;
    role: string;
    banned: boolean;
  } | null> {
    try {
      const payload = await this.verifyToken(token);
      return await this.resolveOrCreateUser(payload);
    } catch {
      return null;
    }
  }

  async exchangeSupabaseToken(
    supabaseToken: string,
  ): Promise<{
    sessionToken: string;
    refreshToken: string;
    expiresAt: Date;
    userId: string;
    role: string;
  }> {
    let payload: SupabaseJwtPayload;
    try {
      payload = await this.verifyToken(supabaseToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired Supabase JWT');
    }

    const ttlSeconds = this.configService.get<number>('session.ttlSeconds') ?? 3600;
    const refreshTtlSeconds =
      this.configService.get<number>('session.refreshTokenTtlSeconds') ?? 604800;

    if (ttlSeconds < 300 || ttlSeconds > 86400) {
      throw new InternalServerErrorException(
        'SESSION_TTL_SECONDS must be between 300 and 86400',
      );
    }

    const resolvedUser = await this.resolveOrCreateUser(payload);
    const resolvedUserId = resolvedUser.userId;

    try {
      const sessionToken = randomUUID();
      const refreshToken = randomUUID();
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const refreshTokenExpiresAt = new Date(
        Date.now() + refreshTtlSeconds * 1000,
      );

      await this.db.insert(sessionTable).values({
        id: randomUUID(),
        userId: resolvedUserId,
        token: sessionToken,
        expiresAt,
        refreshToken,
        refreshTokenExpiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      this.logger.log(
        `Token exchange successful — userId=${resolvedUserId} role=${resolvedUser.role}`,
      );
      return {
        sessionToken,
        refreshToken,
        expiresAt,
        userId: resolvedUserId,
        role: resolvedUser.role,
      };
    } catch (err) {
      this.logger.error(
        `Database error minting session for userId=${resolvedUserId}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'Database error during token exchange',
      );
    }
  }

  async refreshSession(refreshToken: string): Promise<{
    sessionToken: string;
    refreshToken: string;
    expiresAt: Date;
    role: string;
  }> {
    const rows = await this.db
      .select()
      .from(sessionTable)
      .where(eq(sessionTable.refreshToken, refreshToken))
      .limit(1);

    if (!rows.length) {
      // Not an active token. Before treating this as theft, check whether
      // it's simply a retry of a refresh we already completed — the client
      // times out (Railway cold start is a known culprit), never sees our
      // response, and retries with the same now-rotated-away token. That's
      // not reuse, it's the same client asking again; hand back the session
      // we already created for it.
      const grace = await this.cache.get<RefreshGraceReplay>(
        `${REFRESH_GRACE_PREFIX}${refreshToken}`,
      );
      if (grace) {
        this.logger.log(
          `Refresh token replay within grace window — returning existing session for userId=${grace.userId}`,
        );
        return {
          sessionToken: grace.sessionToken,
          refreshToken: grace.refreshToken,
          expiresAt: new Date(grace.expiresAt),
          role: grace.role,
        };
      }

      const reusedUserId = await this.cache.get<string>(
        `${REFRESH_USED_PREFIX}${refreshToken}`,
      );
      if (reusedUserId) {
        this.logger.warn(
          `[SECURITY] Refresh token reuse detected outside the replay grace window — all sessions revoked for userId=${reusedUserId}`,
        );
        await this.db
          .delete(sessionTable)
          .where(eq(sessionTable.userId, reusedUserId));
        throw new UnauthorizedException(
          'Refresh token reuse detected. All sessions have been revoked.',
        );
      }
      this.logger.warn('Refresh token not found — token may be expired or invalid');
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const oldSession = rows[0];
    const now = new Date();
    
    const refreshExpiresTime = oldSession.refreshTokenExpiresAt
      ? Date.UTC(
          oldSession.refreshTokenExpiresAt.getFullYear(),
          oldSession.refreshTokenExpiresAt.getMonth(),
          oldSession.refreshTokenExpiresAt.getDate(),
          oldSession.refreshTokenExpiresAt.getHours(),
          oldSession.refreshTokenExpiresAt.getMinutes(),
          oldSession.refreshTokenExpiresAt.getSeconds(),
          oldSession.refreshTokenExpiresAt.getMilliseconds()
        )
      : 0;

    if (!refreshExpiresTime || refreshExpiresTime < Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const ttlSeconds =
      this.configService.get<number>('session.ttlSeconds') ?? 3600;
    const refreshTtlSeconds =
      this.configService.get<number>('session.refreshTokenTtlSeconds') ??
      604800;

    const newSessionToken = randomUUID();
    const newRefreshToken = randomUUID();
    const newExpiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const newRefreshTokenExpiresAt = new Date(
      Date.now() + refreshTtlSeconds * 1000,
    );

    const [refreshedUser] = await this.db
      .select({ role: userTable.role })
      .from(userTable)
      .where(eq(userTable.id, oldSession.userId))
      .limit(1);
    const role = refreshedUser?.role ?? 'user';

    // Rotate the *same* row in place — a single UPDATE is atomic by
    // construction, so there's never a window where the session exists
    // under neither the old nor the new token pair (the previous
    // insert-then-delete approach had exactly that window).
    await this.db
      .update(sessionTable)
      .set({
        token: newSessionToken,
        expiresAt: newExpiresAt,
        refreshToken: newRefreshToken,
        refreshTokenExpiresAt: newRefreshTokenExpiresAt,
        updatedAt: now,
      })
      .where(eq(sessionTable.id, oldSession.id));

    const gracePayload: RefreshGraceReplay = {
      userId: oldSession.userId,
      sessionToken: newSessionToken,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt.toISOString(),
      role,
    };
    await this.cache.set(
      `${REFRESH_GRACE_PREFIX}${refreshToken}`,
      gracePayload,
      REFRESH_GRACE_SECONDS,
    );
    // Longer-lived marker for genuine reuse detection once the grace
    // window above has passed.
    await this.cache.set(
      `${REFRESH_USED_PREFIX}${refreshToken}`,
      oldSession.userId,
      Math.floor(refreshTtlSeconds),
    );

    await this.cache.del(`session:user:${oldSession.token}`);

    this.logger.log(
      `Token refresh successful — userId=${oldSession.userId} role=${role}`,
    );
    return {
      sessionToken: newSessionToken,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt,
      role,
    };
  }
}
