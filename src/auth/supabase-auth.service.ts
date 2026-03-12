import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  jwtVerify,
  createRemoteJWKSet,
  decodeProtectedHeader,
  type JWTPayload,
} from 'jose';
import { eq } from 'drizzle-orm';

const REFRESH_USED_PREFIX = 'refresh:used:';
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
}

const ASYMMETRIC_ALGORITHMS = new Set(['ES256', 'RS256', 'EdDSA']);

@Injectable()
export class SupabaseAuthService {
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

  private async verifyToken(token: string): Promise<SupabaseJwtPayload> {
    const header = decodeProtectedHeader(token);
    const alg = header.alg;
    const verifyOptions = this.getVerifyOptions();

    if (alg && ASYMMETRIC_ALGORITHMS.has(alg)) {
      const { payload } = await jwtVerify(token, this.getJwks(), verifyOptions);
      return payload as SupabaseJwtPayload;
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

    const email = payload.email;
    if (!email) {
      throw new UnauthorizedException('Supabase JWT missing email claim');
    }

    const name =
      payload.user_metadata?.full_name ??
      payload.user_metadata?.name ??
      email.split('@')[0];

    const ttlSeconds = this.configService.get<number>('session.ttlSeconds') ?? 3600;
    const refreshTtlSeconds =
      this.configService.get<number>('session.refreshTokenTtlSeconds') ?? 604800;

    if (ttlSeconds < 300 || ttlSeconds > 86400) {
      throw new InternalServerErrorException(
        'SESSION_TTL_SECONDS must be between 300 and 86400',
      );
    }

    try {
      await this.db
        .insert(userTable)
        .values({
          id: randomUUID(),
          name,
          email,
          emailVerified: true,
          image: payload.user_metadata?.avatar_url ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing({ target: userTable.email });

      const [resolvedUser] = await this.db
        .select()
        .from(userTable)
        .where(eq(userTable.email, email))
        .limit(1);

      if (!resolvedUser) {
        throw new InternalServerErrorException('Failed to find or create user');
      }

      const resolvedUserId = resolvedUser.id;

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

      return { sessionToken, refreshToken, expiresAt, userId: resolvedUserId, role: resolvedUser.role };
    } catch (err) {
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
      const reusedUserId = await this.cache.get<string>(
        `${REFRESH_USED_PREFIX}${refreshToken}`,
      );
      if (reusedUserId) {
        await this.db
          .delete(sessionTable)
          .where(eq(sessionTable.userId, reusedUserId));
        throw new UnauthorizedException(
          'Refresh token reuse detected. All sessions have been revoked.',
        );
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const oldSession = rows[0];
    const now = new Date();

    if (
      !oldSession.refreshTokenExpiresAt ||
      oldSession.refreshTokenExpiresAt < now
    ) {
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

    await this.db.insert(sessionTable).values({
      id: randomUUID(),
      userId: oldSession.userId,
      token: newSessionToken,
      expiresAt: newExpiresAt,
      refreshToken: newRefreshToken,
      refreshTokenExpiresAt: newRefreshTokenExpiresAt,
      createdAt: now,
      updatedAt: now,
    });

    await this.cache.set(
      `${REFRESH_USED_PREFIX}${refreshToken}`,
      oldSession.userId,
      Math.floor(refreshTtlSeconds),
    );

    await this.db.delete(sessionTable).where(eq(sessionTable.id, oldSession.id));

    await this.cache.del(`session:user:${oldSession.token}`);

    const [refreshedUser] = await this.db
      .select({ role: userTable.role })
      .from(userTable)
      .where(eq(userTable.id, oldSession.userId))
      .limit(1);

    return {
      sessionToken: newSessionToken,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt,
      role: refreshedUser?.role ?? 'user',
    };
  }
}
