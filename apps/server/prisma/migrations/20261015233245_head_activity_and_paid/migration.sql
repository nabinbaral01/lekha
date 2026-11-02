-- DropIndex
DROP INDEX "LedgerAccount_orgId_kind_code_key";

-- AlterTable
ALTER TABLE "LedgerAccount" ADD COLUMN     "activityNo" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paidById" TEXT,
ADD COLUMN     "paidRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_orgId_kind_code_activityNo_key" ON "LedgerAccount"("orgId", "kind", "code", "activityNo");

