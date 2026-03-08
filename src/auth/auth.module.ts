import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SupabaseAuthService } from './supabase-auth.service';
import { SupabaseAuthController } from './supabase-auth.controller';
import { ApiKeyService } from './api-key.service';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  controllers: [AuthController, SupabaseAuthController, ApiKeyController],
  providers: [AuthService, SupabaseAuthService, ApiKeyService, ApiKeyGuard],
  exports: [AuthService, ApiKeyService, ApiKeyGuard],
})
export class AuthModule {}
