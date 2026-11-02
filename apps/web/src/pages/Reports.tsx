import { ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Printer, Receipt } from 'lucide-react';
import { BS_MONTHS_EN, BS_MONTHS_NE, diffBsDays, parseAmount, todayBs } from '@pa/core';
import { api, post } from '../lib/api';
import { useSession } from '../lib/session';
import { useFmt } from '../lib/prefs';
import type { BudgetHead, Money } from '../lib/types';
import { Breadcrumb, FundCrumb, useFund } from '../components/Layout';
import { BsDateInput } from '../components/BsDateInput';
import { Badge, Button, Card, Confirm, cx, Empty, ErrorBox, Field, Input, PageTitle, Spinner } from '../components/ui';
import { pct, Progress, useSummaries } from './Home';
import { TrendPanel } from '../components/TrendPanel';

/** Every printout is recorded in the audit trail, then the browser print dialog opens. */
export function logPrint(entity: string, entityId: string) {
  post('/audit/print', { entity, entityId }).catch(() => {});
  window.print();
}

/** "Printed by … on …" footer + page numbers (CSS @page) on every printout. */
export function PrintFooter() {
  const { t } = useTranslation();
  const { user } = useSession();
  const { digits } = useFmt();
  return (
    <div className="print-only print-footer">
      <span>
        {t('common.printedBy')}: {user?.fullName} ({user?.username})
      </span>
      <span>
        {t('common.printedOn')}: {digits(todayBs())} {digits(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}
      </span>
    </div>
  );
}

function ReportHeader({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  const { meta, fy } = useSession();
  const { name, digits, lang } = useFmt();
  const { t } = useTranslation();
  return (
    <div className="mb-3 text-center">
      <div className="text-base font-bold">{name(meta?.org)}</div>
      <div>{lang === 'ne' ? meta?.org.districtNe : meta?.org.districtEn}</div>
      <div className="mt-1 text-base font-semibold">{title}</div>
      <div>
        {t('common.fiscalYear')} {digits(fy?.code ?? '')} {sub}
      </div>
    </div>
  );
}

function RangeFilter({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (s: string) => void; setTo: (s: string) => void }) {
  const { t } = useTranslation();
  const { fy } = useSession();
  return (
    <div className="no-print mb-4 flex flex-wrap items-end gap-3">
      <Field label={t('common.from')} className="w-44">
        <BsDateInput value={from} onChange={setFrom} min={fy?.startBs} max={fy?.endBs} />
      </Field>
      <Field label={t('common.to')} className="w-44">
        <BsDateInput value={to} onChange={setTo} min={fy?.startBs} max={fy?.endBs} />
      </Field>
      {(from || to) && (
        <Button variant="ghost" onClick={() => (setFrom(''), setTo(''))}>
          {t('common.all')}
        </Button>
      )}
    </div>
  );
}

const range = (from: string, to: string) => `${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`;

interface CBRow {
  voucherId: string; number: number; dateBs: string; narration: string; chequeNo: string; fund: { source: string; nature: string };
  cashDr: Money; cashCr: Money; bankDr: Money; bankCr: Money; budgetExpense: Money; advanceGiven: Money; advanceSettled: Money; miscDr: Money; miscCr: Money; cashBalance: Money; bankBalance: Money;
}
type Cols = Pick<CBRow, 'cashDr' | 'cashCr' | 'bankDr' | 'bankCr' | 'budgetExpense' | 'advanceGiven' | 'advanceSettled' | 'miscDr' | 'miscCr'>;
interface CashBookData {
  org: { accountsHeadName: string; accountsHeadPost: string; officeHeadName: string; officeHeadPost: string };
  opening: { cash: Money; bank: Money; dateBs: string };
  months: { y: number; m: number; rows: CBRow[]; totals: Cols; closing: { cash: Money; bank: Money } }[];
  totals: Cols;
  closing: { cash: Money; bank: Money };
}

/** बैंक नगदी किताब — same columns as the office's book. fundId undefined = consolidated (all funds). */
export function CashBookView({ fundId, title, crumb }: { fundId?: string; title: ReactNode; crumb: ReactNode }) {
  const { t } = useTranslation();
  const { fy } = useSession();
  const { money, digits, lang } = useFmt();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useQuery({
    queryKey: ['cash-book', fundId ?? 'all', fy?.id, from, to],
    queryFn: () => api<CashBookData>(`/reports/cash-book${fundId ? `/${fundId}` : ''}?fy=${fy!.id}${range(from, to)}`),
    enabled: !!fy,
  });
  const z = (m: Money) => (parseAmount(m) === 0n ? '' : money(m));
  const months = lang === 'ne' ? BS_MONTHS_NE : BS_MONTHS_EN;
  const colCells = (c: Cols, extra?: { bankBal?: Money; cheque?: string }) => (
    <>
      <td className="num">{z(c.cashDr)}</td>
      <td className="num">{z(c.cashCr)}</td>
      <td className="num">{z(c.bankDr)}</td>
      <td className="num">{z(c.bankCr)}</td>
      <td>{extra?.cheque ? digits(extra.cheque) : ''}</td>
      <td className="num">{extra?.bankBal !== undefined ? money(extra.bankBal) : ''}</td>
      <td className="num">{z(c.budgetExpense)}</td>
      <td className="num">{z(c.advanceGiven)}</td>
      <td className="num">{z(c.advanceSettled)}</td>
      <td className="num">{z(c.miscDr)}</td>
      <td className="num">{z(c.miscCr)}</td>
    </>
  );
  const print = () => logPrint('CashBook', fundId ?? 'all');
  return (
    <div className="landscape">
      {crumb}
      <PageTitle actions={<Button variant="secondary" onClick={print}><Printer className="h-4 w-4" /> {t('common.print')}</Button>}>{title}</PageTitle>
      <RangeFilter from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : (
        q.data && (
          <Card className="print-sheet overflow-x-auto p-4 text-[13px] print:text-[9.5px]">
            <ReportHeader title={t('cashBook.title')} sub={title} />
            <table className="form-table min-w-[1200px]">
              <thead>
                <tr>
                  <th rowSpan={2}>{t('common.date')}</th>
                  <th rowSpan={2}>{t('voucher.number')}</th>
                  <th rowSpan={2} className="min-w-[200px]">{t('cashBook.desc')}</th>
                  <th colSpan={2}>{t('cashBook.cash')}</th>
                  <th colSpan={4}>{t('cashBook.bank')}</th>
                  <th rowSpan={2}>{t('cashBook.budgetExp')}</th>
                  <th colSpan={2}>{t('cashBook.advance')}</th>
                  <th colSpan={2}>{t('cashBook.misc')}</th>
                </tr>
                <tr>
                  <th>{t('cashBook.debit')}</th>
                  <th>{t('cashBook.credit')}</th>
                  <th>{t('cashBook.debit')}</th>
                  <th>{t('cashBook.credit')}</th>
                  <th>{t('cashBook.cheque')}</th>
                  <th>{t('cashBook.balance')}</th>
                  <th>{t('cashBook.given')}</th>
                  <th>{t('cashBook.settled')}</th>
                  <th>{t('cashBook.debit')}</th>
                  <th>{t('cashBook.credit')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="font-semibold">
                  <td>{digits(q.data.opening.dateBs)}</td>
                  <td />
                  <td>{t('cashBook.opening')}</td>
                  <td className="num">{z(q.data.opening.cash)}</td>
                  <td />
                  <td className="num">{money(q.data.opening.bank)}</td>
                  <td />
                  <td />
                  <td className="num">{money(q.data.opening.bank)}</td>
                  <td colSpan={5} />
                </tr>
                {q.data.months.map((m) => [
                  ...m.rows.map((r) => (
                    <tr key={r.voucherId}>
                      <td className="whitespace-nowrap">{digits(r.dateBs)}</td>
                      <td className="text-center">
                        <Link className="text-primary hover:underline print:text-inherit" to={`/f/${r.fund.source.toLowerCase()}/${r.fund.nature.toLowerCase()}/vouchers/${r.voucherId}`}>
                          {digits(r.number)}
                        </Link>
                        {!fundId && <span className="block text-[10px] text-subtle">{t(`nav.${r.fund.source}`)}/{t(`nav.${r.fund.nature}`).split(' ')[0]}</span>}
                      </td>
                      <td>{r.narration}</td>
                      {colCells(r, { bankBal: r.bankBalance, cheque: r.chequeNo })}
                    </tr>
                  )),
                  <tr key={`t${m.y}${m.m}`} className="total-row bg-muted/60">
                    <td colSpan={3}>
                      {months[m.m - 1]} {digits(m.y)} — {t('cashBook.monthTotal')}
                    </td>
                    {colCells(m.totals, { bankBal: m.closing.bank })}
                  </tr>,
                ])}
                {!q.data.months.length && (
                  <tr>
                    <td colSpan={14}>
                      <Empty />
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td colSpan={3}>{t('cashBook.yearTotal')}</td>
                  {colCells(q.data.totals, { bankBal: q.data.closing.bank })}
                </tr>
                <tr className="total-row">
                  <td colSpan={3}>{t('cashBook.closing')}</td>
                  <td className="num">{money(q.data.closing.cash)}</td>
                  <td />
                  <td colSpan={3} />
                  <td className="num">{money(q.data.closing.bank)}</td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            </table>
            <div className="mt-12 grid grid-cols-2 gap-16 text-center">
              {(['accounts', 'office'] as const).map((k) => (
                <div key={k} className="border-t border-fg/60 pt-1">
                  <div className="font-semibold">{k === 'accounts' ? q.data.org.accountsHeadPost || t('cashBook.accountsHead') : q.data.org.officeHeadPost || t('cashBook.officeHead')}</div>
                  <div>{k === 'accounts' ? q.data.org.accountsHeadName : q.data.org.officeHeadName}</div>
                </div>
              ))}
            </div>
          </Card>
        )
      )}
      <PrintFooter />
    </div>
  );
}

export function CashBook() {
  const { t } = useTranslation();
  const { fund } = useFund();
  const { name } = useFmt();
  return <CashBookView fundId={fund.id} title={name(fund)} crumb={<FundCrumb page={t('nav.cashBook')} />} />;
}

export function ConsolidatedCashBook() {
  const { t } = useTranslation();
  return <CashBookView title={t('nav.consolidated')} crumb={<Breadcrumb items={[{ label: t('nav.consolidated') }]} />} />;
}

interface StatementData {
  rows: { sn: number; accountId: string; code: string; nameNe: string; nameEn: string; allocated: Money; spent: Money; saving: Money }[];
  totals: { allocated: Money; spent: Money; saving: Money };
}

/** हिसाब विवरण: विनियोजित / जम्मा खर्च / बचत. */
export function BudgetStatement() {
  const { t } = useTranslation();
  const { fund } = useFund();
  const { fy } = useSession();
  const { money, digits, name } = useFmt();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useQuery({ queryKey: ['statement', fund.id, fy?.id, from, to], queryFn: () => api<StatementData>(`/reports/budget-statement/${fund.id}?fy=${fy!.id}${range(from, to)}`), enabled: !!fy });
  return (
    <div>
      <FundCrumb page={t('nav.budgetStatement')} />
      <PageTitle actions={<Button variant="secondary" onClick={() => logPrint('BudgetStatement', fund.id)}><Printer className="h-4 w-4" /> {t('common.print')}</Button>}>{t('nav.budgetStatement')}</PageTitle>
      <RangeFilter from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {q.isLoading ? (
        <Spinner />
      ) : (
        q.data && (
          <Card className="print-sheet mx-auto max-w-4xl p-4">
            <ReportHeader title={t('statement.titleFor', { nature: t(`nav.${fund.nature}`).split(' ')[0] })} sub={`· ${name(fund)}${from || to ? ` · ${digits(from || fy!.startBs)} – ${digits(to || fy!.endBs)}` : ''}`} />
            <table className="form-table">
              <thead>
                <tr>
                  <th className="w-14">{t('voucher.sn')}</th>
                  <th>{t('statement.expDesc')}</th>
                  <th>{t('statement.allocated')}</th>
                  <th>{t('statement.spent')}</th>
                  <th>{t('statement.saving')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((r) => (
                  <tr key={r.accountId}>
                    <td className="text-center">{digits(r.sn)}</td>
                    <td>{name(r)}</td>
                    <td className="num">{money(r.allocated)}</td>
                    <td className="num">{money(r.spent)}</td>
                    <td className={cx('num', parseAmount(r.saving) < 0n && 'text-danger')}>{money(r.saving)}</td>
                  </tr>
                ))}
                {!q.data.rows.length && (
                  <tr>
                    <td colSpan={5}>
                      <Empty />
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="text-right">
                    {t('common.total')}
                  </td>
                  <td className="num">{money(q.data.totals.allocated)}</td>
                  <td className="num">{money(q.data.totals.spent)}</td>
                  <td className="num">{money(q.data.totals.saving)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        )
      )}
      <PrintFooter />
    </div>
  );
}

interface PendingTds {
  id: string; voucherId: string; voucherNumber: number; dateBs: string; name: string; pan: string; gross: Money; taxCode: string; tds: Money; depositVoucherId: string | null; depositStatus: string | null;
}

/** कर (TDS): withheld but not yet deposited, and one-click tax-deposit voucher. */
export function TdsPage() {
  const { t } = useTranslation();
  const { fund, base } = useFund();
  const { fy, meta, can } = useSession();
  const { money, paisa, digits } = useFmt();
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['tds', fund.id, fy?.id], queryFn: () => api<PendingTds[]>(`/funds/${fund.id}/tds/pending?fy=${fy!.id}`), enabled: !!fy });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(meta?.todayBs && fy && meta.todayBs <= fy.endBs ? meta.todayBs : fy?.endBs ?? '');
  const [eft, setEft] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const free = (q.data ?? []).filter((r) => !r.depositVoucherId);
  const total = (q.data ?? []).filter((r) => sel.has(r.id)).reduce((s, r) => s + parseAmount(r.tds), 0n);
  const toggle = (id: string) => setSel((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));
  const deposit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const v = await post<{ id: string }>(`/funds/${fund.id}/tax-deposit`, { dateBs: date, rowIds: [...sel], eftRef: eft });
      qc.invalidateQueries();
      nav(`${base}/vouchers/${v.id}`);
    } catch (x) {
      setErr(x);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <FundCrumb page={t('nav.tax')} />
      <PageTitle>{t('tds.pendingTitle')}</PageTitle>
      <Card>
        {q.isLoading ? (
          <Spinner />
        ) : !q.data?.length ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-subtle">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input type="checkbox" className="h-4 w-4" checked={!!free.length && free.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(free.map((r) => r.id)) : new Set())} disabled={!can.write} />
                  </th>
                  <th className="px-3 py-2">{t('tds.voucher')}</th>
                  <th className="px-3 py-2">{t('common.date')}</th>
                  <th className="px-3 py-2">{t('voucher.payee')}</th>
                  <th className="px-3 py-2">{t('voucher.pan')}</th>
                  <th className="px-3 py-2 text-right">{t('tds.gross')}</th>
                  <th className="px-3 py-2 text-right">TDS</th>
                  <th className="px-3 py-2">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <input type="checkbox" className="h-4 w-4" disabled={!!r.depositVoucherId || !can.write} checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                    </td>
                    <td className="px-3 py-2">
                      <Link className="text-primary hover:underline" to={`${base}/vouchers/${r.voucherId}`}>
                        {digits(r.voucherNumber)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{digits(r.dateBs)}</td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{digits(r.pan)}</td>
                    <td className="num px-3 py-2">{money(r.gross)}</td>
                    <td className="num px-3 py-2 font-medium">{money(r.tds)}</td>
                    <td className="px-3 py-2">
                      {r.depositVoucherId ? (
                        <Link to={`${base}/vouchers/${r.depositVoucherId}`}>
                          <Badge tone="warn">{t('tds.depositing')}</Badge>
                        </Link>
                      ) : (
                        <Badge tone="danger">
                          {digits(Math.max(0, diffBsDays(r.dateBs, todayBs())))} d
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {can.write && !!free.length && (
        <Card className="mt-4 flex flex-wrap items-end gap-3 p-4">
          <Field label={t('common.date')} className="w-44">
            <BsDateInput value={date} onChange={setDate} min={fy?.startBs} max={fy?.endBs} />
          </Field>
          <Field label={t('tds.eftRef')} className="w-56">
            <Input value={eft} onChange={(e) => setEft(e.target.value)} />
          </Field>
          <div className="ml-auto text-right">
            <div className="text-sm text-subtle">
              {t('tds.selected')}: {digits(sel.size)}
            </div>
            <div className="text-lg font-semibold tabular-nums">रु. {paisa(total)}</div>
          </div>
          <Button disabled={!sel.size || !date} onClick={() => (setErr(null), setConfirm(true))}>
            <Receipt className="h-4 w-4" /> {t('tds.deposit')}
          </Button>
        </Card>
      )}
      <Confirm open={confirm} title={t('tds.deposit')} message={`${t('confirm.deposit')} (रु. ${paisa(total)})`} busy={busy} error={err} onCancel={() => setConfirm(false)} onConfirm={deposit} />
    </div>
  );
}

/** Per-fund dashboard: budget utilisation per head with 0% / >90% / exceeded warnings, workflow counts, pending TDS. */
export function FundDashboard() {
  const { t } = useTranslation();
  const { fund, base } = useFund();
  const { fy } = useSession();
  const { money, paisa, digits, name } = useFmt();
  const s = useSummaries();
  const heads = useQuery({ queryKey: ['budget-position', fund.id, fy?.id], queryFn: () => api<BudgetHead[]>(`/funds/${fund.id}/budget-position?fy=${fy!.id}`), enabled: !!fy });
  const sm = s.data?.find((x) => x.fund.id === fund.id);
  if (!sm || heads.isLoading) return <Spinner />;
  const budgeted = (heads.data ?? []).filter((h) => parseAmount(h.allocated) > 0n || parseAmount(h.spent) !== 0n);
  const daysLeft = fy ? Math.max(0, diffBsDays(todayBs(), fy.endBs)) : 0;
  const tiles: [string, ReactNode, string?, string?][] = [
    [t('home.bank'), money(sm.bank)],
    [t('common.allocated'), money(sm.allocated)],
    [t('common.spent'), `${money(sm.spent)} (${digits(pct(sm.spent, sm.allocated))}%)`],
    [t('home.awaitingApproval'), digits(sm.counts.SUBMITTED ?? 0), `${base}/vouchers`, (sm.counts.SUBMITTED ?? 0) > 0 ? 'text-warn' : ''],
    [t('home.drafts'), digits(sm.counts.DRAFT ?? 0), `${base}/vouchers`],
    [t('home.rejected'), digits(sm.rejected), `${base}/vouchers`, sm.rejected ? 'text-danger' : ''],
    [t('home.tdsPending'), money(sm.pendingTds), `${base}/tds`, parseAmount(sm.pendingTds) > 0n ? 'text-warn' : ''],
    [t('home.daysLeft'), digits(daysLeft), undefined, daysLeft <= 45 ? 'text-danger' : ''],
  ];
  return (
    <div>
      <FundCrumb />
      <PageTitle>{name(fund)}</PageTitle>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, to, tone]) => {
          const inner = (
            <Card className="h-full p-4">
              <div className="text-sm text-subtle">{label}</div>
              <div className={cx('mt-1 text-lg font-semibold tabular-nums', tone)}>{value}</div>
            </Card>
          );
          return to ? (
            <Link key={label} to={to} className="hover:opacity-90">
              {inner}
            </Link>
          ) : (
            <div key={label}>{inner}</div>
          );
        })}
      </div>
      {daysLeft <= 45 && parseAmount(sm.allocated) > parseAmount(sm.spent) && (
        <Card className="mb-6 flex items-center gap-2 border-warn/50 bg-warn-soft p-3 text-sm text-warn">
          <AlertTriangle className="h-4 w-4" /> {t('home.daysLeft')}: {digits(daysLeft)} · {t('common.remaining')} रु. {paisa(parseAmount(sm.allocated) - parseAmount(sm.spent))}
        </Card>
      )}
      <div className="mb-6">
        <TrendPanel fundId={fund.id} />
      </div>
      <Card>
        <div className="border-b border-border px-4 py-3 font-semibold">{t('home.spentPct')}</div>
        {!budgeted.length ? (
          <Empty />
        ) : (
          <div className="divide-y divide-border">
            {budgeted.map((h) => {
              const p = pct(h.spent, h.allocated);
              return (
                <div key={h.id} className="grid items-center gap-2 px-4 py-3 sm:grid-cols-[2fr_3fr_1fr]">
                  <div className="text-sm">
                    <div className="font-medium">{name(h)}</div>
                    <div className="text-xs text-subtle">
                      {digits(h.code)} · {money(h.spent)} / {money(h.allocated)}
                    </div>
                  </div>
                  <Progress value={p} />
                  <div className="flex items-center justify-end gap-2 text-sm tabular-nums">
                    {p === 0 && <Badge tone="neutral">0%</Badge>}
                    {p > 100 ? <Badge tone="danger">{digits(p)}%</Badge> : p >= 90 ? <Badge tone="warn">{digits(p)}%</Badge> : p > 0 && <span>{digits(p)}%</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Menu items scheduled for the next delivery phase. */
export function NextPhase({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <div>
      <FundCrumb page={t(titleKey)} />
      <PageTitle>{t(titleKey)}</PageTitle>
      <Card className="p-8 text-center text-subtle">{t('common.comingSoon')}</Card>
    </div>
  );
}

