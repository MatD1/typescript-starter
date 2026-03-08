import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { AuthService } from './auth.service';
import { DRIZZLE } from '../database/database.module';
import type { DrizzleDB } from '../database/database.module';
import {
  user as userTable,
  session as sessionTable,
} from '../database/schema/auth.schema';
import { randomUUID } from 'crypto';

interface SupabaseJwtPayload extends jwt.JwtPayload {
  sub: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string; avatar_url?: string };
}

@Injectable()
export class SupabaseAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  async exchangeSupabaseToken(
    supabaseToken: string,
  ): Promise<{ sessionToken: string; userId: string }> {
    const jwtSecret = this.configService.get<string>('supabase.jwtSecret');
    if (!jwtSecret) {
      throw new UnauthorizedException('Supabase JWT secret not configured');
    }

    let payload: SupabaseJwtPayload;
    try {
      payload = jwt.verify(supabaseToken, jwtSecret, {
        algorithms: ['HS256'],
      }) as SupabaseJwtPayload;
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
  }
}
