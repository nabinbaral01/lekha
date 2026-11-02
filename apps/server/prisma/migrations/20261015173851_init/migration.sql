-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ACCOUNTANT', 'AUDITOR');

-- CreateEnum
CREATE TYPE "FundSource" AS ENUM ('INTERNAL', 'GRANT');

-- CreateEnum
CREATE TYPE "Nature" AS ENUM ('CAPITAL', 'RECURRENT');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('EXPENSE', 'BANK', 'CASH', 'TDS_PAYABLE', 'ADVANCE', 'DEPOSIT', 'OTHER');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('DR', 'CR');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('NORMAL', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VoucherMode" AS ENUM ('PAYMENT', 'TAX_DEPOSIT', 'MANUAL');

-- CreateEnum
CREATE TYPE "TdsRounding" AS ENUM ('UP_RUPEE', 'NEAREST_RUPEE', 'DOWN_RUPEE', 'PAISA');

-- CreateEnum
CREATE TYPE "BudgetEntryType" AS ENUM ('APPROPRIATION', 'TRANSFER', 'ADDITIONAL', 'REDUCTION');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameNe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "govLevelNe" TEXT NOT NULL,
    "govLevelEn" TEXT NOT NULL,
    "ministryNe" TEXT NOT NULL DEFAULT '',
    "ministryEn" TEXT NOT NULL DEFAULT '',
    "officeCode" TEXT NOT NULL DEFAULT '',
    "addressNe" TEXT NOT NULL DEFAULT '',
    "addressEn" TEXT NOT NULL DEFAULT '',
    "districtNe" TEXT NOT NULL DEFAULT '',
    "districtEn" TEXT NOT NULL DEFAULT '',
    "pan" TEXT NOT NULL DEFAULT '',
    "logoPath" TEXT,
    "licenseKey" TEXT,
    "licenseUntil" TIMESTAMP(3),
    "tdsRounding" "TdsRounding" NOT NULL DEFAULT 'UP_RUPEE',
    "vatRateBp" INTEGER NOT NULL DEFAULT 1300,
    "sessionIdleMinutes" INTEGER NOT NULL DEFAULT 30,
    "accountsHeadName" TEXT NOT NULL DEFAULT '',
    "accountsHeadPost" TEXT NOT NULL DEFAULT 'लेखा प्रमुख',
    "officeHeadName" TEXT NOT NULL DEFAULT '',
    "officeHeadPost" TEXT NOT NULL DEFAULT 'कार्यालय प्रमुख',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "post" TEXT NOT NULL DEFAULT '',
    "role" "Role" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ne',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "revoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "startBs" TEXT NOT NULL,
    "endBs" TEXT NOT NULL,
    "startAd" DATE NOT NULL,
    "endAd" DATE NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodLock" (
    "id" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "bsYear" INTEGER NOT NULL,
    "bsMonth" INTEGER NOT NULL,
    "lockedById" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "source" "FundSource" NOT NULL,
    "nature" "Nature" NOT NULL,
    "nameNe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "code" TEXT NOT NULL,
    "nameNe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nature" "Nature",
    "folioNo" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankBranch" TEXT NOT NULL DEFAULT '',
    "accountNo" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetSubHead" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameNe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,

    CONSTRAINT "BudgetSubHead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetEntry" (
    "id" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "BudgetEntryType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "transferGroup" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningBalance" (
    "id" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dateBs" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "OpeningBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payee" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pan" TEXT NOT NULL DEFAULT '',
    "vatRegistered" BOOLEAN NOT NULL DEFAULT false,
    "payeeType" TEXT NOT NULL DEFAULT 'FIRM',
    "defaultTaxCode" TEXT,
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankBranch" TEXT NOT NULL DEFAULT '',
    "accountNo" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameNe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "rateBp" INTEGER NOT NULL,
    "excludeVat" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFromBs" TEXT NOT NULL,
    "effectiveFromAd" DATE NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherCounter" (
    "fundId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "VoucherCounter_pkey" PRIMARY KEY ("fundId","fiscalYearId")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "number" INTEGER,
    "type" "VoucherType" NOT NULL DEFAULT 'NORMAL',
    "mode" "VoucherMode" NOT NULL DEFAULT 'MANUAL',
    "status" "VoucherStatus" NOT NULL DEFAULT 'DRAFT',
    "dateBs" TEXT NOT NULL,
    "dateAd" DATE NOT NULL,
    "budgetSubHeadId" TEXT,
    "projectName" TEXT NOT NULL DEFAULT '',
    "eftRef" TEXT NOT NULL DEFAULT '',
    "narration" TEXT NOT NULL,
    "totalAmount" BIGINT NOT NULL,
    "budgetOverrideReason" TEXT,
    "reversalOfId" TEXT,
    "preparedById" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectComment" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherLine" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "side" "Side" NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountKind" "AccountKind" NOT NULL,
    "activityNo" TEXT NOT NULL DEFAULT '',
    "componentNo" TEXT NOT NULL DEFAULT '',
    "src1Agency" TEXT NOT NULL DEFAULT '',
    "src1Method" TEXT NOT NULL DEFAULT '',
    "src2Agency" TEXT NOT NULL DEFAULT '',
    "src2Method" TEXT NOT NULL DEFAULT '',
    "amount" BIGINT NOT NULL,

    CONSTRAINT "VoucherLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherPayee" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "sn" INTEGER NOT NULL,
    "payeeId" TEXT,
    "name" TEXT NOT NULL,
    "pan" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "accountNo" TEXT NOT NULL DEFAULT '',
    "billNo" TEXT NOT NULL DEFAULT '',
    "billDateBs" TEXT NOT NULL DEFAULT '',
    "gross" BIGINT NOT NULL,
    "vatIncluded" BOOLEAN NOT NULL DEFAULT false,
    "taxCode" TEXT,
    "taxRateBp" INTEGER NOT NULL DEFAULT 0,
    "tds" BIGINT NOT NULL DEFAULT 0,
    "tdsOverrideReason" TEXT,
    "net" BIGINT NOT NULL,
    "eftRef" TEXT NOT NULL DEFAULT '',
    "depositVoucherId" TEXT,

    CONSTRAINT "VoucherPayee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "orgId" TEXT,
    "userId" TEXT,
    "username" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_orgId_code_key" ON "FiscalYear"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodLock_fiscalYearId_bsYear_bsMonth_key" ON "PeriodLock"("fiscalYearId", "bsYear", "bsMonth");

-- CreateIndex
CREATE UNIQUE INDEX "Fund_orgId_source_nature_key" ON "Fund"("orgId", "source", "nature");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_orgId_kind_code_key" ON "LedgerAccount"("orgId", "kind", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetSubHead_orgId_code_key" ON "BudgetSubHead"("orgId", "code");

-- CreateIndex
CREATE INDEX "BudgetEntry_fiscalYearId_fundId_accountId_idx" ON "BudgetEntry"("fiscalYearId", "fundId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningBalance_fiscalYearId_fundId_accountId_key" ON "OpeningBalance"("fiscalYearId", "fundId", "accountId");

-- CreateIndex
CREATE INDEX "Payee_orgId_name_idx" ON "Payee"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRule_orgId_code_effectiveFromAd_key" ON "TaxRule"("orgId", "code", "effectiveFromAd");

-- CreateIndex
CREATE INDEX "Voucher_fundId_fiscalYearId_status_dateAd_idx" ON "Voucher"("fundId", "fiscalYearId", "status", "dateAd");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_fundId_fiscalYearId_number_key" ON "Voucher"("fundId", "fiscalYearId", "number");

-- CreateIndex
CREATE INDEX "VoucherLine_accountId_idx" ON "VoucherLine"("accountId");

-- CreateIndex
CREATE INDEX "VoucherPayee_payeeId_idx" ON "VoucherPayee"("payeeId");

-- CreateIndex
CREATE INDEX "VoucherPayee_depositVoucherId_idx" ON "VoucherPayee"("depositVoucherId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodLock" ADD CONSTRAINT "PeriodLock_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetSubHead" ADD CONSTRAINT "BudgetSubHead_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payee" ADD CONSTRAINT "Payee_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherLine" ADD CONSTRAINT "VoucherLine_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherPayee" ADD CONSTRAINT "VoucherPayee_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
