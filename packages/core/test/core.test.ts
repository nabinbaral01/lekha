import NepaliDate, { dateConfigMap } from 'nepali-date-converter';
import {
  parseAmount, formatNepali, toDecimalString, computeTds, amountInWords, adToBs, bsToAd, parseBs,
  fiscalYearOf, fiscalYearFromStart, isValidBs, daysInBsMonth, todayBs, validateLines, buildPaymentLines,
  cashBookColumns, isValidPan, fiscalMonths, BS_MAX_YEAR,
} from '../src';

const R = (s: string) => parseAmount(s);

describe('money', () => {
  test('parse and format lakh/crore', () => {
    expect(R('5,03,09,038.73')).toBe(5030903873n);
    expect(formatNepali(5030903873n)).toBe('5,03,09,038.73');
    expect(formatNepali(R('100'))).toBe('100.00');
    expect(formatNepali(R('1000'))).toBe('1,000.00');
    expect(formatNepali(R('100000'))).toBe('1,00,000.00');
    expect(formatNepali(R('-1441920'))).toBe('-14,41,920.00');
    expect(formatNepali(R('1234.5'), { devanagari: true })).toBe('१,२३४.५०');
    expect(toDecimalString(5n)).toBe('0.05');
    expect(R('१,०५,०००')).toBe(10500000n);
  });
  test('rejects ambiguous amounts', () => {
    expect(() => R('1.234')).toThrow();
    expect(() => R('abc')).toThrow();
    expect(() => R('')).toThrow();
  });
});

describe('TDS engine — client acceptance figures', () => {
  const cases: [string, string, boolean, number, string, string][] = [
    ['160 VAT bill', '79100', true, 150, '1050', '78050'],
    ['162 VAT bill (round up)', '452465', true, 150, '6007', '446458'],
    ['170 non-VAT', '25305', false, 150, '380', '24925'],
    ['177 non-VAT', '100000', false, 150, '1500', '98500'],
    ['179 individual service', '500000', false, 1500, '75000', '425000'],
    ['181 non-VAT', '15980', false, 150, '240', '15740'],
    ['183 consultancy individual', '468000', false, 1500, '70200', '397800'],
  ];
  test.each(cases)('%s', (_n, bill, vat, rate, tds, net) => {
    const r = computeTds({ bill: R(bill), vatIncluded: vat, rateBp: rate });
    expect(r.tds).toBe(R(tds));
    expect(r.net).toBe(R(net));
    expect(r.tds + r.net).toBe(R(bill));
  });
  test('VAT split', () => {
    const r = computeTds({ bill: R('79100'), vatIncluded: true, rateBp: 150 });
    expect(r.taxableBase).toBe(R('70000'));
    expect(r.vat).toBe(R('9100'));
  });
  test('rounding modes', () => {
    const b = R('25305');
    expect(computeTds({ bill: b, vatIncluded: false, rateBp: 150, rounding: 'DOWN_RUPEE' }).tds).toBe(R('379'));
    expect(computeTds({ bill: b, vatIncluded: false, rateBp: 150, rounding: 'NEAREST_RUPEE' }).tds).toBe(R('380'));
    expect(computeTds({ bill: b, vatIncluded: false, rateBp: 150, rounding: 'PAISA' }).tds).toBe(R('379.58'));
    expect(computeTds({ bill: b, vatIncluded: false, rateBp: 0 }).tds).toBe(0n);
  });
});

describe('amount in words', () => {
  test('nepali', () => {
    expect(amountInWords(R('105000'), 'ne')).toBe('रु. एक लाख पाँच हजार मात्र');
    expect(amountInWords(R('50309038.73'), 'ne')).toBe('रु. पाँच करोड तीन लाख नौ हजार अठतीस र त्रिहत्तर पैसा मात्र');
    expect(amountInWords(R('0'), 'ne')).toBe('रु. शून्य मात्र');
  });
  test('english', () => {
    expect(amountInWords(R('105000'), 'en')).toBe('Rupees One Lakh Five Thousand Only');
    expect(amountInWords(R('50309038.73'), 'en')).toBe('Rupees Five Crore Three Lakh Nine Thousand Thirty-Eight and Paisa Seventy-Three Only');
    expect(amountInWords(R('12345678901'), 'en')).toBe('Rupees Twelve Arab Thirty-Four Crore Fifty-Six Lakh Seventy-Eight Thousand Nine Hundred One Only');
  });
});

describe('Bikram Sambat', () => {
  test('known anchors', () => {
    expect(bsToAd('2082.04.01')).toBe('2025-07-17');
    expect(adToBs('2025-04-14')).toBe('2082.01.01');
    expect(adToBs('2025-07-17')).toBe('2082.04.01');
    expect(parseBs('२०८२.०४.०१')).toEqual({ y: 2082, m: 4, d: 1 });
  });
  test('matches library for every day 2070..max', () => {
    const maxYear = Math.max(...Object.keys(dateConfigMap).map(Number));
    expect(maxYear).toBe(BS_MAX_YEAR);
    for (let y = 2070; y <= maxYear; y++) {
      for (let m = 1; m <= 12; m++) {
        for (let d = 1; d <= daysInBsMonth(y, m); d++) {
          const lib = new NepaliDate(y, m - 1, d).getAD();
          const ad = `${lib.year}-${String(lib.month + 1).padStart(2, '0')}-${String(lib.date).padStart(2, '0')}`;
          const bs = `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
          if (bsToAd(bs) !== ad) throw new Error(`${bs}: ${bsToAd(bs)} != ${ad}`);
          if (adToBs(ad) !== bs) throw new Error(`${ad}: ${adToBs(ad)} != ${bs}`);
        }
      }
    }
  });
  test('month-end and invalid dates', () => {
    expect(isValidBs({ y: 2082, m: 3, d: 32 })).toBe(true);
    expect(isValidBs({ y: 2082, m: 8, d: 30 })).toBe(false); // Mangsir 2082 has 29 days
    expect(() => parseBs('2082.13.01')).toThrow();
    expect(() => parseBs('2082.04.00')).toThrow();
  });
  test('fiscal year boundaries', () => {
    expect(fiscalYearOf('2082.04.01').code).toBe('2082/83');
    expect(fiscalYearOf('2082.03.32').code).toBe('2081/82');
    expect(fiscalYearOf('2083.03.15').code).toBe('2082/83');
    const fy = fiscalYearFromStart(2082);
    expect(fy.startBs).toBe('2082.04.01');
    expect(fy.endBs).toBe(`2083.03.${daysInBsMonth(2083, 3)}`);
    expect(fiscalMonths(2082)[0]).toEqual({ y: 2082, m: 4 });
    expect(fiscalMonths(2082)[11]).toEqual({ y: 2083, m: 3 });
  });
  test('today uses Nepal time regardless of machine timezone', () => {
    // 2025-07-16T18:20Z is already 2025-07-17 00:05 in Nepal
    expect(todayBs(new Date('2025-07-16T18:20:00Z'))).toBe('2082.04.01');
    expect(todayBs(new Date('2025-07-16T18:10:00Z'))).toBe('2082.03.32');
  });
});

describe('voucher rules', () => {
  test('payment lines balance and map to cash book', () => {
    const t = computeTds({ bill: R('79100'), vatIncluded: true, rateBp: 150 });
    const lines = buildPaymentLines({ expenseAccountId: 'e', bankAccountId: 'b', tdsAccountId: 't', bill: R('79100'), tds: t.tds });
    expect(validateLines(lines)).toEqual([]);
    const c = cashBookColumns(lines);
    expect(c.bankCr).toBe(R('78050'));
    expect(c.budgetExpense).toBe(R('79100'));
    expect(c.miscCr).toBe(R('1050'));
  });
  test('unbalanced and bad lines are rejected', () => {
    const codes = validateLines([
      { side: 'DR', accountKind: 'EXPENSE', accountId: 'e', amount: 100n },
      { side: 'CR', accountKind: 'BANK', accountId: null, amount: 99n },
    ]).map((i) => i.code);
    expect(codes).toContain('VOUCHER_UNBALANCED');
    expect(codes).toContain('LINE_ACCOUNT_REQUIRED');
    expect(validateLines([{ side: 'DR', accountKind: 'EXPENSE', accountId: 'e', amount: 0n }]).map((i) => i.code)).toEqual(
      expect.arrayContaining(['VOUCHER_MIN_LINES', 'LINE_AMOUNT_POSITIVE']),
    );
  });
  test('PAN', () => {
    expect(isValidPan('123456789')).toBe(true);
    expect(isValidPan('12345678')).toBe(false);
    expect(isValidPan('12345678a')).toBe(false);
  });
});
