import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/errors';
import type { Actor } from '../common/actor';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 30;
const BCRYPT_COST = 12;
/** Compared against for unknown users so response time does not reveal valid usernames. */
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', BCRYPT_COST);

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const hashPassword = (p: string) => bcrypt.hash(p, BCRYPT_COST);

export function assertStrongPassword(p: string) {
  if (p.length < 8 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) throw new AppError('PASSWORD_WEAK');
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async login(username: string, password: string, ip: string, userAgent: string) {
    const user = await this.prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });
    const anon = { userId: user?.id ?? '', orgId: user?.orgId ?? '', username, ip, userAgent };
    if (!user || !user.active) {
      // Same error as a bad password so usernames cannot be probed.
      await bcrypt.compare(password, DUMMY_HASH);
      await this.prisma.$transaction((tx) => this.audit.record(tx, user ? anon : null, 'LOGIN_FAILED', 'User', user?.id ?? '', undefined, { username }));
      throw new AppError('LOGIN_INVALID', {}, HttpStatus.UNAUTHORIZED);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError('LOGIN_LOCKED', { until: user.lockedUntil.toISOString() }, HttpStatus.UNAUTHORIZED);
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      const failed = user.failedAttempts + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { failedAttempts: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null },
        });
        await this.audit.record(tx, anon, lock ? 'USER_LOCKED' : 'LOGIN_FAILED', 'User', user.id, undefined, { failedAttempts: failed });
      });
      throw new AppError(lock ? 'LOGIN_LOCKED' : 'LOGIN_INVALID', { remaining: String(MAX_FAILED_LOGINS - failed) }, HttpStatus.UNAUTHORIZED);
    }
    const token = randomBytes(32).toString('hex');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });
      await tx.session.create({ data: { id: hashToken(token), userId: user.id, ip, userAgent: userAgent.slice(0, 300) } });
      await this.audit.record(tx, anon, 'LOGIN', 'User', user.id);
    });
    return { token, user: this.publicUser(user) };
  }

  async logout(token: string, actor: Actor) {
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({ where: { id: hashToken(token) }, data: { revoked: true } });
      await this.audit.record(tx, actor, 'LOGOUT', 'User', actor.userId);
    });
  }

  /** Resolves a bearer token to an actor, enforcing idle timeout. */
  async resolve(token: string, ip: string, userAgent: string): Promise<Actor | null> {
    const s = await this.prisma.session.findUnique({ where: { id: hashToken(token) }, include: { user: { include: { org: true } } } });
    if (!s || s.revoked || !s.user.active) return null;
    const idleMs = s.user.org.sessionIdleMinutes * 60000;
    if (Date.now() - s.lastSeen.getTime() > idleMs) {
      await this.prisma.session.update({ where: { id: s.id }, data: { revoked: true } });
      return null;
    }
    if (Date.now() - s.lastSeen.getTime() > 30000) await this.prisma.session.update({ where: { id: s.id }, data: { lastSeen: new Date() } });
    const u = s.user;
    return { userId: u.id, orgId: u.orgId, username: u.username, fullName: u.fullName, post: u.post, role: u.role, ip, userAgent };
  }

  publicUser(u: { id: string; username: string; fullName: string; post: string; role: string; language: string; orgId: string }) {
    return { id: u.id, username: u.username, fullName: u.fullName, post: u.post, role: u.role, language: u.language, orgId: u.orgId };
  }
}
