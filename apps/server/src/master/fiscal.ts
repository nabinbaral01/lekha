import type { FiscalYear } from '@prisma/client';
import { bsToAd, BS_MONTHS_NE, parseBs } from '@pa/core';
import type { Tx } from '../prisma.service';
import { AppError } from '../common/errors';

/** BS date -> JS Date at UTC midnight of the AD day (stored in DATE columns). */
export function adDate(bs: string): Date {
  return new Date(`${bsToAd(bs)}T00:00:00Z`);
}

/** The fiscal year containing a BS date. Entries are only allowed inside a defined, open fiscal year. */
export async function findFiscalYear(tx: Tx, orgId: string, dateBs: string): Promise<FiscalYear> {
  const d = adDate(dateBs);
  const fy = await tx.fiscalYear.findFirst({ where: { orgId, startAd: { lte: d }, endAd: { gte: d } } });
  if (!fy) throw new AppError('DATE_OUTSIDE_FISCAL_YEAR', { date: dateBs });
  return fy;
}

export async function assertPeriodOpen(tx: Tx, fy: FiscalYear, dateBs: string) {
  if (fy.closed) throw new AppError('FISCAL_YEAR_CLOSED', { fy: fy.code });
  const b = parseBs(dateBs);
  const lock = await tx.periodLock.findUnique({ where: { fiscalYearId_bsYear_bsMonth: { fiscalYearId: fy.id, bsYear: b.y, bsMonth: b.m } } });
  if (lock) throw new AppError('PERIOD_LOCKED', { month: `${BS_MONTHS_NE[b.m - 1]} ${b.y}` });
}
