-- आम्दानी (income): income heads per source and receipt vouchers.
ALTER TYPE "AccountKind" ADD VALUE 'REVENUE';
ALTER TYPE "VoucherMode" ADD VALUE 'RECEIPT';
ALTER TABLE "LedgerAccount" ADD COLUMN "source" "FundSource";
