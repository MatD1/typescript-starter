import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { DRIZZLE } from '../database/database.module';
import type { DrizzleDB } from '../database/database.module';
import * as authSchema from '../database/schema/auth.schema';

@Injectable()
export class AuthService implements OnModuleInit {
  auth!: any;

  constructor(
    private readonly configService: ConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  onModuleInit() {
    const baseURL =
      this.configService.get<string>('auth.url') ?? 'http://localhost:3000';
    const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);

    this.auth = betterAuth({
      secret: this.configService.get<string>('auth.secret'),
      baseURL,
      basePath: '/auth',
      trustedOrigins: [baseURL, ...extraOrigins],

      // Disable CSRF check in development so API testing tools (Postman,
      // curl, Insomnia) work without needing to send an Origin header.
      // In production the check stays on for proper CSRF protection.
      advanced: {
        disableCSRFCheck: process.env.NODE_ENV !== 'production',
      },

      database: drizzleAdapter(this.db, {
        provider: 'pg',
        schema: {
          user: authSchema.user,
          session: authSchema.session,
          account: authSchema.account,
          verification: authSchema.verification,
        },
      }),

      emailAndPassword: {
        enabled: true,
      },
    });
  }
}
