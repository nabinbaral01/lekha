import { Paisa } from './money';

/** How TDS is rounded. Default for this office: always up to the next whole rupee. */
export type TdsRounding = 'UP_RUPEE' | 'NEAREST_RUPEE' | 'DOWN_RUPEE' | 'PAISA';

export interface TdsInput {
  /** Gross bill amount in paisa (including VAT if vatIncluded). */
  bill: Paisa;
  /** Bill includes VAT, so TDS is computed on bill ÷ (1 + VAT rate). */
  vatIncluded: boolean;
  /** TDS rate in basis points: 150 = 1.5%, 1500 = 15%. */
  rateBp: number;
  /** VAT rate in basis points, default 1300 = 13%. */
  vatRateBp?: number;
  rounding?: TdsRounding;
}

export interface TdsResult {
  /** Amount TDS is computed on (bill excl. VAT), rounded to paisa for display only. */
  taxableBase: Paisa;
  /** VAT portion of the bill (display only). */
  vat: Paisa;
  tds: Paisa;
  net: Paisa;
}

/** ceil/floor/round of an exact rational num/den (both positive) to a multiple of `unit`. */
function roundRational(num: bigint, den: bigint, unit: bigint, mode: TdsRounding): bigint {
  const d = den * unit;
  const q = num / d;
  const r = num % d;
  if (r === 0n) return q * unit;
  switch (mode) {
    case 'UP_RUPEE':
      return (q + 1n) * unit;
    case 'DOWN_RUPEE':
      return q * unit;
    default:
      return (r * 2n >= d ? q + 1n : q) * unit; // half-up
  }
}

/**
 * Exact integer TDS calculation. tds = bill × rate [÷ (1+VAT)], with no floating point anywhere.
 */
export function computeTds(input: TdsInput): TdsResult {
  const { bill, vatIncluded, rateBp } = input;
  const vatBp = BigInt(input.vatRateBp ?? 1300);
  const mode = input.rounding ?? 'UP_RUPEE';
  if (bill < 0n) throw new Error('Bill amount cannot be negative');
  if (!Number.isInteger(rateBp) || rateBp < 0 || rateBp > 10000) throw new Error('Invalid TDS rate');

  // taxable base = bill × 10000 / (10000 + vatBp) when VAT included
  const baseNum = vatIncluded ? bill * 10000n : bill;
  const baseDen = vatIncluded ? 10000n + vatBp : 1n;
  const taxableBase = roundRational(baseNum, baseDen, 1n, 'PAISA');

  const tdsNum = baseNum * BigInt(rateBp);
  const tdsDen = baseDen * 10000n;
  const unit = mode === 'PAISA' ? 1n : 100n;
  const tds = rateBp === 0 ? 0n : roundRational(tdsNum, tdsDen, unit, mode);
  if (tds > bill) throw new Error('TDS cannot exceed bill amount');
  return { taxableBase, vat: vatIncluded ? bill - taxableBase : 0n, tds, net: bill - tds };
}

/** Rate in basis points -> "1.5%" */
export function formatRate(bp: number): string {
  return `${(bp / 100).toString()}%`;
}
