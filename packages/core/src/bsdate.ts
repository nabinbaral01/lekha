import { dateConfigMap } from 'nepali-date-converter';
import { toDevanagariDigits, toLatinDigits } from './money';

/**
 * Bikram Sambat calendar. All arithmetic is done in whole UTC days so a server/browser
 * timezone can never shift a date. "YYYY.MM.DD" strings are the canonical BS form;
 * "YYYY-MM-DD" strings are the canonical AD form.
 */
export interface BsDate {
  y: number;
  m: number; // 1..12, 1 = Baisakh
  d: number;
}

const MONTH_KEYS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Aswin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'] as const;
export const BS_MONTHS_EN = ['Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
export const BS_MONTHS_NE = ['बैशाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज', 'कात्तिक', 'मंसिर', 'पुस', 'माघ', 'फागुन', 'चैत'];

const TABLE = dateConfigMap as unknown as Record<string, Record<string, number>>;
export const BS_MIN_YEAR = 2000;
export const BS_MAX_YEAR = Math.max(...Object.keys(TABLE).map(Number));
/** BS 2000.01.01 == AD 1943-04-14 */
const EPOCH_UTC_DAYS = Date.UTC(1943, 3, 14) / 86400000;

export function daysInBsMonth(y: number, m: number): number {
  const row = TABLE[String(y)];
  if (!row || m < 1 || m > 12) throw new Error(`BS date out of supported range: ${y}.${m}`);
  return row[MONTH_KEYS[m - 1]];
}

export function isValidBs(b: BsDate): boolean {
  if (!Number.isInteger(b.y) || !Number.isInteger(b.m) || !Number.isInteger(b.d)) return false;
  if (b.y < BS_MIN_YEAR || b.y > BS_MAX_YEAR || b.m < 1 || b.m > 12 || b.d < 1) return false;
  return b.d <= daysInBsMonth(b.y, b.m);
}

function bsToDayNumber(b: BsDate): number {
  if (!isValidBs(b)) throw new Error(`Invalid BS date ${formatBs(b)}`);
  let days = 0;
  for (let y = BS_MIN_YEAR; y < b.y; y++) for (let m = 1; m <= 12; m++) days += daysInBsMonth(y, m);
  for (let m = 1; m < b.m; m++) days += daysInBsMonth(b.y, m);
  return days + b.d - 1;
}

function dayNumberToBs(n: number): BsDate {
  if (n < 0) throw new Error('Date before supported BS range');
  for (let y = BS_MIN_YEAR; y <= BS_MAX_YEAR; y++) {
    for (let m = 1; m <= 12; m++) {
      const dim = daysInBsMonth(y, m);
      if (n < dim) return { y, m, d: n + 1 };
      n -= dim;
    }
  }
  throw new Error('Date after supported BS range');
}

/** "2082.04.01" (also accepts "2082-4-1", "२०८२.०४.०१") */
export function parseBs(s: string): BsDate {
  const m = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/.exec(toLatinDigits(s.trim()));
  if (!m) throw new Error(`Invalid BS date "${s}" (expected YYYY.MM.DD)`);
  const b = { y: +m[1], m: +m[2], d: +m[3] };
  if (!isValidBs(b)) throw new Error(`Invalid BS date "${s}"`);
  return b;
}

export function formatBs(b: BsDate, devanagari = false): string {
  const s = `${b.y}.${String(b.m).padStart(2, '0')}.${String(b.d).padStart(2, '0')}`;
  return devanagari ? toDevanagariDigits(s) : s;
}

/** BS "2082.04.01" -> AD "2025-07-17" */
export function bsToAd(bs: string | BsDate): string {
  const b = typeof bs === 'string' ? parseBs(bs) : bs;
  const ms = (EPOCH_UTC_DAYS + bsToDayNumber(b)) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** AD "2025-07-17" -> BS "2082.04.01" */
export function adToBs(ad: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ad);
  if (!m) throw new Error(`Invalid AD date "${ad}"`);
  const days = Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000;
  return formatBs(dayNumberToBs(days - EPOCH_UTC_DAYS));
}

/** Today's AD date in Nepal (UTC+05:45), independent of machine timezone. */
export function todayAdNepal(now: Date = new Date()): string {
  return new Date(now.getTime() + (5 * 60 + 45) * 60000).toISOString().slice(0, 10);
}
export function todayBs(now: Date = new Date()): string {
  return adToBs(todayAdNepal(now));
}

export function compareBs(a: string, b: string): number {
  return bsToAd(a) < bsToAd(b) ? -1 : bsToAd(a) > bsToAd(b) ? 1 : 0;
}

/** Days between two BS dates (b - a). */
export function diffBsDays(a: string, b: string): number {
  return (Date.parse(bsToAd(b)) - Date.parse(bsToAd(a))) / 86400000;
}

export interface FiscalYearInfo {
  /** "2082/83" */
  code: string;
  startYear: number;
  startBs: string; // 2082.04.01
  endBs: string; // 2083.03.<last>
}

/** Nepal fiscal year runs Shrawan 1 to Ashadh end. */
export function fiscalYearFromStart(startYear: number): FiscalYearInfo {
  const endYear = startYear + 1;
  return {
    code: `${startYear}/${String(endYear % 100).padStart(2, '0')}`,
    startYear,
    startBs: formatBs({ y: startYear, m: 4, d: 1 }),
    endBs: formatBs({ y: endYear, m: 3, d: daysInBsMonth(endYear, 3) }),
  };
}

export function fiscalYearOf(bs: string): FiscalYearInfo {
  const b = parseBs(bs);
  return fiscalYearFromStart(b.m >= 4 ? b.y : b.y - 1);
}

/** Months of a fiscal year in order: Shrawan..Ashadh as {y, m}. */
export function fiscalMonths(startYear: number): { y: number; m: number }[] {
  const out: { y: number; m: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const m = ((3 + i) % 12) + 1;
    out.push({ y: m >= 4 ? startYear : startYear + 1, m });
  }
  return out;
}
