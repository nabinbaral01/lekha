import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

export interface Actor {
  userId: string;
  orgId: string;
  username: string;
  fullName: string;
  post: string;
  role: Role;
  ip: string;
  userAgent: string;
}

export const CurrentActor = createParamDecorator((_d: unknown, ctx: ExecutionContext): Actor => ctx.switchToHttp().getRequest().actor);

export const ROLES_KEY = 'roles';
/** Restrict an endpoint to the given roles. Without it any logged-in user may call it (subject to the read-only auditor rule). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const PUBLIC_KEY = 'public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);
/** Allow a non-GET endpoint for auditors (e.g. logout, language, print log). */
export const AUDITOR_WRITE_KEY = 'auditorWrite';
export const AllowAuditorWrite = () => SetMetadata(AUDITOR_WRITE_KEY, true);
