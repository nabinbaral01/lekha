/**
 * Money is always held as integer paisa in a bigint. Never use floating point for amounts.
 * Strings cross the wire ("79100.00"); bigint lives in memory; BIGINT lives in the database.
 */
export type Paisa = bigint;

const AMOUNT_RE = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** Parse "1,05,000.50" / "105000.5" / "105000" into paisa. Throws on anything ambiguous. */
export function parseAmount(input: string | number | bigint): Paisa {
  if (typeof input === 'bigint') throw new Error('parseAmount expects rupees, got bigint paisa');
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('Invalid amount');
    input = input.toFixed(2);
  }
  const s = toLatinDigits(String(input)).replace(/[,\s]/g, '');
  const m = AMOUNT_RE.exec(s);
  if (!m) throw new Error(`Invalid amount: "${input}"`);
  const rupees = BigInt(m[2]);
  const paisa = BigInt((m[3] ?? '').padEnd(2, '0') || '0');
  const v = rupees * 100n + paisa;
  return m[1] ? -v : v;
}

/** Paisa -> plain decimal string "105000.50" (used for JSON / Excel). */
export function toDecimalString(p: Paisa): string {
  const neg = p < 0n;
  const a = neg ? -p : p;
  return `${neg ? '-' : ''}${a / 100n}.${(a % 100n).toString().padStart(2, '0')}`;
}

/** Lakh/crore grouping: 50309038.73 -> "5,03,09,038.73". */
export function formatNepali(p: Paisa, opts: { devanagari?: boolean; decimals?: boolean } = {}): string {
  const neg = p < 0n;
  const a = neg ? -p : p;
  const rupees = (a / 100n).toString();
  const paisa = (a % 100n).toString().padStart(2, '0');
  let grouped: string;
  if (rupees.length <= 3) grouped = rupees;
  else {
    const last3 = rupees.slice(-3);
    let rest = rupees.slice(0, -3);
    const parts: string[] = [];
    while (rest.length > 2) {
      parts.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    if (rest) parts.unshift(rest);
    grouped = `${parts.join(',')},${last3}`;
  }
  const out = `${neg ? '-' : ''}${grouped}${opts.decimals === false ? '' : `.${paisa}`}`;
  return opts.devanagari ? toDevanagariDigits(out) : out;
}

const DEV = '०१२३४५६७८९';
export function toDevanagariDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => DEV[Number(d)]);
}
export function toLatinDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(DEV.indexOf(d)));
}

export function sum(values: Iterable<Paisa>): Paisa {
  let t = 0n;
  for (const v of values) t += v;
  return t;
}
