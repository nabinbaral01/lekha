import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Actor, AllowAuditorWrite, CurrentActor, Roles } from '../common/actor';
import { parse, zAmount, zBsDate, zPositiveAmount } from '../common/zod';
import { VouchersService, VoucherInput } from './vouchers.service';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

const str = (max = 200) => z.string().trim().max(max).optional();
const source = { activityNo: str(50), componentNo: str(50), src1Agency: str(), src1Method: str(), src2Agency: str(), src2Method: str() };

const voucherSchema = z.object({
  type: z.enum(['NORMAL', 'ADJUSTMENT', 'REVERSAL']).default('NORMAL'),
  dateBs: zBsDate,
  budgetSubHeadId: z.string().uuid().nullish(),
  projectName: str(300),
  eftRef: str(100),
  narration: z.string().trim().min(1, 'E_NARRATION_REQUIRED').max(2000),
  mode: z.enum(['PAYMENT', 'MANUAL', 'RECEIPT']),
  receipt: z
    .object({
      revenueAccountId: z.string().uuid(),
      depositTo: z.enum(['BANK', 'CASH']).default('BANK'),
      bankAccountId: z.string().uuid().optional(),
      amount: zPositiveAmount,
      receivedFrom: z.string().trim().min(1).max(300),
      receiptNo: str(100),
    })
    .optional(),
  confirmDuplicate: z.boolean().optional(),
  payment: z
    .object({
      ...source,
      expenseAccountId: z.string().uuid(),
      bankAccountId: z.string().uuid().optional(),
      paymentMethod: z.enum(['EFT', 'CHEQUE']).default('EFT'),
      payees: z
        .array(
          z.object({
            payeeId: z.string().uuid(),
            billNo: str(100),
            billDateBs: zBsDate.optional().or(z.literal('').transform(() => undefined)),
            gross: zPositiveAmount,
            vatIncluded: z.boolean().default(false),
            taxCode: z.string().min(1),
            tdsOverride: zAmount.optional(),
            tdsOverrideReason: str(500),
          }),
        )
        .min(1)
        .max(50),
    })
    .optional(),
  lines: z
    .array(z.object({ ...source, side: z.enum(['DR', 'CR']), accountId: z.string().uuid(), amount: zPositiveAmount }))
    .max(100)
    .optional(),
  payees: z
    .array(
      z.object({
        payeeId: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(300),
        pan: str(9),
        bankName: str(),
        accountNo: str(50),
        amount: zPositiveAmount,
        eftRef: str(100),
      }),
    )
    .max(50)
    .optional(),
});

const versionSchema = z.object({ version: z.number().int().optional(), budgetOverrideReason: z.string().max(500).optional() });
const fyQuery = z.object({ fy: z.string().uuid() });

@Controller()
export class VouchersController {
  constructor(private readonly svc: VouchersService, private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get('funds/:fundId/vouchers')
  list(@CurrentActor() a: Actor, @Param('fundId', ParseUUIDPipe) fundId: string, @Query() q: unknown) {
    const p = parse(
      z.object({ fy: z.string().uuid(), status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED']).optional(), search: z.string().max(100).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(25) }),
      q,
    );
    return this.svc.list(a, fundId, { fiscalYearId: p.fy, status: p.status, search: p.search?.trim() || undefined, page: p.page, pageSize: p.pageSize });
  }

  @Roles('SUPER_ADMIN', 'ACCOUNTANT')
  @Post('funds/:fundId/vouchers/preview')
  preview(@CurrentActor() a: Actor, @Param('fundId', ParseUUIDPipe) fundId: string, @Body() body: unknown) {
    return this.svc.preview(a, fundId, parse(voucherSchema, body) as VoucherInput);
  }

  @Roles('SUPER_ADMIN', 'ACCOUNTANT')
  @Post('funds/:fundId/vouchers')
  create(@CurrentActor() a: Actor, @Param('fundId', ParseUUIDPipe) fundId: string, @Body() body: unknown) {
    return this.svc.create(a, fundId, parse(voucherSchema, body) as VoucherInput);
  }

  @Get('funds/:fundId/budget-position')
  budget(@CurrentActor() a: Actor, @Param('fundId', ParseUUIDPipe) fundId: string, @Query() q: unknown) {
    return this.svc.budgetPosition(a, fundId, parse(fyQuery, q).fy);
  }

  @Get('funds/:fundId/tds/pending')
  pendingTds(@CurrentActor() a: Actor, @Param('fundId', ParseUUIDPipe) fundId: string, @Query() q: unknown) {
    return this.svc.pendingTds(a, fundId, parse(fyQuery, q).fy);
  }

  @Roles('SUPER_ADMIN', 'ACCOUNTANT')
  @Post('funds/:fundId/tax-deposit')
  taxDeposit(@CurrentActor() a: Actor, @Param('fundId', ParseUUIDPipe) fundId: string, @Body() body: unknown) {
    const p = parse(z.object({ dateBs: zBsDate, rowIds: z.array(z.string().uuid()).min(1).max(500), bankAccountId: z.string().uuid().optional(), eftRef: str(100), narration: str(2000) }), body);
    return this.svc.createTaxDeposit(a, fundId, p);
  }

  @Roles('SUPER_ADMIN')
  @Post('funds/:fundId/voucher-start-number')
  startNumber(@CurrentActor() a: Actor, @Param('fundId', ParseUUIDPipe) fundId: string, @Body() body: unknown) {
    const p = parse(z.object({ fiscalYearId: z.string().uuid(), nextNumber: z.number().int().min(1).max(1000000) }), body);
    return this.svc.setStartNumber(a, fundId, p.fiscalYearId, p.nextNumber);
  }

  @Get('vouchers/:id')
  get(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(a, id);
  }

  @Roles('SUPER_ADMIN', 'ACCOUNTANT')
  @Put('vouchers/:id')
  update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { version } = parse(versionSchema, body);
    return this.svc.update(a, id, parse(voucherSchema, body) as VoucherInput, version);
  }

  @Roles('SUPER_ADMIN', 'ACCOUNTANT')
  @Post('vouchers/:id/submit')
  submit(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.submit(a, id, parse(versionSchema, body ?? {}));
  }

  @Roles('SUPER_ADMIN')
  @Post('vouchers/:id/approve')
  approve(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.approve(a, id, parse(versionSchema, body ?? {}));
  }

  @Roles('SUPER_ADMIN')
  @Post('vouchers/:id/reject')
  reject(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const p = parse(z.object({ comment: z.string().trim().min(1, 'E_REJECT_COMMENT_REQUIRED').max(1000), version: z.number().int().optional() }), body);
    return this.svc.reject(a, id, p.comment, p.version);
  }

  @Roles('SUPER_ADMIN', 'ACCOUNTANT')
  @Post('vouchers/:id/cancel')
  cancel(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const p = parse(z.object({ reason: z.string().trim().min(1, 'E_CANCEL_REASON_REQUIRED').max(1000), version: z.number().int().optional() }), body);
    return this.svc.cancel(a, id, p.reason, p.version);
  }

  @Roles('SUPER_ADMIN', 'ACCOUNTANT')
  @Post('vouchers/:id/paid')
  paid(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.markPaid(a, id, parse(z.object({ ref: z.string().trim().max(100).default('') }), body ?? {}).ref);
  }

  /** Logged whenever anyone (including auditors) prints a voucher. */
  @AllowAuditorWrite()
  @Post('vouchers/:id/printed')
  async printed(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) {
    const v = await this.svc.get(a, id);
    await this.prisma.$transaction((tx) => this.audit.record(tx, a, 'PRINT', 'Voucher', v.id, undefined, { number: v.number }));
    return { ok: true };
  }
}
