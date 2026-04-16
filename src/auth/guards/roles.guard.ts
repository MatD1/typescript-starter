import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredRoles) {
            return true;
        }

        const req = this.getRequest(context);
        // Unify user object check. Both AdminGuard and ApiKeyGuard should attach to req.user
        const user = req.user || req.adminUser;

        if (!user) {
            return false;
        }

        // Check for role matches (for session users)
        if (user.role && requiredRoles.includes(user.role as Role)) {
            return true;
        }

        // Check for permission matches (for API key users)
        // We map 'admin' role to 'admin' permission for consistency
        const permissions = user.permissions || [];
        const hasPermission = requiredRoles.some((role) =>
            permissions.includes(role),
        );

        if (hasPermission) {
            return true;
        }

        throw new ForbiddenException(
            `Insufficient privileges. Required roles: ${requiredRoles.join(', ')}`,
        );
    }

    private getRequest(context: ExecutionContext): any {
        if (context.getType<string>() === 'graphql') {
            return GqlExecutionContext.create(context).getContext<{ req: any }>().req;
        }
        return context.switchToHttp().getRequest();
    }
}
