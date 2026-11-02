import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { z } from 'zod';
import { Actor, CurrentActor, Roles } from '../common/actor';
import { parse, zBsDate } from '../common/zod';
import { ReportsService } from './reports.service';

const rangeQuery = z.object({ fy: z.string().uuid(), from: zBsDate.optional(), to: zBsDate.optional() });

@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('cash-book/:fundId')
  cashBook(@CurrentActor() a: Actor, @Param('fundId', ParseUUIDPipe) fundId: string, @Query() q: unknown) {
    const p = parse(rangeQuery, q);
    return this.svc.cashBook(a, fundId, p.fy, p.from, p.to);
  }

  /** Consolidated bank-cash book of all 4 funds (true balance of the shared bank account). */
  @Roles('SUPER_ADMIN', 'AUDITOR')
  @Get('cash-book')
  consolidatedCashBook(@CurrentActor() a: Actor, @Query() q: unknown) {
    const p = parse(rangeQuery, q);
    return this.svc.cashBook(a, null, p.fy, p.from, p.to);
  }

  @Get('budget-statement/:fundId')
  budgetStatement(@CurrentActor() a: Actor, @Param('fundId', ParseUUIDPipe) fundId: string, @Query() q: unknown) {
    const p = parse(rangeQuery, q);
    return this.svc.budgetStatement(a, fundId, p.fy, p.from, p.to);
  }

  /** Trend chart data; omit fund for all funds. */
  @Get('trend')
  trend(@CurrentActor() a: Actor, @Query() q: unknown) {
    const p = parse(z.object({ fy: z.string().uuid(), fund: z.string().uuid().optional() }), q);
    return this.svc.trend(a, p.fy, p.fund ?? null);
  }

  /** आम्दानी of one source: totals per income head and the income vouchers of both its funds. */
  @Get('income/:source')
  income(@CurrentActor() a: Actor, @Param('source') source: string, @Query() q: unknown) {
    const p = parse(z.object({ fy: z.string().uuid() }), q);
    return this.svc.income(a, parse(z.enum(['INTERNAL', 'GRANT']), source), p.fy);
  }

  @Get('fund-summaries')
  summaries(@CurrentActor() a: Actor, @Query() q: unknown) {
    return this.svc.fundSummaries(a, parse(z.object({ fy: z.string().uuid() }), q).fy);
  }
}
