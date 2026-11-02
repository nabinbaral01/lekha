import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService, Tx } from '../prisma.service';
import type { Actor } from '../common/actor';

const GENESIS = '0'.repeat(64);
/** Fixed advisory-lock key serialising audit inserts so the hash chain has no forks. */
const AUDIT_LOCK = 774411;

function plain(v: unknown): unknown {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/** Key-sorted JSON so the hash is identical before and after a jsonb round-trip (jsonb reorders keys). */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(',')}}`;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append an audit record inside the caller's transaction, so the business change and its
   * log entry commit (or roll back) together. Each row's hash covers the previous row's hash,
   * so any tampering with history at the database level is detectable via verifyChain().
   */
  async record(
    tx: Tx,
    actor: Pick<Actor, 'userId' | 'orgId' | 'username' | 'ip' | 'userAgent'> | null,
    action: string,
    entity: string,
    entityId: string,
    before?: unknown,
    after?: unknown,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK})`;
    const last = await tx.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
    const prevHash = last?.hash ?? GENESIS;
    const at = new Date();
    const b = plain(before) ?? null;
    const a = plain(after) ?? null;
    const payload = canonical([prevHash, at.toISOString(), actor?.userId ?? null, action, entity, entityId, b, a]);
    const hash = createHash('sha256').update(payload).digest('hex');
    await tx.auditLog.create({
      data: {
        orgId: actor?.orgId ?? null,
        userId: actor?.userId ?? null,
        username: actor?.username ?? '',
        ip: actor?.ip ?? '',
        userAgent: (actor?.userAgent ?? '').slice(0, 300),
        action,
        entity,
        entityId,
        before: b as never,
        after: a as never,
        at,
        prevHash,
        hash,
      },
    });
  }

  /** Recomputes the hash chain. Returns the id of the first broken row, or null if intact. */
  async verifyChain(): Promise<number | null> {
    let prev = GENESIS;
    let cursor = 0;
    for (;;) {
      const rows = await this.prisma.auditLog.findMany({ where: { id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 1000 });
      if (!rows.length) return null;
      for (const r of rows) {
        const payload = canonical([prev, r.at.toISOString(), r.userId, r.action, r.entity, r.entityId, r.before ?? null, r.after ?? null]);
        const h = createHash('sha256').update(payload).digest('hex');
        if (r.prevHash !== prev || r.hash !== h) return r.id;
        prev = r.hash;
        cursor = r.id;
      }
    }
  }
}
