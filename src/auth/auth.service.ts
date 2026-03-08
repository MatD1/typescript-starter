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
    this.auth = betterAuth({
      secret: this.configService.get<string>('auth.secret'),
      baseURL: this.configService.get<string>('auth.url'),
      basePath: '/auth',

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
