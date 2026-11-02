-- Audit log is append-only: nobody, including Super Admin or a DB-level mistake in app code, may change history.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

-- Money sanity at the database level (defence in depth behind the application rules).
ALTER TABLE "VoucherLine" ADD CONSTRAINT voucher_line_amount_positive CHECK (amount > 0);
ALTER TABLE "VoucherPayee" ADD CONSTRAINT voucher_payee_amounts CHECK (gross >= 0 AND tds >= 0 AND net >= 0 AND gross - tds = net);
ALTER TABLE "Voucher" ADD CONSTRAINT voucher_total_positive CHECK ("totalAmount" > 0);
ALTER TABLE "Voucher" ADD CONSTRAINT voucher_number_when_approved CHECK (
  (status IN ('APPROVED') AND number IS NOT NULL) OR status <> 'APPROVED'
);
ALTER TABLE "TaxRule" ADD CONSTRAINT tax_rate_range CHECK ("rateBp" >= 0 AND "rateBp" <= 10000);
ALTER TABLE "PeriodLock" ADD CONSTRAINT period_month_range CHECK ("bsMonth" BETWEEN 1 AND 12);
