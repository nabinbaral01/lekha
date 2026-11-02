import { Prisma } from '@prisma/client';
import type { Tx } from '../prisma.service';

/**
 * Ledger queries. Books are never stored separately: they are always derived from APPROVED
 * voucher lines, so a voucher entry is the single source of truth for every book and report.
 */

interface DateRange {
  fromAd?: Date;
  toAd?: Date;
}

function dateFilter(r: DateRange) {
  return Prisma.sql`${r.fromAd ? Prisma.sql`AND v."dateAd" >= ${r.fromAd}` : Prisma.empty} ${r.toAd ? Prisma.sql`AND v."dateAd" <= ${r.toAd}` : Prisma.empty}`;
}

/** Net (DR − CR) of approved lines per account. fundId null = all funds (shared bank account). */
export async function netByAccount(
  tx: Tx,
  fiscalYearId: string,
  fundId: string | null,
  opts: DateRange & { kinds?: string[]; accountIds?: string[]; excludeVoucherId?: string } = {},
): Promise<Map<string, bigint>> {
  const rows = await tx.$queryRaw<{ accountId: string; net: bigint }[]>`
    SELECT l."accountId", SUM(CASE WHEN l.side = 'DR' THEN l.amount ELSE -l.amount END)::bigint AS net
    FROM "VoucherLine" l JOIN "Voucher" v ON v.id = l."voucherId"
    WHERE v.status = 'APPROVED' AND v."fiscalYearId" = ${fiscalYearId}
      ${fundId ? Prisma.sql`AND v."fundId" = ${fundId}` : Prisma.empty}
      ${opts.kinds?.length ? Prisma.sql`AND l."accountKind"::text IN (${Prisma.join(opts.kinds)})` : Prisma.empty}
      ${opts.accountIds?.length ? Prisma.sql`AND l."accountId" IN (${Prisma.join(opts.accountIds)})` : Prisma.empty}
      ${opts.excludeVoucherId ? Prisma.sql`AND v.id <> ${opts.excludeVoucherId}` : Prisma.empty}
      ${dateFilter(opts)}
    GROUP BY l."accountId"`;
  return new Map(rows.map((r) => [r.accountId, BigInt(r.net)]));
}

/** Net expense per head for vouchers in the given statuses (used for pending/committed budget). */
export async function expenseByStatus(tx: Tx, fiscalYearId: string, fundId: string, statuses: string[], excludeVoucherId?: string) {
  const rows = await tx.$queryRaw<{ accountId: string; net: bigint }[]>`
    SELECT l."accountId", SUM(CASE WHEN l.side = 'DR' THEN l.amount ELSE -l.amount END)::bigint AS net
    FROM "VoucherLine" l JOIN "Voucher" v ON v.id = l."voucherId"
    WHERE v."fiscalYearId" = ${fiscalYearId} AND v."fundId" = ${fundId} AND l."accountKind" = 'EXPENSE'
      AND v.status::text IN (${Prisma.join(statuses)})
      ${excludeVoucherId ? Prisma.sql`AND v.id <> ${excludeVoucherId}` : Prisma.empty}
    GROUP BY l."accountId"`;
  return new Map(rows.map((r) => [r.accountId, BigInt(r.net)]));
}

/** Appropriation per head = SUM of budget entries (appropriation, transfers, additions, reductions). */
export async function allocations(tx: Tx, fiscalYearId: string, fundId: string): Promise<Map<string, bigint>> {
  const rows = await tx.budgetEntry.groupBy({ by: ['accountId'], where: { fiscalYearId, fundId }, _sum: { amount: true } });
  return new Map(rows.map((r) => [r.accountId, r._sum.amount ?? 0n]));
}

/** Opening balances (DR positive) per account; fundId null = all funds. */
export async function openings(tx: Tx, fiscalYearId: string, fundId: string | null): Promise<Map<string, bigint>> {
  const rows = await tx.openingBalance.groupBy({
    by: ['accountId'],
    where: { fiscalYearId, ...(fundId ? { fundId } : {}) },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.accountId, r._sum.amount ?? 0n]));
}

/** Current balance of one account across ALL funds (the bank account is shared). */
export async function accountBalance(tx: Tx, fiscalYearId: string, accountId: string): Promise<bigint> {
  const open = (await openings(tx, fiscalYearId, null)).get(accountId) ?? 0n;
  const net = (await netByAccount(tx, fiscalYearId, null, { accountIds: [accountId] })).get(accountId) ?? 0n;
  return open + net;
}
