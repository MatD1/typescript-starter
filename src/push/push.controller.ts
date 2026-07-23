import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { Request } from 'express';
import { PushService } from './push.service';

class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  fcmToken!: string;

  @IsOptional()
  @IsIn(['ios', 'android'])
  platform?: string;
}

/** Any signed-in user can register their own device — no admin guard, just the standard auth guard already applied globally. */
@ApiTags('push')
@ApiBearerAuth()
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('devices')
  @ApiOperation({
    summary: 'Register this device for push notifications',
    description:
      'Upserts the FCM token for the current device against the authenticated user. Call whenever the FCM SDK reports a token (including rotations).',
  })
  async registerDevice(@Req() req: Request, @Body() dto: RegisterDeviceDto) {
    const user = (req as unknown as Record<string, unknown>)['user'] as
      | { userId: string }
      | undefined;
    await this.pushService.registerDeviceToken(
      user?.userId ?? '',
      dto.fcmToken,
      dto.platform,
    );
    return { success: true };
  }
}
