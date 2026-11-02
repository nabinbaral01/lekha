import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PrismaService } from './prisma.service';
import { AuditService } from './audit/audit.service';
import { AuthService } from './auth/auth.service';
import { AuthGuard } from './auth/auth.guard';
import { AuthController } from './auth/auth.controller';
import { MasterController } from './master/master.controller';
import { VouchersService } from './vouchers/vouchers.service';
import { VouchersController } from './vouchers/vouchers.controller';
import { ReportsService } from './reports/reports.service';
import { ReportsController } from './reports/reports.controller';
import { AllExceptionsFilter } from './common/exception.filter';

@Module({
  controllers: [AuthController, MasterController, VouchersController, ReportsController],
  providers: [
    PrismaService,
    AuditService,
    AuthService,
    VouchersService,
    ReportsService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
