import { HttpStatus, Injectable } from '@nestjs/common';
import { AccountKind, LedgerAccount, Prisma, Side, VoucherType } from '@prisma/client';
import {
  amountInWords, buildPaymentLines, buildTaxDepositLines, computeTds, formatNepali, isValidPan, LineLike, parseBs, validateLines,
  ValidationIssue, voucherTotals,
} from '@pa/core';
import { PrismaService, Tx } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError, Conflict, Forbidden, NotFound } from '../common/errors';
import type { Actor } from '../common/actor';
import { accountBalance, allocations, expenseByStatus, netByAccount } from './ledger';
import { adDate, findFiscalYear, assertPeriodOpen } from '../master/fiscal';

export interface SourceCols {
  activityNo?: string;
  componentNo?: string;
  src1Agency?: string;
  src1Method?: string;
  src2Agency?: string;
  src2Method?: string;
}
export interface LineInput extends SourceCols {
  side: Side;
  accountId: string;
  amount: bigint;
}
export interface PaymentPayeeInput {
  payeeId: string;
  billNo?: string;
  billDateBs?: string;
  gross: bigint;
  vatIncluded: boolean;
  taxCode: string;
  tdsOverride?: bigint;
  tdsOverrideReason?: string;
}
export interface ManualPayeeInput {
  payeeId?: string;
  name: string;
  pan?: string;
  bankName?: string;
  accountNo?: string;
  amount: bigint;
  eftRef?: string;
}
export interface VoucherInput {
  type: VoucherType;
  dateBs: string;
  budgetSubHeadId?: string | null;
  projectName?: string;
  eftRef?: string;
  narration: string;
  mode: 'PAYMENT' | 'MANUAL';
  payment?: SourceCols & {
    expenseAccountId: string;
    bankAccountId?: string;
    paymentMethod: 'EFT' | 'CHEQUE';
    payees: PaymentPayeeInput[];
  };
  lines?: LineInput[];
  payees?: ManualPayeeInput[];
  /** User has seen the duplicate-bill warning and confirms. */
  confirmDuplicate?: boolean;
}

type LineData = Omit<Prisma.VoucherLineCreateManyInput, 'voucherId'>;
type PayeeData = Omit<Prisma.VoucherPayeeCreateManyInput, 'voucherId'>;

interface Composed {
  fiscalYearId: string;
  dateAd: Date;
  lines: LineData[];
  payees: PayeeData[];
  total: bigint;
  warnings: ValidationIssue[];
}

const fail = (code: string, params: Record<string, string> = {}) => new AppError(code, params);
const invalid = (issues: ValidationIssue[]) => new AppError('VOUCHER_INVALID', {}, HttpStatus.BAD_REQUEST, issues);

const voucherInclude = {
  lines: { orderBy: { lineNo: 'asc' } },
  payees: { orderBy: { sn: 'asc' } },
  fund: true,
  attachments: { select: { id: true, kind: true, fileName: true, mime: true, size: true, uploadedAt: true } },
} satisfies Prisma.VoucherInclude;

@Injectable()
export class VouchersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  // ───────────────────────────── composition & validation ─────────────────────────────

  private async fundOf(tx: Tx, orgId: string, fundId: string) {
    const fund = await tx.fund.findFirst({ where: { id: fundId, orgId } });
    if (!fund) throw NotFound('FUND_NOT_FOUND');
    return fund;
  }

  private async accountsById(tx: Tx, orgId: string, ids: string[]) {
    const list = await tx.ledgerAccount.findMany({ where: { orgId, id: { in: [...new Set(ids)] } } });
    return new Map(list.map((a) => [a.id, a]));
  }

  private async defaultAccount(tx: Tx, orgId: string, kind: AccountKind, code: string) {
    const list = await tx.ledgerAccount.findMany({ where: { orgId, kind, active: true }, orderBy: { sortOrder: 'asc' } });
    if (list.length !== 1) throw fail(code);
    return list[0];
  }

  /** Tax rule in force for a code on a date (latest effectiveFrom <= date). */
  async taxRuleOn(tx: Tx, orgId: string, code: string, dateAd: Date) {
    const rule = await tx.taxRule.findFirst({ where: { orgId, code, effectiveFromAd: { lte: dateAd } }, orderBy: { effectiveFromAd: 'desc' } });
    if (!rule) throw fail('TAX_RULE_NOT_FOUND', { code });
    return rule;
  }

  /**
   * Turns user input into exact voucher lines + payee rows, enforcing every structural rule.
   * The same function backs preview, create and update, so what the user previews is exactly what is saved.
   */
  async compose(tx: Tx, orgId: string, fundId: string, input: VoucherInput, voucherId?: string): Promise<Composed> {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
    const fund = await this.fundOf(tx, orgId, fundId);
    parseBs(input.dateBs);
    const fy = await findFiscalYear(tx, orgId, input.dateBs);
    await assertPeriodOpen(tx, fy, input.dateBs);
    const dateAd = adDate(input.dateBs);
    if (!input.narration?.trim()) throw fail('NARRATION_REQUIRED');
    if (input.budgetSubHeadId && !(await tx.budgetSubHead.findFirst({ where: { id: input.budgetSubHeadId, orgId } }))) throw fail('SUBHEAD_NOT_FOUND');

    const issues: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    let lines: (LineLike & SourceCols)[] = [];
    let payees: PayeeData[] = [];

    if (input.mode === 'PAYMENT') {
      const p = input.payment;
      if (!p || !p.payees.length) throw fail('PAYMENT_PAYEE_REQUIRED');
      const bank = p.bankAccountId
        ? (await this.accountsById(tx, orgId, [p.bankAccountId])).get(p.bankAccountId)
        : await this.defaultAccount(tx, orgId, 'BANK', 'BANK_ACCOUNT_REQUIRED');
      if (!bank || bank.kind !== 'BANK' || !bank.active) throw fail('BANK_ACCOUNT_REQUIRED');
      const tdsAcc = await this.defaultAccount(tx, orgId, 'TDS_PAYABLE', 'TDS_ACCOUNT_MISSING');

      let gross = 0n;
      let tds = 0n;
      for (const [i, pi] of p.payees.entries()) {
        const row = i + 1;
        const payee = await tx.payee.findFirst({ where: { id: pi.payeeId, orgId } });
        if (!payee) throw fail('PAYEE_NOT_FOUND');
        if (payee.pan && !isValidPan(payee.pan)) issues.push({ code: 'PAN_INVALID', line: row, params: { name: payee.name } });
        if (p.paymentMethod === 'EFT' && !payee.accountNo) issues.push({ code: 'PAYEE_BANK_REQUIRED', line: row, params: { name: payee.name } });
        if (pi.vatIncluded && !payee.vatRegistered) issues.push({ code: 'PAYEE_NOT_VAT_REGISTERED', line: row, params: { name: payee.name } });
        if (pi.gross <= 0n) issues.push({ code: 'LINE_AMOUNT_POSITIVE', line: row });
        if (pi.billDateBs) parseBs(pi.billDateBs);
        const rule = await this.taxRuleOn(tx, orgId, pi.taxCode, dateAd);
        const calc = computeTds({ bill: pi.gross > 0n ? pi.gross : 0n, vatIncluded: pi.vatIncluded, rateBp: rule.rateBp, vatRateBp: org.vatRateBp, rounding: org.tdsRounding });
        let rowTds = calc.tds;
        let reason: string | null = null;
        if (pi.tdsOverride !== undefined && pi.tdsOverride !== calc.tds) {
          if (!pi.tdsOverrideReason || pi.tdsOverrideReason.trim().length < 5) issues.push({ code: 'TDS_OVERRIDE_REASON', line: row });
          if (pi.tdsOverride < 0n || pi.tdsOverride > pi.gross) issues.push({ code: 'TDS_OVERRIDE_RANGE', line: row });
          rowTds = pi.tdsOverride;
          reason = pi.tdsOverrideReason?.trim() ?? null;
        }
        if (rule.rateBp === 0 && !(pi.tdsOverrideReason?.trim())) issues.push({ code: 'TDS_EXEMPT_REASON', line: row });
        if (rule.rateBp === 0) reason = pi.tdsOverrideReason?.trim() ?? null;

        if (pi.billNo?.trim() && !input.confirmDuplicate) {
          const dup = await tx.voucherPayee.findFirst({
            where: { payeeId: payee.id, billNo: pi.billNo.trim(), voucher: { orgId, status: { not: 'CANCELLED' }, ...(voucherId ? { id: { not: voucherId } } : {}) } },
            include: { voucher: { select: { number: true, dateBs: true, status: true } } },
          });
          if (dup) warnings.push({ code: 'DUPLICATE_BILL', line: row, params: { name: payee.name, billNo: pi.billNo, voucher: String(dup.voucher.number ?? '-'), date: dup.voucher.dateBs } });
        }
        if (!input.confirmDuplicate && pi.gross > 0n) {
          const same = await tx.voucherPayee.findFirst({
            where: { payeeId: payee.id, gross: pi.gross, voucher: { orgId, dateBs: input.dateBs, status: { not: 'CANCELLED' }, ...(voucherId ? { id: { not: voucherId } } : {}) } },
          });
          if (same) warnings.push({ code: 'DUPLICATE_AMOUNT', line: row, params: { name: payee.name, amount: formatNepali(pi.gross) } });
        }
        gross += pi.gross;
        tds += rowTds;
        payees.push({
          sn: row,
          payeeId: payee.id,
          name: payee.name,
          pan: payee.pan,
          bankName: [payee.bankName, payee.bankBranch].filter(Boolean).join(', '),
          accountNo: payee.accountNo,
          billNo: pi.billNo?.trim() ?? '',
          billDateBs: pi.billDateBs ?? '',
          gross: pi.gross,
          vatIncluded: pi.vatIncluded,
          taxCode: rule.code,
          taxRateBp: rule.rateBp,
          tds: rowTds,
          tdsOverrideReason: reason,
          net: pi.gross - rowTds,
          eftRef: '',
        });
      }
      const head = (await this.accountsById(tx, orgId, [p.expenseAccountId])).get(p.expenseAccountId);
      const src: SourceCols = { activityNo: p.activityNo || head?.activityNo, componentNo: p.componentNo, src1Agency: p.src1Agency, src1Method: p.src1Method, src2Agency: p.src2Agency, src2Method: p.src2Method };
      // Activity/component belong to the expense head only; funding source applies to every line.
      lines = buildPaymentLines({ expenseAccountId: p.expenseAccountId, bankAccountId: bank.id, tdsAccountId: tdsAcc.id, bill: gross, tds }).map((l) =>
        l.accountKind === 'EXPENSE' ? { ...l, ...src } : { ...l, src1Agency: src.src1Agency, src1Method: src.src1Method, src2Agency: src.src2Agency, src2Method: src.src2Method },
      );
    } else {
      if (!input.lines?.length) throw fail('VOUCHER_MIN_LINES');
      lines = input.lines.map((l) => ({ ...l, accountKind: 'OTHER' as const }));
      payees = (input.payees ?? []).map((mp, i) => {
        if (mp.pan && !isValidPan(mp.pan)) issues.push({ code: 'PAN_INVALID', line: i + 1, params: { name: mp.name } });
        if (mp.amount <= 0n) issues.push({ code: 'LINE_AMOUNT_POSITIVE', line: i + 1 });
        return { sn: i + 1, payeeId: mp.payeeId ?? null, name: mp.name, pan: mp.pan ?? '', bankName: mp.bankName ?? '', accountNo: mp.accountNo ?? '', gross: mp.amount, tds: 0n, net: mp.amount, eftRef: mp.eftRef ?? '' };
      });
    }

    // Resolve accounts, set kinds, enforce capital/recurrent classification.
    const accounts = await this.accountsById(tx, orgId, lines.map((l) => l.accountId!).filter(Boolean));
    lines.forEach((l, i) => {
      const acc = l.accountId ? accounts.get(l.accountId) : undefined;
      if (!acc) {
        issues.push({ code: 'LINE_ACCOUNT_REQUIRED', line: i + 1 });
        return;
      }
      if (!acc.active) issues.push({ code: 'ACCOUNT_INACTIVE', line: i + 1, params: { account: acc.nameNe } });
      l.accountKind = acc.kind;
      if (acc.kind === 'EXPENSE' && acc.nature !== fund.nature) issues.push({ code: 'HEAD_NATURE_MISMATCH', line: i + 1, params: { account: `${acc.code} ${acc.nameNe}` } });
    });
    if (input.mode === 'PAYMENT' && lines[0]?.accountKind !== 'EXPENSE') issues.push({ code: 'PAYMENT_EXPENSE_HEAD_REQUIRED' });
    issues.push(...validateLines(lines).filter((i) => !(i.code === 'LINE_ACCOUNT_REQUIRED' && issues.some((x) => x.code === i.code && x.line === i.line))));
    if (issues.length) throw invalid(issues);
    if (warnings.length) throw new AppError('VOUCHER_WARNINGS', {}, HttpStatus.CONFLICT, warnings);

    return {
      fiscalYearId: fy.id,
      dateAd,
      total: voucherTotals(lines).debit,
      warnings,
      payees,
      lines: lines.map((l, i) => ({
        lineNo: i + 1,
        side: l.side,
        accountId: l.accountId!,
        accountKind: l.accountKind,
        amount: l.amount,
        activityNo: l.activityNo ?? '',
        componentNo: l.componentNo ?? '',
        src1Agency: l.src1Agency ?? '',
        src1Method: l.src1Method ?? '',
        src2Agency: l.src2Agency ?? '',
        src2Method: l.src2Method ?? '',
      })),
    };
  }

  // ───────────────────────────── budget & balance checks ─────────────────────────────

  /** Remaining budget per head after this voucher; returns the heads that would go negative. */
  private async budgetShortfalls(tx: Tx, v: { id: string; fiscalYearId: string; fundId: string; lines: { accountId: string; accountKind: AccountKind; side: Side; amount: bigint }[] }) {
    const thisNet = new Map<string, bigint>();
    for (const l of v.lines) if (l.accountKind === 'EXPENSE') thisNet.set(l.accountId, (thisNet.get(l.accountId) ?? 0n) + (l.side === 'DR' ? l.amount : -l.amount));
    const alloc = await allocations(tx, v.fiscalYearId, v.fundId);
    const spent = await expenseByStatus(tx, v.fiscalYearId, v.fundId, ['APPROVED'], v.id);
    const out: { accountId: string; available: bigint; needed: bigint }[] = [];
    for (const [acc, need] of thisNet) {
      if (need <= 0n) continue;
      const available = (alloc.get(acc) ?? 0n) - (spent.get(acc) ?? 0n);
      if (need > available) out.push({ accountId: acc, available, needed: need });
    }
    return out;
  }

  private async assertBudget(tx: Tx, v: Parameters<VouchersService['budgetShortfalls']>[1], actor: Actor, overrideReason?: string | null) {
    const short = await this.budgetShortfalls(tx, v);
    if (!short.length) return null;
    if (actor.role === 'SUPER_ADMIN' && overrideReason && overrideReason.trim().length >= 5) return overrideReason.trim();
    const accs = await this.accountsById(tx, actor.orgId, short.map((s) => s.accountId));
    throw new AppError(
      'BUDGET_EXCEEDED',
      {},
      HttpStatus.BAD_REQUEST,
      short.map((s) => ({ code: 'BUDGET_EXCEEDED', params: { account: `${accs.get(s.accountId)?.code} ${accs.get(s.accountId)?.nameNe}`, available: formatNepali(s.available), needed: formatNepali(s.needed) } })),
    );
  }

  /** A bank/cash account may never go below zero (balance is across all funds: the bank account is shared). */
  private async assertBalances(tx: Tx, v: { fiscalYearId: string; lines: { accountId: string; accountKind: AccountKind; side: Side; amount: bigint }[] }) {
    const net = new Map<string, bigint>();
    for (const l of v.lines) if (l.accountKind === 'BANK' || l.accountKind === 'CASH') net.set(l.accountId, (net.get(l.accountId) ?? 0n) + (l.side === 'DR' ? l.amount : -l.amount));
    for (const [acc, change] of net) {
      if (change >= 0n) continue;
      const bal = await accountBalance(tx, v.fiscalYearId, acc);
      if (bal + change < 0n) {
        const a = (await tx.ledgerAccount.findUniqueOrThrow({ where: { id: acc } })) as LedgerAccount;
        throw fail('INSUFFICIENT_BALANCE', { account: a.nameNe, balance: formatNepali(bal), needed: formatNepali(-change) });
      }
    }
  }

  // ───────────────────────────── commands ─────────────────────────────

  async preview(actor: Actor, fundId: string, input: VoucherInput) {
    const c = await this.compose(this.prisma, actor.orgId, fundId, input);
    const accs = await this.accountsById(this.prisma, actor.orgId, c.lines.map((l) => l.accountId));
    return {
      total: c.total,
      wordsNe: amountInWords(c.total, 'ne'),
      wordsEn: amountInWords(c.total, 'en'),
      lines: c.lines.map((l) => ({ ...l, account: this.accountView(accs.get(l.accountId)!) })),
      payees: c.payees,
    };
  }

  async create(actor: Actor, fundId: string, input: VoucherInput) {
    return this.prisma.$transaction(async (tx) => {
      const c = await this.compose(tx, actor.orgId, fundId, input);
      const v = await tx.voucher.create({
        data: {
          orgId: actor.orgId,
          fiscalYearId: c.fiscalYearId,
          fundId,
          type: input.type,
          mode: input.mode,
          dateBs: input.dateBs,
          dateAd: c.dateAd,
          budgetSubHeadId: input.budgetSubHeadId ?? null,
          projectName: input.projectName ?? '',
          eftRef: input.eftRef ?? '',
          narration: input.narration.trim(),
          totalAmount: c.total,
          preparedById: actor.userId,
          lines: { createMany: { data: c.lines } },
          payees: { createMany: { data: c.payees } },
        },
        include: voucherInclude,
      });
      await this.audit.record(tx, actor, 'CREATE', 'Voucher', v.id, undefined, v);
      return v;
    });
  }

  private async loadForChange(tx: Tx, actor: Actor, id: string) {
    const v = await tx.voucher.findFirst({ where: { id, orgId: actor.orgId }, include: voucherInclude });
    if (!v) throw NotFound('VOUCHER_NOT_FOUND');
    return v;
  }

  private assertOwnerOrAdmin(actor: Actor, v: { preparedById: string }) {
    if (actor.role !== 'SUPER_ADMIN' && v.preparedById !== actor.userId) throw Forbidden('VOUCHER_NOT_OWNER');
  }

  /** Optimistic lock: refuses to act on a voucher someone else changed meanwhile. */
  private assertVersion(v: { version: number }, version?: number) {
    if (version !== undefined && version !== v.version) throw Conflict('VOUCHER_STALE');
  }

  async update(actor: Actor, id: string, input: VoucherInput, version?: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.loadForChange(tx, actor, id);
      this.assertVersion(before, version);
      if (before.status !== 'DRAFT') throw Conflict('VOUCHER_NOT_DRAFT');
      if (before.mode === 'TAX_DEPOSIT') throw Conflict('TAX_DEPOSIT_NOT_EDITABLE');
      this.assertOwnerOrAdmin(actor, before);
      const c = await this.compose(tx, actor.orgId, before.fundId, input, id);
      await tx.voucherLine.deleteMany({ where: { voucherId: id } });
      await tx.voucherPayee.deleteMany({ where: { voucherId: id } });
      const v = await tx.voucher.update({
        where: { id },
        data: {
          fiscalYearId: c.fiscalYearId,
          type: input.type,
          mode: input.mode,
          dateBs: input.dateBs,
          dateAd: c.dateAd,
          budgetSubHeadId: input.budgetSubHeadId ?? null,
          projectName: input.projectName ?? '',
          eftRef: input.eftRef ?? '',
          narration: input.narration.trim(),
          totalAmount: c.total,
          version: { increment: 1 },
          lines: { createMany: { data: c.lines } },
          payees: { createMany: { data: c.payees } },
        },
        include: voucherInclude,
      });
      await this.audit.record(tx, actor, 'UPDATE', 'Voucher', id, before, v);
      return v;
    });
  }

  async submit(actor: Actor, id: string, opts: { version?: number; budgetOverrideReason?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const v = await this.loadForChange(tx, actor, id);
      this.assertVersion(v, opts.version);
      if (v.status !== 'DRAFT') throw Conflict('VOUCHER_NOT_DRAFT');
      this.assertOwnerOrAdmin(actor, v);
      const fy = await tx.fiscalYear.findUniqueOrThrow({ where: { id: v.fiscalYearId } });
      await assertPeriodOpen(tx, fy, v.dateBs);
      const override = await this.assertBudget(tx, v, actor, opts.budgetOverrideReason);
      const after = await tx.voucher.update({
        where: { id },
        data: { status: 'SUBMITTED', submittedById: actor.userId, submittedAt: new Date(), rejectComment: null, budgetOverrideReason: override, version: { increment: 1 } },
        include: voucherInclude,
      });
      await this.audit.record(tx, actor, 'SUBMIT', 'Voucher', id, { status: v.status }, { status: after.status, budgetOverrideReason: override });
      return after;
    });
  }

  async approve(actor: Actor, id: string, opts: { version?: number; budgetOverrideReason?: string }) {
    return this.prisma.$transaction(
      async (tx) => {
        // Serialise approvals per organisation: balance checks and numbering must see a stable ledger.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'approve:' + actor.orgId}))`;
        const v = await this.loadForChange(tx, actor, id);
        this.assertVersion(v, opts.version);
        if (v.status !== 'SUBMITTED') throw Conflict('VOUCHER_NOT_SUBMITTED');
        const fy = await tx.fiscalYear.findUniqueOrThrow({ where: { id: v.fiscalYearId } });
        await assertPeriodOpen(tx, fy, v.dateBs);

        const last = await tx.voucher.findFirst({ where: { fundId: v.fundId, fiscalYearId: v.fiscalYearId, status: 'APPROVED' }, orderBy: { dateAd: 'desc' } });
        if (last && v.dateAd < last.dateAd) throw fail('VOUCHER_DATE_ORDER', { last: last.dateBs, number: String(last.number) });

        const override = await this.assertBudget(tx, v, actor, opts.budgetOverrideReason ?? v.budgetOverrideReason);
        await this.assertBalances(tx, v);
        if (v.mode === 'TAX_DEPOSIT') {
          const rows = await tx.voucherPayee.aggregate({ where: { depositVoucherId: v.id }, _sum: { tds: true } });
          if ((rows._sum.tds ?? 0n) !== v.totalAmount) throw fail('TAX_DEPOSIT_MISMATCH');
        }

        await tx.voucherCounter.upsert({ where: { fundId_fiscalYearId: { fundId: v.fundId, fiscalYearId: v.fiscalYearId } }, create: { fundId: v.fundId, fiscalYearId: v.fiscalYearId }, update: {} });
        const [counter] = await tx.$queryRaw<{ nextNumber: number }[]>`
          SELECT "nextNumber" FROM "VoucherCounter" WHERE "fundId" = ${v.fundId} AND "fiscalYearId" = ${v.fiscalYearId} FOR UPDATE`;
        await tx.voucherCounter.update({ where: { fundId_fiscalYearId: { fundId: v.fundId, fiscalYearId: v.fiscalYearId } }, data: { nextNumber: counter.nextNumber + 1 } });

        const after = await tx.voucher.update({
          where: { id },
          data: { status: 'APPROVED', number: counter.nextNumber, approvedById: actor.userId, approvedAt: new Date(), budgetOverrideReason: override, version: { increment: 1 } },
          include: voucherInclude,
        });
        await this.audit.record(tx, actor, 'APPROVE', 'Voucher', id, { status: v.status }, { status: after.status, number: after.number, budgetOverrideReason: override });
        return after;
      },
      { timeout: 20000 },
    );
  }

  async reject(actor: Actor, id: string, comment: string, version?: number) {
    if (!comment?.trim()) throw fail('REJECT_COMMENT_REQUIRED');
    return this.prisma.$transaction(async (tx) => {
      const v = await this.loadForChange(tx, actor, id);
      this.assertVersion(v, version);
      if (v.status !== 'SUBMITTED') throw Conflict('VOUCHER_NOT_SUBMITTED');
      const after = await tx.voucher.update({ where: { id }, data: { status: 'DRAFT', rejectComment: comment.trim(), submittedById: null, submittedAt: null, version: { increment: 1 } }, include: voucherInclude });
      await this.audit.record(tx, actor, 'REJECT', 'Voucher', id, { status: v.status }, { status: 'DRAFT', comment });
      return after;
    });
  }

  /** Only unapproved vouchers can be cancelled; approved ones are corrected with an adjustment/reversal voucher. */
  async cancel(actor: Actor, id: string, reason: string, version?: number) {
    if (!reason?.trim()) throw fail('CANCEL_REASON_REQUIRED');
    return this.prisma.$transaction(async (tx) => {
      const v = await this.loadForChange(tx, actor, id);
      this.assertVersion(v, version);
      if (v.status !== 'DRAFT' && v.status !== 'SUBMITTED') throw Conflict('VOUCHER_NOT_CANCELLABLE');
      this.assertOwnerOrAdmin(actor, v);
      await tx.voucherPayee.updateMany({ where: { depositVoucherId: id }, data: { depositVoucherId: null } });
      const after = await tx.voucher.update({ where: { id }, data: { status: 'CANCELLED', cancelledById: actor.userId, cancelledAt: new Date(), cancelReason: reason.trim(), version: { increment: 1 } }, include: voucherInclude });
      await this.audit.record(tx, actor, 'CANCEL', 'Voucher', id, { status: v.status }, { status: 'CANCELLED', reason });
      return after;
    });
  }

  /** भुक्तानी: record that the approved payment has actually been made (EFT/cheque reference). */
  async markPaid(actor: Actor, id: string, ref: string) {
    return this.prisma.$transaction(async (tx) => {
      const v = await this.loadForChange(tx, actor, id);
      if (v.status !== 'APPROVED') throw Conflict('VOUCHER_NOT_APPROVED');
      if (v.paidAt) throw Conflict('VOUCHER_ALREADY_PAID');
      const after = await tx.voucher.update({ where: { id }, data: { paidAt: new Date(), paidById: actor.userId, paidRef: ref.trim() }, include: voucherInclude });
      await this.audit.record(tx, actor, 'MARK_PAID', 'Voucher', id, undefined, { paidRef: ref });
      return after;
    });
  }

  /**
   * Migration from paper books mid-year: set the next गो.भौ.नं. once, before any voucher of the
   * fund/year has been approved. Afterwards numbering is strictly sequential and cannot be changed.
   */
  async setStartNumber(actor: Actor, fundId: string, fiscalYearId: string, nextNumber: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.fundOf(tx, actor.orgId, fundId);
      if (!(await tx.fiscalYear.findFirst({ where: { id: fiscalYearId, orgId: actor.orgId } }))) throw NotFound('FISCAL_YEAR_NOT_FOUND');
      if (await tx.voucher.count({ where: { fundId, fiscalYearId, number: { not: null } } })) throw Conflict('VOUCHER_NUMBERING_STARTED');
      const key = { fundId_fiscalYearId: { fundId, fiscalYearId } };
      const before = await tx.voucherCounter.findUnique({ where: key });
      const after = await tx.voucherCounter.upsert({ where: key, create: { fundId, fiscalYearId, nextNumber }, update: { nextNumber } });
      await this.audit.record(tx, actor, 'SET_START_NUMBER', 'VoucherCounter', `${fundId}:${fiscalYearId}`, before, after);
      return after;
    });
  }

  // ───────────────────────────── TDS ─────────────────────────────

  /** TDS withheld on approved vouchers of a fund that has not yet been deposited. */
  async pendingTds(actor: Actor, fundId: string, fiscalYearId: string) {
    await this.fundOf(this.prisma, actor.orgId, fundId);
    const rows = await this.prisma.voucherPayee.findMany({
      where: {
        tds: { gt: 0 },
        voucher: { orgId: actor.orgId, fundId, fiscalYearId, status: 'APPROVED', mode: { not: 'TAX_DEPOSIT' } },
      },
      include: { voucher: { select: { id: true, number: true, dateBs: true, dateAd: true } } },
      orderBy: [{ voucher: { dateAd: 'asc' } }, { voucher: { number: 'asc' } }, { sn: 'asc' }],
    });
    const depIds = [...new Set(rows.map((r) => r.depositVoucherId).filter((x): x is string => !!x))];
    const deps = new Map((await this.prisma.voucher.findMany({ where: { id: { in: depIds } }, select: { id: true, status: true, number: true } })).map((d) => [d.id, d]));
    return rows
      .filter((r) => !r.depositVoucherId || deps.get(r.depositVoucherId)?.status !== 'APPROVED')
      .map((r) => ({
        id: r.id,
        voucherId: r.voucher.id,
        voucherNumber: r.voucher.number,
        dateBs: r.voucher.dateBs,
        name: r.name,
        pan: r.pan,
        gross: r.gross,
        taxCode: r.taxCode,
        tds: r.tds,
        depositVoucherId: r.depositVoucherId,
        depositStatus: r.depositVoucherId ? deps.get(r.depositVoucherId)?.status ?? null : null,
      }));
  }

  /** कर जम्मा: one click creates the deposit voucher (Dr TDS payable / Cr Bank) for the chosen TDS rows. */
  async createTaxDeposit(actor: Actor, fundId: string, input: { dateBs: string; rowIds: string[]; bankAccountId?: string; eftRef?: string; narration?: string }) {
    return this.prisma.$transaction(async (tx) => {
      await this.fundOf(tx, actor.orgId, fundId);
      const fy = await findFiscalYear(tx, actor.orgId, input.dateBs);
      await assertPeriodOpen(tx, fy, input.dateBs);
      if (!input.rowIds.length) throw fail('TAX_DEPOSIT_EMPTY');
      const rows = await tx.voucherPayee.findMany({
        where: { id: { in: input.rowIds }, tds: { gt: 0 }, depositVoucherId: null, voucher: { orgId: actor.orgId, fundId, status: 'APPROVED' } },
      });
      if (rows.length !== new Set(input.rowIds).size) throw Conflict('TAX_DEPOSIT_ROWS_UNAVAILABLE');
      const amount = rows.reduce((s, r) => s + r.tds, 0n);
      const tdsAcc = await this.defaultAccount(tx, actor.orgId, 'TDS_PAYABLE', 'TDS_ACCOUNT_MISSING');
      const bank = input.bankAccountId
        ? await tx.ledgerAccount.findFirst({ where: { id: input.bankAccountId, orgId: actor.orgId, kind: 'BANK', active: true } })
        : await this.defaultAccount(tx, actor.orgId, 'BANK', 'BANK_ACCOUNT_REQUIRED');
      if (!bank) throw fail('BANK_ACCOUNT_REQUIRED');
      const lines = buildTaxDepositLines(tdsAcc.id, bank.id, amount);
      const v = await tx.voucher.create({
        data: {
          orgId: actor.orgId,
          fiscalYearId: fy.id,
          fundId,
          mode: 'TAX_DEPOSIT',
          dateBs: input.dateBs,
          dateAd: adDate(input.dateBs),
          eftRef: input.eftRef ?? '',
          narration: input.narration?.trim() || `कर कट्टी रकम राजस्व खातामा जम्मा (${rows.length})`,
          totalAmount: amount,
          preparedById: actor.userId,
          lines: { createMany: { data: lines.map((l, i) => ({ lineNo: i + 1, side: l.side, accountId: l.accountId!, accountKind: l.accountKind, amount: l.amount })) } },
        },
        include: voucherInclude,
      });
      await tx.voucherPayee.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { depositVoucherId: v.id } });
      await this.audit.record(tx, actor, 'CREATE', 'Voucher', v.id, undefined, { ...v, depositRows: rows.map((r) => r.id) });
      return v;
    });
  }

  // ───────────────────────────── queries ─────────────────────────────

  accountView(a: LedgerAccount) {
    return { id: a.id, kind: a.kind, code: a.code, activityNo: a.activityNo, nameNe: a.nameNe, nameEn: a.nameEn, folioNo: a.folioNo };
  }

  async get(actor: Actor, id: string) {
    const v = await this.prisma.voucher.findFirst({ where: { id, orgId: actor.orgId }, include: voucherInclude });
    if (!v) throw NotFound('VOUCHER_NOT_FOUND');
    const accs = await this.accountsById(this.prisma, actor.orgId, v.lines.map((l) => l.accountId));
    const userIds = [v.preparedById, v.submittedById, v.approvedById, v.cancelledById].filter((x): x is string => !!x);
    const users = new Map((await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, post: true } })).map((u) => [u.id, u]));
    const fy = await this.prisma.fiscalYear.findUniqueOrThrow({ where: { id: v.fiscalYearId } });
    const subHead = v.budgetSubHeadId ? await this.prisma.budgetSubHead.findUnique({ where: { id: v.budgetSubHeadId } }) : null;
    const { debit, credit } = voucherTotals(v.lines);
    return {
      ...v,
      fiscalYear: { id: fy.id, code: fy.code },
      budgetSubHead: subHead,
      totals: { debit, credit },
      wordsNe: amountInWords(v.totalAmount, 'ne'),
      wordsEn: amountInWords(v.totalAmount, 'en'),
      lines: v.lines.map((l) => ({ ...l, account: this.accountView(accs.get(l.accountId)!) })),
      signatures: {
        prepared: { ...users.get(v.preparedById), at: v.preparedAt },
        submitted: v.submittedById ? { ...users.get(v.submittedById), at: v.submittedAt } : null,
        approved: v.approvedById ? { ...users.get(v.approvedById), at: v.approvedAt } : null,
      },
    };
  }

  async list(actor: Actor, fundId: string, q: { fiscalYearId: string; status?: string; search?: string; page: number; pageSize: number }) {
    await this.fundOf(this.prisma, actor.orgId, fundId);
    const where: Prisma.VoucherWhereInput = {
      orgId: actor.orgId,
      fundId,
      fiscalYearId: q.fiscalYearId,
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.search
        ? {
            OR: [
              { narration: { contains: q.search, mode: 'insensitive' } },
              { payees: { some: { name: { contains: q.search, mode: 'insensitive' } } } },
              ...(/^\d+$/.test(q.search) ? [{ number: Number(q.search) }] : []),
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.voucher.count({ where }),
      this.prisma.voucher.findMany({
        where,
        orderBy: [{ number: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { id: true, number: true, dateBs: true, type: true, mode: true, status: true, narration: true, totalAmount: true, rejectComment: true, payees: { select: { name: true }, orderBy: { sn: 'asc' } } },
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items };
  }

  /** Per-head budget position for the entry screen (live remaining budget). */
  async budgetPosition(actor: Actor, fundId: string, fiscalYearId: string) {
    const fund = await this.fundOf(this.prisma, actor.orgId, fundId);
    const heads = await this.prisma.ledgerAccount.findMany({ where: { orgId: actor.orgId, kind: 'EXPENSE', nature: fund.nature, active: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
    const alloc = await allocations(this.prisma, fiscalYearId, fundId);
    const spent = await netByAccount(this.prisma, fiscalYearId, fundId, { kinds: ['EXPENSE'] });
    const pending = await expenseByStatus(this.prisma, fiscalYearId, fundId, ['SUBMITTED', 'DRAFT']);
    return heads.map((h) => {
      const a = alloc.get(h.id) ?? 0n;
      const s = spent.get(h.id) ?? 0n;
      const p = pending.get(h.id) ?? 0n;
      return { ...this.accountView(h), allocated: a, spent: s, pending: p, remaining: a - s };
    });
  }
}
