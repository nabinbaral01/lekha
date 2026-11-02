import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import { AuthService, assertStrongPassword, hashPassword } from './auth.service';
import { SESSION_COOKIE, tokenFrom } from './auth.guard';
import { Actor, AllowAuditorWrite, CurrentActor, Public } from '../common/actor';
import { parse } from '../common/zod';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/errors';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Public()
  @Post('login')
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { username, password } = parse(z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) }), body);
    const r = await this.auth.login(username, password, req.ip ?? '', String(req.headers['user-agent'] ?? ''));
    res.cookie(SESSION_COOKIE, r.token, { httpOnly: true, sameSite: 'strict', path: '/' });
    return r;
  }

  @AllowAuditorWrite()
  @Post('logout')
  async logout(@Req() req: Request, @CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response) {
    const t = tokenFrom(req);
    if (t) await this.auth.logout(t, actor);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentActor() actor: Actor) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    return this.auth.publicUser(u);
  }

  @AllowAuditorWrite()
  @Patch('me/language')
  async language(@Body() body: unknown, @CurrentActor() actor: Actor) {
    const { language } = parse(z.object({ language: z.enum(['ne', 'en']) }), body);
    await this.prisma.user.update({ where: { id: actor.userId }, data: { language } });
    return { language };
  }

  @AllowAuditorWrite()
  @Patch('me/password')
  async password(@Body() body: unknown, @CurrentActor() actor: Actor) {
    const { current, next } = parse(z.object({ current: z.string(), next: z.string().max(200) }), body);
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!(await bcrypt.compare(current, u.passwordHash))) throw new AppError('PASSWORD_CURRENT_WRONG');
    assertStrongPassword(next);
    const passwordHash = await hashPassword(next);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { passwordHash } });
      await this.audit.record(tx, actor, 'PASSWORD_CHANGE', 'User', u.id);
    });
    return { ok: true };
  }
}
