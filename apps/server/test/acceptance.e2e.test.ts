/**
 * Acceptance tests from the client brief (section 12), run end-to-end over HTTP against a real
 * PostgreSQL database. Every expected figure below is the client's own figure.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/bootstrap';
import { seedOrganization } from '../src/seed/seed';

let app: INestApplication;
let prisma: PrismaClient;
const tok: Record<string, string> = {};
let fy: string;
let fund: string; // आन्तरिक चालु
let capitalFund: string;
let grantRecurrent: string;
const head: Record<string, string> = {};
const payee: Record<string, string> = {};

const http = () => request(app.getHttpServer());
const as = (who: string) => ({
  get: (u: string) => http().get(`/api${u}`).set('Authorization', `Bearer ${tok[who]}`),
  post: (u: string, b: object = {}) => http().post(`/api${u}`).set('Authorization', `Bearer ${tok[who]}`).send(b),
  put: (u: string, b: object = {}) => http().put(`/api${u}`).set('Authorization', `Bearer ${tok[who]}`).send(b),
});

async function login(username: string, password: string) {
  const r = await http().post('/api/auth/login').send({ username, password });
  expect(r.status).toBe(201);
  return r.body.token as string;
}

/** Accountant enters a Payment-mode voucher, submits; Super Admin approves. Returns approved voucher. */
async function pay(dateBs: string, headName: string, payeeKey: string, gross: string, vatIncluded: boolean, taxCode: string, extra: object = {}) {
  const c = await as('lekha').post(`/funds/${fund}/vouchers`, {
    dateBs,
    narration: `${headName} भुक्तानी`,
    mode: 'PAYMENT',
    payment: { expenseAccountId: head[headName], paymentMethod: 'EFT', payees: [{ payeeId: payee[payeeKey], gross, vatIncluded, taxCode, ...extra }] },
  });
  expect(c.status).toBe(201);
  const s = await as('lekha').post(`/vouchers/${c.body.id}/submit`);
  expect(s.status).toBe(201);
  const a = await as('admin').post(`/vouchers/${c.body.id}/approve`);
  if (a.status !== 201) throw new Error(JSON.stringify(a.body));
  return (await as('admin').get(`/vouchers/${c.body.id}`)).body;
}

async function bankBalance() {
  const r = await as('admin').get(`/reports/cash-book/${fund}?fy=${fy}`);
  expect(r.status).toBe(200);
  return r.body.closing.bank as string;
}

beforeAll(async () => {
  prisma = new PrismaClient();
  await seedOrganization(prisma, {
    users: [
      { username: 'admin', password: 'Admin12345', fullName: 'कार्यालय प्रमुख', post: 'प्रमुख', role: 'SUPER_ADMIN' },
      { username: 'lekha', password: 'Lekha12345', fullName: 'लेखापाल', post: 'लेखापाल', role: 'ACCOUNTANT' },
      { username: 'auditor', password: 'Audit12345', fullName: 'लेखापरीक्षक', post: 'लेखापरीक्षक', role: 'AUDITOR' },
    ],
  });
  app = await createApp();
  await app.init();
  tok.admin = await login('admin', 'Admin12345');
  tok.lekha = await login('lekha', 'Lekha12345');
  tok.auditor = await login('auditor', 'Audit12345');

  const meta = (await as('admin').get('/meta')).body;
  fy = meta.fiscalYears.find((f: { code: string }) => f.code === '2082/83').id;
  const f = (s: string, n: string) => meta.funds.find((x: { source: string; nature: string }) => x.source === s && x.nature === n).id;
  fund = f('INTERNAL', 'RECURRENT');
  capitalFund = f('INTERNAL', 'CAPITAL');
  grantRecurrent = f('GRANT', 'RECURRENT');

  const accounts = (await as('admin').get('/accounts')).body as { id: string; kind: string; nameNe: string }[];
  for (const a of accounts) head[a.kind === 'EXPENSE' ? a.nameNe : a.kind] = a.id;

  // Opening balance (मौज्दात जिम्मेवारी) at the start of FY 2082/83 — client figure.
  expect((await as('admin').post('/opening-balances', { fundId: fund, accountId: head.BANK, dateBs: '2082.04.01', amount: '50309038.73' })).status).toBe(201);

  // Appropriations (विनियोजन). The two statement heads use the client's figures; the rest are test budgets.
  const budgets: [string, string][] = [
    ['परामर्श सेवा', '1000000'],
    ['सेवा करार/ज्यालादारी शुल्क', '1800000'],
    ['कार्यालय संचालन', '3500000'],
    ['सूचना प्रविधि व्यवस्थापन', '600000'],
    ['पर्व मेला महोत्सव', '500000'],
    ['गुरुयोजना अध्ययन तथा पुनरावलोकन', '700000'],
    ['औषधी खरिद', '10000'],
  ];
  for (const [h, amt] of budgets) {
    const r = await as('admin').post('/budget-entries', { fiscalYearId: fy, fundId: fund, type: 'APPROPRIATION', accountId: head[h], amount: amt, note: 'आ.व. २०८२/८३ विनियोजन' });
    expect(r.status).toBe(201);
  }

  const mk = async (key: string, body: object) => {
    const r = await as('lekha').post('/payees', body);
    expect(r.status).toBe(201);
    payee[key] = r.body.id;
  };
  await mk('vatFirm', { name: 'हिमालय कन्सल्ट प्रा.लि.', pan: '601234567', vatRegistered: true, bankName: 'नेपाल बैंक', accountNo: '0100100200300', payeeType: 'FIRM' });
  await mk('firm', { name: 'ताप्लेजुङ सप्लायर्स', pan: '301234568', vatRegistered: false, bankName: 'राष्ट्रिय वाणिज्य बैंक', accountNo: '2200300400', payeeType: 'FIRM' });
  await mk('person', { name: 'राम बहादुर लिम्बु', pan: '112233445', vatRegistered: false, bankName: 'कृषि विकास बैंक', accountNo: '5500660077', payeeType: 'INDIVIDUAL' });

  // The office migrates mid-year: paper vouchers already reached 159.
  expect((await as('admin').post(`/funds/${fund}/voucher-start-number`, { fiscalYearId: fy, nextNumber: 160 })).status).toBe(201);
});

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
});

describe('Client acceptance figures (section 12)', () => {
  test('opening balance 5,03,09,038.73', async () => {
    const cb = (await as('admin').get(`/reports/cash-book/${fund}?fy=${fy}`)).body;
    expect(cb.opening.bank).toBe('50309038.73');
    expect(cb.opening.dateBs).toBe('2082.04.01');
  });

  test('V160 परामर्श सेवा VAT bill 79,100 → TDS 1,050, net 78,050, balance 5,02,30,988.73', async () => {
    const v = await pay('2082.04.05', 'परामर्श सेवा', 'vatFirm', '79100', true, 'VAT_SUPPLIER');
    expect(v.number).toBe(160);
    expect(v.payees[0].tds).toBe('1050.00');
    expect(v.payees[0].net).toBe('78050.00');
    expect(v.totals).toEqual({ debit: '79100.00', credit: '79100.00' });
    expect(v.wordsNe).toBe('रु. उनासी हजार एक सय मात्र');
    expect(await bankBalance()).toBe('50230988.73');
  });

  test('V161 कर जम्मा 1,050 → balance 5,02,29,938.73, TDS pending 0', async () => {
    const pending = (await as('lekha').get(`/funds/${fund}/tds/pending?fy=${fy}`)).body;
    expect(pending).toHaveLength(1);
    expect(pending[0].tds).toBe('1050.00');
    const dep = await as('lekha').post(`/funds/${fund}/tax-deposit`, { dateBs: '2082.04.06', rowIds: [pending[0].id], eftRef: 'IRD-001' });
    expect(dep.status).toBe(201);
    expect(dep.body.totalAmount).toBe('1050.00');
    await as('lekha').post(`/vouchers/${dep.body.id}/submit`).expect(201);
    const a = await as('admin').post(`/vouchers/${dep.body.id}/approve`);
    expect(a.status).toBe(201);
    expect(a.body.number).toBe(161);
    expect(await bankBalance()).toBe('50229938.73');
    expect((await as('lekha').get(`/funds/${fund}/tds/pending?fy=${fy}`)).body).toHaveLength(0);
  });

  test('V162 VAT bill 4,52,465 → TDS 6,007 (round-up), net 4,46,458, balance 4,97,83,480.73', async () => {
    const v = await pay('2082.04.07', 'सूचना प्रविधि व्यवस्थापन', 'vatFirm', '452465', true, 'VAT_SUPPLIER');
    expect(v.number).toBe(162);
    expect(v.payees[0].tds).toBe('6007.00');
    expect(v.payees[0].net).toBe('446458.00');
    expect(await bankBalance()).toBe('49783480.73');
  });

  test.each([
    ['V170', 'कार्यालय संचालन', 'firm', '25305', false, 'NON_VAT_FIRM', '380.00', '24925.00'],
    ['V177', 'पर्व मेला महोत्सव', 'firm', '100000', false, 'NON_VAT_FIRM', '1500.00', '98500.00'],
    ['V179', 'गुरुयोजना अध्ययन तथा पुनरावलोकन', 'person', '500000', false, 'INDIVIDUAL_SERVICE', '75000.00', '425000.00'],
    ['V181', 'कार्यालय संचालन', 'firm', '15980', false, 'NON_VAT_FIRM', '240.00', '15740.00'],
    ['V183', 'परामर्श सेवा', 'person', '468000', false, 'INDIVIDUAL_SERVICE', '70200.00', '397800.00'],
  ])('%s %s %s → TDS and net', async (_v, h, p, gross, vat, code, tds, net) => {
    const before = BigInt((await bankBalance()).replace('.', ''));
    const v = await pay('2082.04.10', h as string, p as string, gross as string, vat as boolean, code as string);
    expect(v.payees[0].tds).toBe(tds);
    expect(v.payees[0].net).toBe(net);
    // bank falls by exactly the net paid; TDS stays in विविध until deposited
    expect(BigInt((await bankBalance()).replace('.', ''))).toBe(before - BigInt((net as string).replace('.', '')));
  });

  test('budget statement: बचत = विनियोजित − खर्च (सेवा करार 14,41,920; कार्यालय संचालन 31,80,137)', async () => {
    // Bring spending to the client's statement totals (3,58,080 and 3,19,863) with further vouchers.
    await pay('2082.04.15', 'सेवा करार/ज्यालादारी शुल्क', 'person', '200000', false, 'SALARY_SST');
    await pay('2082.04.15', 'सेवा करार/ज्यालादारी शुल्क', 'person', '158080', false, 'SALARY_SST');
    await pay('2082.04.15', 'कार्यालय संचालन', 'firm', '278578', false, 'NON_VAT_FIRM'); // 25,305 + 15,980 + 2,78,578 = 3,19,863
    const st = (await as('auditor').get(`/reports/budget-statement/${fund}?fy=${fy}`)).body;
    const row = (n: string) => st.rows.find((r: { nameNe: string }) => r.nameNe === n);
    expect(row('सेवा करार/ज्यालादारी शुल्क')).toMatchObject({ allocated: '1800000.00', spent: '358080.00', saving: '1441920.00' });
    expect(row('कार्यालय संचालन')).toMatchObject({ allocated: '3500000.00', spent: '319863.00', saving: '3180137.00' });
    const sum = (k: string) => st.rows.reduce((s: bigint, r: Record<string, string>) => s + BigInt(r[k].replace('.', '')), 0n);
    expect(BigInt(st.totals.allocated.replace('.', ''))).toBe(sum('allocated'));
    expect(BigInt(st.totals.saving.replace('.', ''))).toBe(sum('allocated') - sum('spent'));
  });

  test('trend chart totals agree exactly with the budget statement and cash book', async () => {
    const P = (s: string) => BigInt(s.replace('.', ''));
    const tr = (await as('auditor').get(`/reports/trend?fy=${fy}&fund=${fund}`)).body;
    const st = (await as('auditor').get(`/reports/budget-statement/${fund}?fy=${fy}`)).body;
    const cb = (await as('auditor').get(`/reports/cash-book/${fund}?fy=${fy}`)).body;
    const sum = (k: string) => tr.days.reduce((s: bigint, d: Record<string, string>) => s + P(d[k]), 0n);
    expect(sum('expense')).toBe(P(st.totals.spent));
    expect(sum('paid')).toBe(P(cb.totals.bankCr) - P(cb.totals.bankDr));
    expect(sum('tds')).toBe(P(cb.totals.miscCr));
    expect(tr.allocated).toBe(st.totals.allocated);
  });

  test('cash book reconciles to the paisa: opening + receipts − payments = closing, every row', async () => {
    const cb = (await as('auditor').get(`/reports/cash-book/${fund}?fy=${fy}`)).body;
    const P = (s: string) => BigInt(s.replace('.', ''));
    let bal = P(cb.opening.bank);
    let n = 0;
    for (const m of cb.months)
      for (const r of m.rows) {
        bal += P(r.bankDr) - P(r.bankCr);
        expect(P(r.bankBalance)).toBe(bal);
        // every voucher: budget expense = bank paid + TDS withheld − TDS deposited
        expect(P(r.budgetExpense) + P(r.miscDr)).toBe(P(r.bankCr) - P(r.bankDr) + P(r.miscCr));
        n++;
      }
    expect(n).toBe(11);
    expect(P(cb.closing.bank)).toBe(bal);
    expect(cb.months[0].rows[0].number).toBe(160);
    // numbering is gap-free from 160
    const numbers = cb.months.flatMap((m: { rows: { number: number }[] }) => m.rows.map((r) => r.number));
    expect(numbers).toEqual(numbers.map((_: number, i: number) => 160 + i));
  });
});

describe('No-mistake rules (section 8)', () => {
  const base = (over: object = {}) => ({ dateBs: '2082.04.20', narration: 'test', mode: 'MANUAL', ...over });

  test('Dr ≠ Cr is blocked', async () => {
    const r = await as('lekha').post(`/funds/${fund}/vouchers`, base({ lines: [{ side: 'DR', accountId: head['कार्यालय संचालन'], amount: '1000' }, { side: 'CR', accountId: head.BANK, amount: '999.99' }] }));
    expect(r.status).toBe(400);
    expect(r.body.issues.map((i: { code: string }) => i.code)).toContain('VOUCHER_UNBALANCED');
  });

  test('overspending a head is blocked at submit; Super Admin may override with a reason', async () => {
    const c = await as('lekha').post(`/funds/${fund}/vouchers`, base({ lines: [{ side: 'DR', accountId: head['औषधी खरिद'], amount: '10000.01' }, { side: 'CR', accountId: head.BANK, amount: '10000.01' }] }));
    expect(c.status).toBe(201);
    const s = await as('lekha').post(`/vouchers/${c.body.id}/submit`);
    expect(s.status).toBe(400);
    expect(s.body.code).toBe('BUDGET_EXCEEDED');
    expect((await as('admin').post(`/vouchers/${c.body.id}/submit`, { budgetOverrideReason: 'x' })).body.code).toBe('BUDGET_EXCEEDED');
    expect((await as('admin').post(`/vouchers/${c.body.id}/submit`, { budgetOverrideReason: 'मन्त्रालयको स्वीकृति अनुसार' })).status).toBe(201);
    await as('admin').post(`/vouchers/${c.body.id}/cancel`, { reason: 'test cleanup' }).expect(201);
  });

  test('paying more than the bank balance is blocked', async () => {
    await as('admin').post('/budget-entries', { fiscalYearId: fy, fundId: grantRecurrent, type: 'APPROPRIATION', accountId: head['कार्यालय संचालन'], amount: '99999999999', note: 'test' }).expect(201);
    // grant fund shares the same bank account; the shared balance is ~4.8 crore
    const c = await as('admin').post(`/funds/${grantRecurrent}/vouchers`, base({ lines: [{ side: 'DR', accountId: head['कार्यालय संचालन'], amount: '60000000' }, { side: 'CR', accountId: head.BANK, amount: '60000000' }] }));
    await as('admin').post(`/vouchers/${c.body.id}/submit`).expect(201);
    const a = await as('admin').post(`/vouchers/${c.body.id}/approve`);
    expect(a.status).toBe(400);
    expect(a.body.code).toBe('INSUFFICIENT_BALANCE');
    await as('admin').post(`/vouchers/${c.body.id}/cancel`, { reason: 'test cleanup' }).expect(201);
  });

  test('capital head in a चालु fund (and recurrent head in a पूँजीगत fund) is blocked', async () => {
    const r1 = await as('lekha').post(`/funds/${fund}/vouchers`, base({ lines: [{ side: 'DR', accountId: head['फर्निचर मेसिनरी औजार खरिद'], amount: '100' }, { side: 'CR', accountId: head.BANK, amount: '100' }] }));
    expect(r1.body.issues.map((i: { code: string }) => i.code)).toContain('HEAD_NATURE_MISMATCH');
    const r2 = await as('lekha').post(`/funds/${capitalFund}/vouchers`, base({ lines: [{ side: 'DR', accountId: head['कार्यालय संचालन'], amount: '100' }, { side: 'CR', accountId: head.BANK, amount: '100' }] }));
    expect(r2.body.issues.map((i: { code: string }) => i.code)).toContain('HEAD_NATURE_MISMATCH');
  });

  test('dates outside the fiscal year and invalid BS dates are blocked', async () => {
    const lines = [{ side: 'DR', accountId: head['कार्यालय संचालन'], amount: '100' }, { side: 'CR', accountId: head.BANK, amount: '100' }];
    expect((await as('lekha').post(`/funds/${fund}/vouchers`, base({ dateBs: '2082.03.32', lines }))).body.code).toBe('DATE_OUTSIDE_FISCAL_YEAR');
    expect((await as('lekha').post(`/funds/${fund}/vouchers`, base({ dateBs: '2082.08.30', lines }))).body.code).toBe('VALIDATION'); // Mangsir 2082 has 29 days
  });

  test('locked month blocks entry until Super Admin unlocks', async () => {
    const lines = [{ side: 'DR', accountId: head['कार्यालय संचालन'], amount: '100' }, { side: 'CR', accountId: head.BANK, amount: '100' }];
    await as('admin').post(`/fiscal-years/${fy}/locks`, { bsYear: 2082, bsMonth: 5, locked: true }).expect(201);
    expect((await as('lekha').post(`/funds/${fund}/vouchers`, base({ dateBs: '2082.05.02', lines }))).body.code).toBe('PERIOD_LOCKED');
    await as('admin').post(`/fiscal-years/${fy}/locks`, { bsYear: 2082, bsMonth: 5, locked: false }).expect(201);
    const ok = await as('lekha').post(`/funds/${fund}/vouchers`, base({ dateBs: '2082.05.02', lines }));
    expect(ok.status).toBe(201);
    await as('lekha').post(`/vouchers/${ok.body.id}/cancel`, { reason: 'test cleanup' }).expect(201);
  });

  test('duplicate bill warns and needs explicit confirmation', async () => {
    const body = { dateBs: '2082.04.20', narration: 'बिल', mode: 'PAYMENT', payment: { expenseAccountId: head['कार्यालय संचालन'], payees: [{ payeeId: payee.firm, gross: '1000', vatIncluded: false, taxCode: 'NON_VAT_FIRM', billNo: 'B-77' }] } };
    const first = await as('lekha').post(`/funds/${fund}/vouchers`, body);
    expect(first.status).toBe(201);
    const dup = await as('lekha').post(`/funds/${fund}/vouchers`, body);
    expect(dup.status).toBe(409);
    expect(dup.body.issues.map((i: { code: string }) => i.code)).toContain('DUPLICATE_BILL');
    const confirmed = await as('lekha').post(`/funds/${fund}/vouchers`, { ...body, confirmDuplicate: true });
    expect(confirmed.status).toBe(201);
    for (const id of [first.body.id, confirmed.body.id]) await as('lekha').post(`/vouchers/${id}/cancel`, { reason: 'test cleanup' }).expect(201);
  });

  test('VAT can only be ticked for VAT-registered payees; TDS override needs a reason; exempt needs a reason', async () => {
    const mk = (p: object) => as('lekha').post(`/funds/${fund}/vouchers`, { dateBs: '2082.04.20', narration: 'x', mode: 'PAYMENT', payment: { expenseAccountId: head['कार्यालय संचालन'], payees: [{ payeeId: payee.firm, gross: '1000', vatIncluded: false, taxCode: 'NON_VAT_FIRM', ...p }] } });
    expect((await mk({ vatIncluded: true })).body.issues.map((i: { code: string }) => i.code)).toContain('PAYEE_NOT_VAT_REGISTERED');
    expect((await mk({ tdsOverride: '10' })).body.issues.map((i: { code: string }) => i.code)).toContain('TDS_OVERRIDE_REASON');
    expect((await mk({ taxCode: 'EXEMPT' })).body.issues.map((i: { code: string }) => i.code)).toContain('TDS_EXEMPT_REASON');
    const ok = await mk({ tdsOverride: '10', tdsOverrideReason: 'कर कार्यालयको पत्र अनुसार' });
    expect(ok.status).toBe(201);
    expect(ok.body.payees[0].tds).toBe('10.00');
    await as('lekha').post(`/vouchers/${ok.body.id}/cancel`, { reason: 'test cleanup' }).expect(201);
  });

  test('PAN must be 9 digits', async () => {
    const r = await as('lekha').post('/payees', { name: 'गलत PAN', pan: '12345' });
    expect(r.status).toBe(400);
  });

  test('approval must follow date order so numbers stay chronological', async () => {
    const lines = [{ side: 'DR', accountId: head['कार्यालय संचालन'], amount: '100' }, { side: 'CR', accountId: head.BANK, amount: '100' }];
    const c = await as('lekha').post(`/funds/${fund}/vouchers`, base({ dateBs: '2082.04.08', lines }));
    await as('lekha').post(`/vouchers/${c.body.id}/submit`).expect(201);
    const a = await as('admin').post(`/vouchers/${c.body.id}/approve`);
    expect(a.body.code).toBe('VOUCHER_DATE_ORDER');
    await as('lekha').post(`/vouchers/${c.body.id}/cancel`, { reason: 'test cleanup' }).expect(201);
  });
});

describe('Roles & audit trail (section 3)', () => {
  test('auditor is read-only everywhere', async () => {
    expect((await as('auditor').get(`/reports/cash-book/${fund}?fy=${fy}`)).status).toBe(200);
    expect((await as('auditor').get('/audit')).status).toBe(200);
    const writes = [
      as('auditor').post(`/funds/${fund}/vouchers`, {}),
      as('auditor').post('/payees', { name: 'x' }),
      as('auditor').post('/budget-entries', {}),
      as('auditor').post('/users', {}),
      as('auditor').put(`/vouchers/00000000-0000-4000-8000-000000000000`, {}),
    ];
    for (const r of await Promise.all(writes)) {
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('AUDITOR_READ_ONLY');
    }
  });

  test('accountant cannot approve, change budgets, tax rates or users', async () => {
    const c = await as('lekha').post(`/funds/${fund}/vouchers`, { dateBs: '2082.04.20', narration: 'x', mode: 'MANUAL', lines: [{ side: 'DR', accountId: head['कार्यालय संचालन'], amount: '1' }, { side: 'CR', accountId: head.BANK, amount: '1' }] });
    await as('lekha').post(`/vouchers/${c.body.id}/submit`).expect(201);
    expect((await as('lekha').post(`/vouchers/${c.body.id}/approve`)).status).toBe(403);
    expect((await as('lekha').post('/budget-entries', {})).status).toBe(403);
    expect((await as('lekha').post('/tax-rules', {})).status).toBe(403);
    expect((await as('lekha').get('/users')).status).toBe(403);
    await as('lekha').post(`/vouchers/${c.body.id}/cancel`, { reason: 'cleanup' }).expect(201);
  });

  test('approved vouchers cannot be edited or cancelled', async () => {
    const list = (await as('admin').get(`/funds/${fund}/vouchers?fy=${fy}&status=APPROVED`)).body.items;
    const id = list[0].id;
    expect((await as('admin').put(`/vouchers/${id}`, { dateBs: '2082.04.20', narration: 'x', mode: 'MANUAL', lines: [] })).status).toBe(409);
    expect((await as('admin').post(`/vouchers/${id}/cancel`, { reason: 'x' })).body.code).toBe('VOUCHER_NOT_CANCELLABLE');
  });

  test('5 wrong passwords lock the account', async () => {
    await as('admin').post('/users', { username: 'temp', password: 'Temp12345', fullName: 'Temp', post: '', role: 'ACCOUNTANT' }).expect(201);
    for (let i = 0; i < 5; i++) await http().post('/api/auth/login').send({ username: 'temp', password: 'wrong' }).expect(401);
    const r = await http().post('/api/auth/login').send({ username: 'temp', password: 'Temp12345' });
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('LOGIN_LOCKED');
  });

  test('audit log is append-only at the database level and its hash chain is intact', async () => {
    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.updateMany({ data: { action: 'X' } })).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe('TRUNCATE "AuditLog"')).rejects.toThrow(/append-only/);
    const v = (await as('auditor').get('/audit/verify')).body;
    expect(v).toEqual({ intact: true, firstBrokenId: null });
    const log = (await as('auditor').get('/audit?entity=Voucher&pageSize=200')).body.items.map((x: { action: string }) => x.action);
    expect(log).toEqual(expect.arrayContaining(['CREATE', 'SUBMIT', 'APPROVE', 'CANCEL']));
  });

  test('budget sub-heads: only Super Admin adds/edits; duplicates refused; used number is frozen', async () => {
    const c = await as('admin').post('/sub-heads', { code: '3510013', nameNe: 'पाथीभरा क्षेत्र विकास समिति' });
    expect(c.status).toBe(201);
    expect(c.body.nameEn).toBe('पाथीभरा क्षेत्र विकास समिति'); // English name optional
    expect((await as('admin').post('/sub-heads', { code: '3510013', nameNe: 'दोहोरो' })).body.code).toBe('SUBHEAD_CODE_EXISTS');
    expect((await as('lekha').post('/sub-heads', { code: '3510014', nameNe: 'x' })).status).toBe(403);
    expect((await as('auditor').post('/sub-heads', { code: '3510014', nameNe: 'x' })).status).toBe(403);
    const v = await as('lekha').post(`/funds/${fund}/vouchers`, { dateBs: '2082.04.20', narration: 'x', mode: 'MANUAL', budgetSubHeadId: c.body.id, lines: [{ side: 'DR', accountId: head['कार्यालय संचालन'], amount: '1' }, { side: 'CR', accountId: head.BANK, amount: '1' }] });
    expect(v.status).toBe(201);
    expect((await as('admin').put(`/sub-heads/${c.body.id}`, {})).status).toBe(404); // PATCH only
    const ch = await http().patch(`/api/sub-heads/${c.body.id}`).set('Authorization', `Bearer ${tok.admin}`).send({ code: '9999999' });
    expect(ch.body.code).toBe('SUBHEAD_IN_USE');
    const nm = await http().patch(`/api/sub-heads/${c.body.id}`).set('Authorization', `Bearer ${tok.admin}`).send({ nameNe: 'पाथीभरा क्षेत्र विकास समिति (सच्याइएको)' });
    expect(nm.status).toBe(200);
    await as('lekha').post(`/vouchers/${v.body.id}/cancel`, { reason: 'cleanup' }).expect(201);
  });

  test('rejected voucher returns to draft with comment', async () => {
    const c = await as('lekha').post(`/funds/${fund}/vouchers`, { dateBs: '2082.04.20', narration: 'x', mode: 'MANUAL', lines: [{ side: 'DR', accountId: head['कार्यालय संचालन'], amount: '1' }, { side: 'CR', accountId: head.BANK, amount: '1' }] });
    await as('lekha').post(`/vouchers/${c.body.id}/submit`).expect(201);
    const r = await as('admin').post(`/vouchers/${c.body.id}/reject`, { comment: 'बिल संलग्न छैन' });
    expect(r.body.status).toBe('DRAFT');
    expect(r.body.rejectComment).toBe('बिल संलग्न छैन');
    await as('lekha').post(`/vouchers/${c.body.id}/cancel`, { reason: 'cleanup' }).expect(201);
  });
});
