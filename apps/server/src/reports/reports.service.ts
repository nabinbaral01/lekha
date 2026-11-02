import { Injectable } from '@nestjs/common';
import { CashBookColumns, cashBookColumns, parseBs } from '@pa/core';
import { PrismaService } from '../prisma.service';
import type { Actor } from '../common/actor';
import { NotFound } from '../common/errors';
import { adDate } from '../master/fiscal';
import { allocations, netByAccount, openings } from '../vouchers/ledger';

type Cols = CashBookColumns;
const zero = (): Cols => ({ cashDr: 0n, cashCr: 0n, bankDr: 0n, bankCr: 0n, budgetExpense: 0n, advanceGiven: 0n, advanceSettled: 0n, miscDr: 0n, miscCr: 0n });
function add(a: Cols, b: Cols) {
  for (const k of Object.keys(a) as (keyof Cols)[]) a[k] += b[k];
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async scope(actor: Actor, fundId: string | null, fiscalYearId: string) {
    const fy = await this.prisma.fiscalYear.findFirst({ where: { id: fiscalYearId, orgId: actor.orgId } });
    if (!fy) throw NotFound('FISCAL_YEAR_NOT_FOUND');
    const fund = fundId ? await this.prisma.fund.findFirst({ where: { id: fundId, orgId: actor.orgId } }) : null;
    if (fundId && !fund) throw NotFound('FUND_NOT_FOUND');
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: actor.orgId } });
    return { fy, fund, org };
  }

  /**
   * बैंक नगदी किताब. fundId null = consolidated across all funds (true balance of the shared bank account).
   * Opening row "मौज्दात जिम्मेवारी", then every approved voucher in date order with running cash and
   * bank balances to the paisa, monthly totals and carried-forward balances.
   */
  async cashBook(actor: Actor, fundId: string | null, fiscalYearId: string, fromBs?: string, toBs?: string) {
    const { fy, fund, org } = await this.scope(actor, fundId, fiscalYearId);
    const accounts = await this.prisma.ledgerAccount.findMany({ where: { orgId: actor.orgId, kind: { in: ['BANK', 'CASH'] } } });
    const bankIds = new Set(accounts.filter((a) => a.kind === 'BANK').map((a) => a.id));
    const cashIds = new Set(accounts.filter((a) => a.kind === 'CASH').map((a) => a.id));

    const open = await openings(this.prisma, fy.id, fundId);
    let bank = [...bankIds].reduce((s, id) => s + (open.get(id) ?? 0n), 0n);
    let cash = [...cashIds].reduce((s, id) => s + (open.get(id) ?? 0n), 0n);
    const fromAd = fromBs ? adDate(fromBs) : undefined;
    const toAd = toBs ? adDate(toBs) : undefined;
    if (fromAd) {
      const before = await netByAccount(this.prisma, fy.id, fundId, { kinds: ['BANK', 'CASH'], toAd: new Date(fromAd.getTime() - 86400000) });
      for (const [id, n] of before) bankIds.has(id) ? (bank += n) : cashIds.has(id) ? (cash += n) : 0;
    }
    const opening = { cash, bank, dateBs: fromBs ?? (await this.openingDate(fy.id, fundId)) ?? fy.startBs };

    const vouchers = await this.prisma.voucher.findMany({
      where: { orgId: actor.orgId, fiscalYearId: fy.id, status: 'APPROVED', ...(fundId ? { fundId } : {}), dateAd: { ...(fromAd ? { gte: fromAd } : {}), ...(toAd ? { lte: toAd } : {}) } },
      include: { lines: true, fund: { select: { source: true, nature: true } } },
      orderBy: [{ dateAd: 'asc' }, { fundId: 'asc' }, { number: 'asc' }],
    });

    const months: { y: number; m: number; rows: unknown[]; totals: Cols; closing: { cash: bigint; bank: bigint } }[] = [];
    const grand = zero();
    for (const v of vouchers) {
      const c = cashBookColumns(v.lines);
      cash += c.cashDr - c.cashCr;
      bank += c.bankDr - c.bankCr;
      const { y, m } = parseBs(v.dateBs);
      let month = months[months.length - 1];
      if (!month || month.y !== y || month.m !== m) months.push((month = { y, m, rows: [], totals: zero(), closing: { cash, bank } }));
      month.rows.push({ voucherId: v.id, number: v.number, dateBs: v.dateBs, narration: v.narration, chequeNo: v.eftRef, fund: v.fund, ...c, cashBalance: cash, bankBalance: bank });
      add(month.totals, c);
      add(grand, c);
      month.closing = { cash, bank };
    }
    return {
      org: { nameNe: org.nameNe, nameEn: org.nameEn, districtNe: org.districtNe, districtEn: org.districtEn, accountsHeadName: org.accountsHeadName, accountsHeadPost: org.accountsHeadPost, officeHeadName: org.officeHeadName, officeHeadPost: org.officeHeadPost },
      fiscalYear: { id: fy.id, code: fy.code },
      fund,
      fromBs: fromBs ?? null,
      toBs: toBs ?? null,
      opening,
      months,
      totals: grand,
      closing: { cash, bank },
    };
  }

  private async openingDate(fiscalYearId: string, fundId: string | null) {
    const o = await this.prisma.openingBalance.findFirst({ where: { fiscalYearId, ...(fundId ? { fundId } : {}) }, orderBy: { dateBs: 'asc' } });
    return o?.dateBs;
  }

  /** हिसाब विवरण: विनियोजित / जम्मा खर्च / बचत per head. बचत is always computed, never typed. */
  async budgetStatement(actor: Actor, fundId: string, fiscalYearId: string, fromBs?: string, toBs?: string) {
    const { fy, fund, org } = await this.scope(actor, fundId, fiscalYearId);
    const alloc = await allocations(this.prisma, fy.id, fundId);
    const spent = await netByAccount(this.prisma, fy.id, fundId, { kinds: ['EXPENSE'], fromAd: fromBs ? adDate(fromBs) : undefined, toAd: toBs ? adDate(toBs) : undefined });
    const ids = new Set([...alloc.keys(), ...spent.keys()]);
    const heads = await this.prisma.ledgerAccount.findMany({ where: { id: { in: [...ids] } }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
    let tA = 0n;
    let tS = 0n;
    const rows = heads.map((h, i) => {
      const allocated = alloc.get(h.id) ?? 0n;
      const s = spent.get(h.id) ?? 0n;
      tA += allocated;
      tS += s;
      return { sn: i + 1, accountId: h.id, code: h.code, nameNe: h.nameNe, nameEn: h.nameEn, allocated, spent: s, saving: allocated - s };
    });
    return {
      org: { nameNe: org.nameNe, nameEn: org.nameEn, districtNe: org.districtNe, districtEn: org.districtEn, addressNe: org.addressNe, addressEn: org.addressEn },
      fiscalYear: { id: fy.id, code: fy.code },
      fund,
      fromBs: fromBs ?? null,
      toBs: toBs ?? null,
      rows,
      totals: { allocated: tA, spent: tS, saving: tA - tS },
    };
  }

  /**
   * Daily money flow per fund (approved vouchers only) for the trend charts:
   * expense = net budget expense, paid = net outflow from bank + cash, tds = TDS withheld.
   * The client buckets these into BS months or weeks; amounts stay exact (paisa).
   */
  async trend(actor: Actor, fiscalYearId: string, fundId: string | null) {
    const { fy } = await this.scope(actor, fundId, fiscalYearId);
    const vouchers = await this.prisma.voucher.findMany({
      where: { orgId: actor.orgId, fiscalYearId: fy.id, status: 'APPROVED', ...(fundId ? { fundId } : {}) },
      select: { dateBs: true, fundId: true, lines: { select: { side: true, accountKind: true, accountId: true, amount: true } } },
      orderBy: { dateAd: 'asc' },
    });
    const days = new Map<string, { dateBs: string; fundId: string; expense: bigint; paid: bigint; tds: bigint }>();
    for (const v of vouchers) {
      const key = `${v.dateBs}|${v.fundId}`;
      const d = days.get(key) ?? { dateBs: v.dateBs, fundId: v.fundId, expense: 0n, paid: 0n, tds: 0n };
      const c = cashBookColumns(v.lines);
      d.expense += c.budgetExpense;
      d.paid += c.bankCr - c.bankDr + c.cashCr - c.cashDr;
      for (const l of v.lines) if (l.accountKind === 'TDS_PAYABLE' && l.side === 'CR') d.tds += l.amount;
      days.set(key, d);
    }
    const alloc = fundId ? [...(await allocations(this.prisma, fy.id, fundId)).values()].reduce((s, x) => s + x, 0n) : null;
    return { fiscalYear: { id: fy.id, code: fy.code, startYear: fy.startYear, startBs: fy.startBs, endBs: fy.endBs }, allocated: alloc, days: [...days.values()] };
  }

  /** Home/fund cards: budget, spending, bank share, workflow counts and pending TDS per fund. */
  async fundSummaries(actor: Actor, fiscalYearId: string) {
    const funds = await this.prisma.fund.findMany({ where: { orgId: actor.orgId } });
    const bankAccs = await this.prisma.ledgerAccount.findMany({ where: { orgId: actor.orgId, kind: 'BANK' }, select: { id: true } });
    const out = [];
    for (const f of funds) {
      const alloc = await allocations(this.prisma, fiscalYearId, f.id);
      const spent = await netByAccount(this.prisma, fiscalYearId, f.id, { kinds: ['EXPENSE'] });
      const open = await openings(this.prisma, fiscalYearId, f.id);
      const bankNet = await netByAccount(this.prisma, fiscalYearId, f.id, { kinds: ['BANK'] });
      const bank = bankAccs.reduce((s, a) => s + (open.get(a.id) ?? 0n) + (bankNet.get(a.id) ?? 0n), 0n);
      const counts = await this.prisma.voucher.groupBy({ by: ['status'], where: { fundId: f.id, fiscalYearId }, _count: true });
      const rejected = await this.prisma.voucher.count({ where: { fundId: f.id, fiscalYearId, status: 'DRAFT', rejectComment: { not: null } } });
      const deposited = (await this.prisma.voucher.findMany({ where: { fundId: f.id, mode: 'TAX_DEPOSIT', status: 'APPROVED' }, select: { id: true } })).map((x) => x.id);
      const tds = await this.prisma.voucherPayee.aggregate({
        where: { tds: { gt: 0 }, voucher: { fundId: f.id, fiscalYearId, status: 'APPROVED' }, OR: [{ depositVoucherId: null }, { depositVoucherId: { notIn: deposited } }] },
        _sum: { tds: true },
      });
      const sum = (m: Map<string, bigint>) => [...m.values()].reduce((s, v) => s + v, 0n);
      out.push({
        fund: f,
        allocated: sum(alloc),
        spent: sum(spent),
        bank,
        pendingTds: tds._sum.tds ?? 0n,
        counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
        rejected,
      });
    }
    return out;
  }
}
