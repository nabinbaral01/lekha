import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { AppError } from '../common/errors';
import { AUDITOR_WRITE_KEY, PUBLIC_KEY, ROLES_KEY } from '../common/actor';

export const SESSION_COOKIE = 'pa_session';

export function tokenFrom(req: Request): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE] ?? null;
}

/**
 * Global guard: authenticate, then authorise.
 *  - Auditor is strictly read-only: any non-GET request is refused unless explicitly allowed.
 *  - @Roles(...) restricts an endpoint further.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    const req = ctx.switchToHttp().getRequest<Request & { actor?: unknown }>();
    const token = tokenFrom(req);
    const actor = token ? await this.auth.resolve(token, req.ip ?? '', String(req.headers['user-agent'] ?? '')) : null;
    if (!actor) throw new AppError('SESSION_EXPIRED', {}, HttpStatus.UNAUTHORIZED);
    req.actor = actor;

    if (actor.role === 'AUDITOR' && req.method !== 'GET' && !this.reflector.getAllAndOverride<boolean>(AUDITOR_WRITE_KEY, targets)) {
      throw new AppError('AUDITOR_READ_ONLY', {}, HttpStatus.FORBIDDEN);
    }
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles && !roles.includes(actor.role)) throw new AppError('FORBIDDEN', {}, HttpStatus.FORBIDDEN);
    return true;
  }
}
