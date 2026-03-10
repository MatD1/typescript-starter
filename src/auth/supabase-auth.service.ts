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
import { AuthService } from './auth.service';
import { DRIZZLE } from '../database/database.module';
import type { DrizzleDB } from '../database/database.module';
import {
  user as userTable,
  session as sessionTable,
} from '../database/schema/auth.schema';
import { randomUUID } from 'crypto';

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
  ) {}

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

  private async verifyToken(token: string): Promise<SupabaseJwtPayload> {
    const header = decodeProtectedHeader(token);
    const alg = header.alg;

    if (alg && ASYMMETRIC_ALGORITHMS.has(alg)) {
      const { payload } = await jwtVerify(token, this.getJwks());
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
    });
    return payload as SupabaseJwtPayload;
  }

  async exchangeSupabaseToken(
    supabaseToken: string,
  ): Promise<{ sessionToken: string; userId: string }> {
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

    try {
      const existingUsers = await this.db
        .select()
        .from(userTable)
        .where(eq(userTable.email, email))
        .limit(1);

      let userId: string;
      if (existingUsers.length > 0) {
        userId = existingUsers[0].id;
      } else {
        userId = randomUUID();
        await this.db.insert(userTable).values({
          id: userId,
          name,
          email,
          emailVerified: true,
          image: payload.user_metadata?.avatar_url ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const sessionToken = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await this.db.insert(sessionTable).values({
        id: randomUUID(),
        userId,
        token: sessionToken,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { sessionToken, userId };
    } catch (err) {
      throw new InternalServerErrorException(
        'Database error during token exchange',
      );
    }
  }
}
