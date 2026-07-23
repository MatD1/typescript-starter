import { All, Controller, Next, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response, NextFunction } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';

@Public()
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 900_000 } })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

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
    const path = req.path;
    const action = path.includes('sign-up')
      ? AUDIT_ACTIONS.AUTH_SIGNUP_SUCCEEDED
      : path.includes('sign-in')
        ? AUDIT_ACTIONS.AUTH_LOGIN_SUCCEEDED
        : path.includes('sign-out')
          ? AUDIT_ACTIONS.AUTH_LOGOUT_SUCCEEDED
          : undefined;
    if (action) {
      res.once('finish', () => {
        void this.audit.recordBestEffort({
          category: 'authentication',
          action:
            res.statusCode >= 400 && path.includes('sign-in')
              ? AUDIT_ACTIONS.AUTH_LOGIN_FAILED
              : action,
          outcome: res.statusCode >= 400 ? 'failed' : 'succeeded',
          severity: res.statusCode >= 400 ? 'warning' : 'info',
          actor: { type: 'anonymous' },
          source: 'auth',
          metadata: { statusCode: res.statusCode, authRoute: path },
        });
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return toNodeHandler(this.authService.auth)(req, res);
  }
}
