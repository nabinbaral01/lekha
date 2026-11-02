import { Paisa } from './money';

/** What a voucher line is posted against. Drives every book automatically. */
export type AccountKind =
  | 'EXPENSE' // budget expense head (economic code) -> budget ledger, बजेट खर्च
  | 'BANK' // bank account -> bank columns of the cash book
  | 'CASH' // cash in hand -> नगद मौज्दात columns
  | 'TDS_PAYABLE' // tax withheld -> कर कट्टी खाता, विविध columns
  | 'ADVANCE' // पेस्की -> advance ledger, पेस्की columns
  | 'DEPOSIT' // धरौटी / other liabilities -> विविध columns
  | 'OTHER';

export type Side = 'DR' | 'CR';
export type VoucherType = 'NORMAL' | 'ADJUSTMENT' | 'REVERSAL'; // साधारण / समायोजन / फिर्ता समायोजन
export type VoucherStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'CANCELLED';

export interface LineLike {
  side: Side;
  accountKind: AccountKind;
  accountId: string | null;
  amount: Paisa;
}

/** Error codes are i18n keys (errors.<code>) so messages show in the user's language. */
export interface ValidationIssue {
  code: string;
  line?: number;
  params?: Record<string, string>;
}

export function voucherTotals(lines: LineLike[]): { debit: Paisa; credit: Paisa } {
  let debit = 0n;
  let credit = 0n;
  for (const l of lines) {
    if (l.side === 'DR') debit += l.amount;
    else credit += l.amount;
  }
  return { debit, credit };
}

export function validateLines(lines: LineLike[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (lines.length < 2) issues.push({ code: 'VOUCHER_MIN_LINES' });
  lines.forEach((l, i) => {
    if (l.side !== 'DR' && l.side !== 'CR') issues.push({ code: 'LINE_SIDE_INVALID', line: i + 1 });
    if (!l.accountId) issues.push({ code: 'LINE_ACCOUNT_REQUIRED', line: i + 1 });
    if (typeof l.amount !== 'bigint' || l.amount <= 0n) issues.push({ code: 'LINE_AMOUNT_POSITIVE', line: i + 1 });
  });
  const { debit, credit } = voucherTotals(lines);
  if (debit !== credit) issues.push({ code: 'VOUCHER_UNBALANCED' });
  return issues;
}

export interface PaymentModeInput {
  expenseAccountId: string;
  bankAccountId: string;
  tdsAccountId: string;
  bill: Paisa;
  tds: Paisa;
}

/** Simple "Payment" mode -> Dr Expense (gross) / Cr Bank (net) / Cr TDS payable (tax). */
export function buildPaymentLines(p: PaymentModeInput): LineLike[] {
  const lines: LineLike[] = [
    { side: 'DR', accountKind: 'EXPENSE', accountId: p.expenseAccountId, amount: p.bill },
    { side: 'CR', accountKind: 'BANK', accountId: p.bankAccountId, amount: p.bill - p.tds },
  ];
  if (p.tds > 0n) lines.push({ side: 'CR', accountKind: 'TDS_PAYABLE', accountId: p.tdsAccountId, amount: p.tds });
  return lines;
}

/** Tax deposit: Dr TDS payable / Cr Bank. */
export function buildTaxDepositLines(tdsAccountId: string, bankAccountId: string, amount: Paisa): LineLike[] {
  return [
    { side: 'DR', accountKind: 'TDS_PAYABLE', accountId: tdsAccountId, amount },
    { side: 'CR', accountKind: 'BANK', accountId: bankAccountId, amount },
  ];
}

/** Columns of बैंक नगदी किताब for one voucher. */
export interface CashBookColumns {
  cashDr: Paisa;
  cashCr: Paisa;
  bankDr: Paisa;
  bankCr: Paisa;
  budgetExpense: Paisa; // net of reversals
  advanceGiven: Paisa;
  advanceSettled: Paisa;
  miscDr: Paisa;
  miscCr: Paisa;
}

export function cashBookColumns(lines: LineLike[]): CashBookColumns {
  const c: CashBookColumns = { cashDr: 0n, cashCr: 0n, bankDr: 0n, bankCr: 0n, budgetExpense: 0n, advanceGiven: 0n, advanceSettled: 0n, miscDr: 0n, miscCr: 0n };
  for (const l of lines) {
    const dr = l.side === 'DR';
    switch (l.accountKind) {
      case 'CASH':
        dr ? (c.cashDr += l.amount) : (c.cashCr += l.amount);
        break;
      case 'BANK':
        dr ? (c.bankDr += l.amount) : (c.bankCr += l.amount);
        break;
      case 'EXPENSE':
        c.budgetExpense += dr ? l.amount : -l.amount;
        break;
      case 'ADVANCE':
        dr ? (c.advanceGiven += l.amount) : (c.advanceSettled += l.amount);
        break;
      default:
        dr ? (c.miscDr += l.amount) : (c.miscCr += l.amount);
    }
  }
  return c;
}

/** PAN in Nepal is exactly 9 digits. */
export function isValidPan(pan: string): boolean {
  return /^\d{9}$/.test(pan);
}
