import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from '../database/database.module';
import { CacheModule } from '../cache/cache.module';
import { AuthModule } from '../auth/auth.module';
import { GtfsStaticModule } from '../gtfs-static/gtfs-static.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminResolver } from './admin.resolver';
import { AdminGuard } from '../auth/guards/admin.guard';

@Module({
  imports: [
    DatabaseModule,
    CacheModule,
    AuthModule,
    GtfsStaticModule,
    HttpModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminResolver],
})
export class AdminModule {}
