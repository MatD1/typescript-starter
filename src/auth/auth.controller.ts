import { All, Controller, Next, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response, NextFunction } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';

@Public()
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 900_000 } })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @All('*path')
  async handleAuth(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    if (
      req.path.startsWith('/auth/supabase/') ||
      req.path === '/auth/refresh'
    ) {
      return next();
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return toNodeHandler(this.authService.auth)(req, res);
  }
}
