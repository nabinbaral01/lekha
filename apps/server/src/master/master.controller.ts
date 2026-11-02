import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { fiscalYearFromStart, isValidPan, todayBs } from '@pa/core';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor, AllowAuditorWrite, CurrentActor, Roles } from '../common/actor';
import { parse, zAmount, zBsDate } from '../common/zod';
import { AppError, Conflict, NotFound } from '../common/errors';
import { adDate, findFiscalYear } from './fiscal';
import { assertStrongPassword, hashPassword } from '../auth/auth.service';

const str = (max = 300) => z.string().trim().max(max);

@Controller()
export class MasterController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Everything the client needs to boot: organisation, funds, fiscal years, current year, settings. */
  @Get('meta')
  async meta(@CurrentActor() a: Actor) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: a.orgId } });
    const funds = await this.prisma.fund.findMany({ where: { orgId: a.orgId }, orderBy: [{ source: 'asc' }, { nature: 'asc' }] });
    const fiscalYears = await this.prisma.fiscalYear.findMany({ where: { orgId: a.orgId }, orderBy: { startYear: 'desc' } });
    const today = todayBs();
    const current = fiscalYears.find((f) => f.startBs <= today && today <= f.endBs) ?? fiscalYears[0] ?? null;
    const subHeads = await this.prisma.budgetSubHead.findMany({ where: { orgId: a.orgId }, orderBy: { code: 'asc' } });
    const taxRules = await this.currentTaxRules(a.orgId);
    const { licenseKey: _l, ...orgPublic } = org;
    return { org: orgPublic, funds, fiscalYears, currentFiscalYearId: current?.id ?? null, todayBs: today, subHeads, taxRules };
  }

  private async currentTaxRules(orgId: string) {
    const all = await this.prisma.taxRule.findMany({ where: { orgId }, orderBy: [{ code: 'asc' }, { effectiveFromAd: 'desc' }] });
    const seen = new Set<string>();
    return all.filter((r) => (seen.has(r.code) ? false : (seen.add(r.code), true)));
  }

  // ───────── organisation settings ─────────
  @Roles('SUPER_ADMIN')
  @Patch('organization')
  async updateOrg(@CurrentActor() a: Actor, @Body() body: unknown) {
    const p = parse(
      z.object({
        nameNe: str().min(1), nameEn: str().min(1), govLevelNe: str(), govLevelEn: str(), ministryNe: str(), ministryEn: str(), officeCode: str(50),
        addressNe: str(), addressEn: str(), districtNe: str(100), districtEn: str(100), pan: str(9),
        tdsRounding: z.enum(['UP_RUPEE', 'NEAREST_RUPEE', 'DOWN_RUPEE', 'PAISA']), vatRateBp: z.number().int().min(0).max(5000),
        sessionIdleMinutes: z.number().int().min(5).max(480), accountsHeadName: str(), accountsHeadPost: str(), officeHeadName: str(), officeHeadPost: str(),
      }).partial(),
      body,
    );
    if (p.pan && !isValidPan(p.pan)) throw new AppError('PAN_INVALID');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({ where: { id: a.orgId } });
      const after = await tx.organization.update({ where: { id: a.orgId }, data: p });
      await this.audit.record(tx, a, 'UPDATE', 'Organization', a.orgId, before, after);
      return after;
    });
  }

  // ───────── fiscal years & period locks ─────────
  @Roles('SUPER_ADMIN')
  @Post('fiscal-years')
  async createFy(@CurrentActor() a: Actor, @Body() body: unknown) {
    const { startYear } = parse(z.object({ startYear: z.number().int().min(2070).max(2089) }), body);
    const info = fiscalYearFromStart(startYear);
    return this.prisma.$transaction(async (tx) => {
      if (await tx.fiscalYear.findUnique({ where: { orgId_code: { orgId: a.orgId, code: info.code } } })) throw Conflict('FISCAL_YEAR_EXISTS');
      const fy = await tx.fiscalYear.create({ data: { orgId: a.orgId, code: info.code, startYear, startBs: info.startBs, endBs: info.endBs, startAd: adDate(info.startBs), endAd: adDate(info.endBs) } });
      await this.audit.record(tx, a, 'CREATE', 'FiscalYear', fy.id, undefined, fy);
      return fy;
    });
  }

  @Roles('SUPER_ADMIN')
  @Post('fiscal-years/:id/close')
  closeFy(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { closed } = parse(z.object({ closed: z.boolean() }), body);
    return this.prisma.$transaction(async (tx) => {
      const fy = await tx.fiscalYear.findFirst({ where: { id, orgId: a.orgId } });
      if (!fy) throw NotFound('FISCAL_YEAR_NOT_FOUND');
      if (closed && (await tx.voucher.count({ where: { fiscalYearId: id, status: { in: ['DRAFT', 'SUBMITTED'] } } }))) throw Conflict('FISCAL_YEAR_HAS_PENDING');
      const after = await tx.fiscalYear.update({ where: { id }, data: { closed } });
      await this.audit.record(tx, a, closed ? 'CLOSE' : 'REOPEN', 'FiscalYear', id, fy, after);
      return after;
    });
  }

  @Get('fiscal-years/:id/locks')
  locks(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.periodLock.findMany({ where: { fiscalYearId: id, fiscalYear: { orgId: a.orgId } }, orderBy: [{ bsYear: 'asc' }, { bsMonth: 'asc' }] });
  }

  @Roles('SUPER_ADMIN')
  @Post('fiscal-years/:id/locks')
  setLock(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const p = parse(z.object({ bsYear: z.number().int(), bsMonth: z.number().int().min(1).max(12), locked: z.boolean() }), body);
    return this.prisma.$transaction(async (tx) => {
      const fy = await tx.fiscalYear.findFirst({ where: { id, orgId: a.orgId } });
      if (!fy) throw NotFound('FISCAL_YEAR_NOT_FOUND');
      const key = { fiscalYearId_bsYear_bsMonth: { fiscalYearId: id, bsYear: p.bsYear, bsMonth: p.bsMonth } };
      if (p.locked) await tx.periodLock.upsert({ where: key, create: { fiscalYearId: id, bsYear: p.bsYear, bsMonth: p.bsMonth, lockedById: a.userId }, update: {} });
      else await tx.periodLock.deleteMany({ where: { fiscalYearId: id, bsYear: p.bsYear, bsMonth: p.bsMonth } });
      await this.audit.record(tx, a, p.locked ? 'LOCK_PERIOD' : 'UNLOCK_PERIOD', 'FiscalYear', id, undefined, p);
      return { ok: true };
    });
  }

  // ───────── chart of accounts ─────────
  @Get('accounts')
  accounts(@CurrentActor() a: Actor, @Query() q: unknown) {
    const p = parse(z.object({ kind: z.enum(['EXPENSE', 'BANK', 'CASH', 'TDS_PAYABLE', 'ADVANCE', 'DEPOSIT', 'OTHER']).optional() }), q);
    return this.prisma.ledgerAccount.findMany({ where: { orgId: a.orgId, ...(p.kind ? { kind: p.kind } : {}) }, orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }] });
  }

  private accountSchema = z.object({
    kind: z.enum(['EXPENSE', 'BANK', 'CASH', 'TDS_PAYABLE', 'ADVANCE', 'DEPOSIT', 'OTHER']),
    code: str(30).min(1),
    activityNo: str(30).optional(),
    nameNe: str().min(1),
    nameEn: str().min(1),
    nature: z.enum(['CAPITAL', 'RECURRENT']).nullable().optional(),
    folioNo: str(30).optional(),
    bankName: str().optional(),
    bankBranch: str().optional(),
    accountNo: str(50).optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  });

  @Roles('SUPER_ADMIN')
  @Post('accounts')
  createAccount(@CurrentActor() a: Actor, @Body() body: unknown) {
    const p = parse(this.accountSchema, body);
    if (p.kind === 'EXPENSE' && !p.nature) throw new AppError('EXPENSE_NATURE_REQUIRED');
    return this.prisma.$transaction(async (tx) => {
      if (await tx.ledgerAccount.findUnique({ where: { orgId_kind_code_activityNo: { orgId: a.orgId, kind: p.kind, code: p.code, activityNo: p.activityNo ?? '' } } })) throw Conflict('ACCOUNT_CODE_EXISTS');
      const acc = await tx.ledgerAccount.create({ data: { ...p, nature: p.kind === 'EXPENSE' ? p.nature : null, orgId: a.orgId } });
      await this.audit.record(tx, a, 'CREATE', 'LedgerAccount', acc.id, undefined, acc);
      return acc;
    });
  }

  @Roles('SUPER_ADMIN')
  @Patch('accounts/:id')
  updateAccount(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const p = parse(this.accountSchema.omit({ kind: true }).partial(), body);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.ledgerAccount.findFirst({ where: { id, orgId: a.orgId } });
      if (!before) throw NotFound();
      const used = await tx.voucherLine.count({ where: { accountId: id } });
      // A used head cannot change code or capital/recurrent classification (it would rewrite history).
      if (used && ((p.code && p.code !== before.code) || (p.nature !== undefined && p.nature !== before.nature))) throw Conflict('ACCOUNT_IN_USE');
      const after = await tx.ledgerAccount.update({ where: { id }, data: p });
      await this.audit.record(tx, a, 'UPDATE', 'LedgerAccount', id, before, after);
      return after;
    });
  }

  // ───────── budget sub-heads ─────────
  @Roles('SUPER_ADMIN')
  @Post('sub-heads')
  createSubHead(@CurrentActor() a: Actor, @Body() body: unknown) {
    const p = parse(z.object({ code: str(50).min(1), nameNe: str().min(1), nameEn: str().optional() }), body);
    return this.prisma.$transaction(async (tx) => {
      if (await tx.budgetSubHead.findUnique({ where: { orgId_code: { orgId: a.orgId, code: p.code } } })) throw Conflict('SUBHEAD_CODE_EXISTS', { code: p.code });
      const s = await tx.budgetSubHead.create({ data: { code: p.code, nameNe: p.nameNe, nameEn: p.nameEn || p.nameNe, orgId: a.orgId } });
      await this.audit.record(tx, a, 'CREATE', 'BudgetSubHead', s.id, undefined, s);
      return s;
    });
  }

  @Roles('SUPER_ADMIN')
  @Patch('sub-heads/:id')
  updateSubHead(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const p = parse(z.object({ code: str(50).min(1), nameNe: str().min(1), nameEn: str() }).partial(), body);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.budgetSubHead.findFirst({ where: { id, orgId: a.orgId } });
      if (!before) throw NotFound();
      if (p.code && p.code !== before.code) {
        // The code is printed on approved vouchers; changing it would silently rewrite them.
        if (await tx.voucher.count({ where: { budgetSubHeadId: id } })) throw Conflict('SUBHEAD_IN_USE');
        if (await tx.budgetSubHead.findUnique({ where: { orgId_code: { orgId: a.orgId, code: p.code } } })) throw Conflict('SUBHEAD_CODE_EXISTS', { code: p.code });
      }
      const after = await tx.budgetSubHead.update({ where: { id }, data: p });
      await this.audit.record(tx, a, 'UPDATE', 'BudgetSubHead', id, before, after);
      return after;
    });
  }

  // ───────── payees ─────────
  @Get('payees')
  payees(@CurrentActor() a: Actor, @Query() q: unknown) {
    const p = parse(z.object({ search: z.string().max(100).optional(), all: z.coerce.boolean().optional() }), q);
    return this.prisma.payee.findMany({
      where: { orgId: a.orgId, ...(p.all ? {} : { active: true }), ...(p.search ? { OR: [{ name: { contains: p.search, mode: 'insensitive' } }, { pan: { contains: p.search } }] } : {}) },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  private payeeSchema = z.object({
    name: str().min(1),
    pan: str(9).refine((s) => s === '' || isValidPan(s), 'E_PAN_INVALID').default(''),
    vatRegistered: z.boolean().default(false),
    payeeType: z.enum(['FIRM', 'INDIVIDUAL', 'STAFF', 'GOVERNMENT', 'OTHER']).default('FIRM'),
    defaultTaxCode: z.string().max(50).nullish(),
    bankName: str().default(''),
    bankBranch: str().default(''),
    accountNo: str(50).default(''),
    phone: str(50).default(''),
    address: str().default(''),
    active: z.boolean().default(true),
  });

  @Roles('SUPER_ADMIN', 'ACCOUNTANT')
  @Post('payees')
  createPayee(@CurrentActor() a: Actor, @Body() body: unknown) {
    const p = parse(this.payeeSchema, body);
    if (p.vatRegistered && !p.pan) throw new AppError('VAT_PAYEE_PAN_REQUIRED');
    return this.prisma.$transaction(async (tx) => {
      if (p.pan && (await tx.payee.findFirst({ where: { orgId: a.orgId, pan: p.pan } }))) throw Conflict('PAYEE_PAN_EXISTS', { pan: p.pan });
      const payee = await tx.payee.create({ data: { ...p, orgId: a.orgId } });
      await this.audit.record(tx, a, 'CREATE', 'Payee', payee.id, undefined, payee);
      return payee;
    });
  }

  @Roles('SUPER_ADMIN', 'ACCOUNTANT')
  @Patch('payees/:id')
  updatePayee(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const p = parse(this.payeeSchema.partial(), body);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.payee.findFirst({ where: { id, orgId: a.orgId } });
      if (!before) throw NotFound();
      if ((p.vatRegistered ?? before.vatRegistered) && !(p.pan ?? before.pan)) throw new AppError('VAT_PAYEE_PAN_REQUIRED');
      const after = await tx.payee.update({ where: { id }, data: p });
      await this.audit.record(tx, a, 'UPDATE', 'Payee', id, before, after);
      return after;
    });
  }

  // ───────── tax rules (versioned by effective date, never edited in place) ─────────
  @Get('tax-rules')
  taxRules(@CurrentActor() a: Actor) {
    return this.prisma.taxRule.findMany({ where: { orgId: a.orgId }, orderBy: [{ code: 'asc' }, { effectiveFromAd: 'desc' }] });
  }

  @Roles('SUPER_ADMIN')
  @Post('tax-rules')
  createTaxRule(@CurrentActor() a: Actor, @Body() body: unknown) {
    const p = parse(z.object({ code: z.string().regex(/^[A-Z_]{2,40}$/), nameNe: str().min(1), nameEn: str().min(1), rateBp: z.number().int().min(0).max(10000), excludeVat: z.boolean().default(false), effectiveFromBs: zBsDate }), body);
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.taxRule.create({ data: { ...p, orgId: a.orgId, effectiveFromAd: adDate(p.effectiveFromBs), createdById: a.userId } });
      await this.audit.record(tx, a, 'CREATE', 'TaxRule', rule.id, undefined, rule);
      return rule;
    });
  }

  // ───────── budget: appropriation, रकमान्तर, additional ─────────
  @Get('budget-entries')
  budgetEntries(@CurrentActor() a: Actor, @Query() q: unknown) {
    const p = parse(z.object({ fy: z.string().uuid(), fund: z.string().uuid() }), q);
    return this.prisma.budgetEntry.findMany({ where: { fiscalYearId: p.fy, fundId: p.fund }, orderBy: { createdAt: 'asc' } });
  }

  @Roles('SUPER_ADMIN')
  @Post('budget-entries')
  async createBudget(@CurrentActor() a: Actor, @Body() body: unknown) {
    const p = parse(
      z.object({
        fiscalYearId: z.string().uuid(),
        fundId: z.string().uuid(),
        type: z.enum(['APPROPRIATION', 'ADDITIONAL', 'REDUCTION', 'TRANSFER']),
        accountId: z.string().uuid(),
        toAccountId: z.string().uuid().optional(),
        amount: zAmount.refine((v) => v > 0n, 'E_AMOUNT_POSITIVE'),
        note: str(1000).min(1, 'E_NOTE_REQUIRED'),
      }),
      body,
    );
    return this.prisma.$transaction(async (tx) => {
      const fund = await tx.fund.findFirst({ where: { id: p.fundId, orgId: a.orgId } });
      const fy = await tx.fiscalYear.findFirst({ where: { id: p.fiscalYearId, orgId: a.orgId } });
      if (!fund || !fy) throw NotFound();
      if (fy.closed) throw new AppError('FISCAL_YEAR_CLOSED', { fy: fy.code });
      const ids = [p.accountId, ...(p.toAccountId ? [p.toAccountId] : [])];
      const heads = await tx.ledgerAccount.findMany({ where: { id: { in: ids }, orgId: a.orgId, kind: 'EXPENSE' } });
      if (heads.length !== new Set(ids).size) throw new AppError('BUDGET_HEAD_INVALID');
      for (const h of heads) if (h.nature !== fund.nature) throw new AppError('HEAD_NATURE_MISMATCH', { account: `${h.code} ${h.nameNe}` });
      const base = { fiscalYearId: p.fiscalYearId, fundId: p.fundId, note: p.note, createdById: a.userId };
      const remaining = async (accountId: string) => {
        const alloc = await tx.budgetEntry.aggregate({ where: { fiscalYearId: p.fiscalYearId, fundId: p.fundId, accountId }, _sum: { amount: true } });
        const spent = await tx.$queryRaw<{ s: bigint | null }[]>`
          SELECT SUM(CASE WHEN l.side='DR' THEN l.amount ELSE -l.amount END)::bigint AS s FROM "VoucherLine" l JOIN "Voucher" v ON v.id=l."voucherId"
          WHERE v.status IN ('APPROVED','SUBMITTED') AND v."fundId"=${p.fundId} AND v."fiscalYearId"=${p.fiscalYearId} AND l."accountId"=${accountId}`;
        return (alloc._sum.amount ?? 0n) - (spent[0]?.s ?? 0n);
      };
      let entries;
      if (p.type === 'TRANSFER') {
        if (!p.toAccountId || p.toAccountId === p.accountId) throw new AppError('TRANSFER_TARGET_REQUIRED');
        if ((await remaining(p.accountId)) < p.amount) throw new AppError('TRANSFER_EXCEEDS_REMAINING');
        const group = randomUUID();
        entries = [
          await tx.budgetEntry.create({ data: { ...base, type: 'TRANSFER', accountId: p.accountId, amount: -p.amount, transferGroup: group } }),
          await tx.budgetEntry.create({ data: { ...base, type: 'TRANSFER', accountId: p.toAccountId, amount: p.amount, transferGroup: group } }),
        ];
      } else {
        if (p.type === 'REDUCTION' && (await remaining(p.accountId)) < p.amount) throw new AppError('TRANSFER_EXCEEDS_REMAINING');
        entries = [await tx.budgetEntry.create({ data: { ...base, type: p.type, accountId: p.accountId, amount: p.type === 'REDUCTION' ? -p.amount : p.amount } })];
      }
      for (const e of entries) await this.audit.record(tx, a, 'CREATE', 'BudgetEntry', e.id, undefined, e);
      return entries;
    });
  }

  // ───────── opening balances (मौज्दात जिम्मेवारी) ─────────
  @Get('opening-balances')
  async openingBalances(@CurrentActor() a: Actor, @Query() q: unknown) {
    const p = parse(z.object({ fy: z.string().uuid() }), q);
    const funds = await this.prisma.fund.findMany({ where: { orgId: a.orgId }, select: { id: true } });
    return this.prisma.openingBalance.findMany({ where: { fiscalYearId: p.fy, fundId: { in: funds.map((f) => f.id) } } });
  }

  @Roles('SUPER_ADMIN')
  @Post('opening-balances')
  setOpening(@CurrentActor() a: Actor, @Body() body: unknown) {
    const p = parse(z.object({ fundId: z.string().uuid(), accountId: z.string().uuid(), dateBs: zBsDate, amount: zAmount }), body);
    return this.prisma.$transaction(async (tx) => {
      const fy = await findFiscalYear(tx, a.orgId, p.dateBs);
      const fund = await tx.fund.findFirst({ where: { id: p.fundId, orgId: a.orgId } });
      const acc = await tx.ledgerAccount.findFirst({ where: { id: p.accountId, orgId: a.orgId } });
      if (!fund || !acc) throw NotFound();
      if (acc.kind === 'EXPENSE') throw new AppError('OPENING_NOT_FOR_EXPENSE');
      if (await tx.voucher.count({ where: { fiscalYearId: fy.id, fundId: p.fundId, status: 'APPROVED' } })) throw Conflict('OPENING_AFTER_APPROVAL');
      const key = { fiscalYearId_fundId_accountId: { fiscalYearId: fy.id, fundId: p.fundId, accountId: p.accountId } };
      const before = await tx.openingBalance.findUnique({ where: key });
      const after = await tx.openingBalance.upsert({ where: key, create: { fiscalYearId: fy.id, fundId: p.fundId, accountId: p.accountId, dateBs: p.dateBs, amount: p.amount }, update: { dateBs: p.dateBs, amount: p.amount } });
      await this.audit.record(tx, a, before ? 'UPDATE' : 'CREATE', 'OpeningBalance', after.id, before, after);
      return after;
    });
  }

  // ───────── users ─────────
  @Roles('SUPER_ADMIN')
  @Get('users')
  users(@CurrentActor() a: Actor) {
    return this.prisma.user.findMany({
      where: { orgId: a.orgId },
      select: { id: true, username: true, fullName: true, post: true, role: true, active: true, language: true, lockedUntil: true, createdAt: true },
      orderBy: { username: 'asc' },
    });
  }

  @Roles('SUPER_ADMIN')
  @Post('users')
  async createUser(@CurrentActor() a: Actor, @Body() body: unknown) {
    const p = parse(z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.]{3,40}$/), password: z.string().max(200), fullName: str().min(1), post: str(), role: z.enum(['SUPER_ADMIN', 'ACCOUNTANT', 'AUDITOR']) }), body);
    assertStrongPassword(p.password);
    const passwordHash = await hashPassword(p.password);
    return this.prisma.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { username: p.username } })) throw Conflict('USERNAME_EXISTS');
      const u = await tx.user.create({ data: { orgId: a.orgId, username: p.username, passwordHash, fullName: p.fullName, post: p.post, role: p.role } });
      const { passwordHash: _h, ...safe } = u;
      await this.audit.record(tx, a, 'CREATE', 'User', u.id, undefined, safe);
      return safe;
    });
  }

  @Roles('SUPER_ADMIN')
  @Patch('users/:id')
  async updateUser(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const p = parse(z.object({ fullName: str().min(1), post: str(), role: z.enum(['SUPER_ADMIN', 'ACCOUNTANT', 'AUDITOR']), active: z.boolean(), password: z.string().max(200), unlock: z.boolean() }).partial(), body);
    if (p.password) assertStrongPassword(p.password);
    const passwordHash = p.password ? await hashPassword(p.password) : undefined;
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findFirst({ where: { id, orgId: a.orgId } });
      if (!before) throw NotFound();
      if (id === a.userId && (p.active === false || (p.role && p.role !== 'SUPER_ADMIN'))) throw Conflict('CANNOT_DEMOTE_SELF');
      const after = await tx.user.update({
        where: { id },
        data: { fullName: p.fullName, post: p.post, role: p.role, active: p.active, ...(passwordHash ? { passwordHash } : {}), ...(p.unlock ? { lockedUntil: null, failedAttempts: 0 } : {}) },
      });
      if (p.active === false || passwordHash) await tx.session.updateMany({ where: { userId: id }, data: { revoked: true } });
      const strip = ({ passwordHash: _h, ...r }: typeof before) => r;
      await this.audit.record(tx, a, passwordHash ? 'RESET_PASSWORD' : 'UPDATE', 'User', id, strip(before), strip(after));
      return strip(after);
    });
  }

  // ───────── audit trail ─────────
  @Roles('SUPER_ADMIN', 'AUDITOR')
  @Get('audit')
  async auditLog(@CurrentActor() a: Actor, @Query() q: unknown) {
    const p = parse(z.object({ entity: z.string().max(50).optional(), entityId: z.string().max(60).optional(), user: z.string().max(60).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) }), q);
    const where = { orgId: a.orgId, ...(p.entity ? { entity: p.entity } : {}), ...(p.entityId ? { entityId: p.entityId } : {}), ...(p.user ? { username: p.user } : {}) };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
    ]);
    return { total, items };
  }

  /** Every report printout is logged (who printed what, when). */
  @AllowAuditorWrite()
  @Post('audit/print')
  async logPrint(@CurrentActor() a: Actor, @Body() body: unknown) {
    const p = parse(z.object({ entity: z.string().max(50), entityId: z.string().max(100) }), body);
    await this.prisma.$transaction((tx) => this.audit.record(tx, a, 'PRINT', p.entity, p.entityId));
    return { ok: true };
  }

  @Roles('SUPER_ADMIN', 'AUDITOR')
  @Get('audit/verify')
  async verifyAudit() {
    const broken = await this.audit.verifyChain();
    return { intact: broken === null, firstBrokenId: broken };
  }
}
