import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Coins, Send } from 'lucide-react';
import { parseAmount, toLatinDigits } from '@pa/core';
import { api, post } from '../lib/api';
import { useSession } from '../lib/session';
import { useFmt } from '../lib/prefs';
import type { Fund, Money, Nature, Source, VoucherStatus } from '../lib/types';
import { Breadcrumb } from '../components/Layout';
import { BsDateInput } from '../components/BsDateInput';
import { Button, Card, cx, Empty, ErrorBox, Field, Input, Select, Spinner, StatusBadge } from '../components/ui';

export interface IncomeReport {
  fiscalYear: { id: string; code: string };
  funds: Fund[];
  heads: { id: string; code: string; nameNe: string; nameEn: string; active: boolean; received: Money; pending: Money }[];
  totals: { received: Money; pending: Money };
  vouchers: {
    id: string; number: number | null; dateBs: string; status: VoucherStatus; rejectComment: string | null; narration: string; amount: Money;
    fund: { id: string; source: Source; nature: Nature }; accountId: string | null; depositTo: 'BANK' | 'CASH'; receivedFrom: string; receiptNo: string;
  }[];
}

export function useIncome(source: string) {
  const { fy } = useSession();
  return useQuery({ queryKey: ['income', source, fy?.id], queryFn: () => api<IncomeReport>(`/reports/income/${source}?fy=${fy!.id}`), enabled: !!fy && (source === 'INTERNAL' || source === 'GRANT') });
}

const amt = (s: string): bigint | null => {
  try {
    const v = parseAmount(toLatinDigits(s));
    return v > 0n ? v : null;
  } catch {
    return null;
  }
};

/** आन्तरिक / अनुदान → आम्दानी: income received per income head, and entry of new income vouchers. */
export default function IncomePage() {
  const { t } = useTranslation();
  const { source = '' } = useParams();
  const SRC = source.toUpperCase() as Source;
  const { meta, fy, can } = useSession();
  const { money, digits, name } = useFmt();
  const qc = useQueryClient();
  const r = useIncome(SRC);

  const defaultDate = meta && fy ? (meta.todayBs >= fy.startBs && meta.todayBs <= fy.endBs ? meta.todayBs : fy.startBs) : '';
  const blank = { dateBs: defaultDate, nature: 'RECURRENT' as Nature, headId: '', amount: '', receivedFrom: '', receiptNo: '', depositTo: 'BANK' as 'BANK' | 'CASH', narration: '' };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  if (SRC !== 'INTERNAL' && SRC !== 'GRANT') return null;
  if (r.isLoading || !fy || !meta) return <Spinner />;
  const data = r.data;
  const heads = data?.heads ?? [];
  const head = heads.find((h) => h.id === f.headId);
  const amount = amt(f.amount);
  const fund = meta.funds.find((x) => x.source === SRC && x.nature === f.nature);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fund || !head || !amount) return;
    setBusy(true);
    setErr(null);
    setDone(false);
    try {
      const v = await post<{ id: string; version: number }>(`/funds/${fund.id}/vouchers`, {
        dateBs: f.dateBs,
        narration: f.narration.trim() || t('income.narration', { head: head.nameNe }),
        mode: 'RECEIPT',
        receipt: { revenueAccountId: head.id, depositTo: f.depositTo, amount: toLatinDigits(f.amount), receivedFrom: f.receivedFrom, receiptNo: f.receiptNo },
      });
      await post(`/vouchers/${v.id}/submit`, { version: v.version });
      setF({ ...blank, dateBs: f.dateBs, nature: f.nature, depositTo: f.depositTo });
      setDone(true);
      qc.invalidateQueries();
    } catch (x) {
      setErr(x);
    } finally {
      setBusy(false);
    }
  };

  const pct = (m: Money) => {
    const total = parseAmount(data?.totals.received ?? '0');
    return total > 0n ? Number((parseAmount(m) * 1000n) / total) / 10 : 0;
  };

  return (
    <div>
      <Breadcrumb items={[{ label: t(`nav.${SRC}`), to: `/f/${source}` }, { label: t('nav.INCOME') }]} />
      <h1 className="mb-6 text-2xl font-semibold">
        {t(`nav.${SRC}`)} — {t('nav.INCOME')}
      </h1>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3 p-4">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-success-soft text-success">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm text-subtle">{t('income.total')}</div>
            <div className="text-lg font-semibold tabular-nums">रु. {money(data?.totals.received)}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className={cx('grid h-10 w-10 place-items-center rounded-lg', parseAmount(data?.totals.pending ?? '0') > 0n ? 'bg-warn-soft text-warn' : 'bg-primary-soft text-primary')}>
            <Send className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm text-subtle">{t('income.pending')}</div>
            <div className="text-lg font-semibold tabular-nums">रु. {money(data?.totals.pending)}</div>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="overflow-x-auto">
          <div className="border-b border-border px-4 py-3 font-semibold">{t('income.bySource')}</div>
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-subtle">
              <tr>
                <th className="px-3 py-2">{t('income.code')}</th>
                <th className="px-3 py-2">{t('income.head')}</th>
                <th className="px-3 py-2 text-right">{t('income.received')}</th>
                <th className="px-3 py-2 text-right">{t('income.pending')}</th>
                <th className="w-32 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {heads.map((h) => (
                <tr key={h.id} className={cx('border-t border-border', !h.active && 'text-subtle')}>
                  <td className="px-3 py-2 tabular-nums">{digits(h.code)}</td>
                  <td className="px-3 py-2">{name(h)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(h.received)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-subtle">{parseAmount(h.pending) > 0n ? money(h.pending) : ''}</td>
                  <td className="px-3 py-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-success" style={{ width: `${pct(h.received)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
              {!heads.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-subtle">
                    {t('income.noHeads')}
                  </td>
                </tr>
              )}
            </tbody>
            {!!heads.length && (
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-3 py-2" colSpan={2}>
                    {t('common.total')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(data?.totals.received)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-subtle">{parseAmount(data?.totals.pending ?? '0') > 0n ? money(data?.totals.pending) : ''}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
          {can.admin && (
            <p className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-warn">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {t('income.verifyCodes')}
            </p>
          )}
        </Card>

        {can.write && (
          <Card className="p-5">
            <h2 className="mb-4 text-lg font-semibold">{t('income.new')}</h2>
            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
              <Field label={t('common.date')}>
                <BsDateInput value={f.dateBs} onChange={(v) => setF({ ...f, dateBs: v })} min={fy.startBs} max={fy.endBs} />
              </Field>
              <Field label={t('income.fund')} hint={t('income.fundHint')}>
                <Select value={f.nature} onChange={(e) => setF({ ...f, nature: e.target.value as Nature })}>
                  <option value="RECURRENT">{t('nav.RECURRENT')}</option>
                  <option value="CAPITAL">{t('nav.CAPITAL')}</option>
                </Select>
              </Field>
              <Field label={t('income.head')} className="sm:col-span-2">
                <Select value={f.headId} onChange={(e) => setF({ ...f, headId: e.target.value })}>
                  <option value="">{t('income.chooseHead')}</option>
                  {heads
                    .filter((h) => h.active)
                    .map((h) => (
                      <option key={h.id} value={h.id}>
                        {digits(h.code)} — {name(h)}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label={`${t('common.amount')} (रु.)`}>
                <Input inputMode="decimal" className="text-right tabular-nums" value={f.amount} invalid={!!f.amount && !amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
              </Field>
              <Field label={t('income.depositTo')}>
                <Select value={f.depositTo} onChange={(e) => setF({ ...f, depositTo: e.target.value as 'BANK' | 'CASH' })}>
                  <option value="BANK">{t('income.BANK')}</option>
                  <option value="CASH">{t('income.CASH')}</option>
                </Select>
              </Field>
              <Field label={t('income.receivedFrom')}>
                <Input value={f.receivedFrom} onChange={(e) => setF({ ...f, receivedFrom: e.target.value })} />
              </Field>
              <Field label={`${t('income.receiptNo')} (${t('common.optional')})`}>
                <Input value={f.receiptNo} onChange={(e) => setF({ ...f, receiptNo: e.target.value })} />
              </Field>
              <Field label={t('voucher.narration')} className="sm:col-span-2">
                <Input value={f.narration} placeholder={head ? t('income.narration', { head: head.nameNe }) : ''} onChange={(e) => setF({ ...f, narration: e.target.value })} />
              </Field>
              <div className="sm:col-span-2">
                <ErrorBox error={err} />
                {done && (
                  <p className="flex items-center gap-2 rounded-md bg-success-soft p-3 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> {t('income.saved')}
                  </p>
                )}
              </div>
              <div className="flex justify-end sm:col-span-2">
                <Button busy={busy} disabled={!head || !amount || !f.receivedFrom.trim() || !f.dateBs}>
                  <Send className="h-4 w-4" /> {t('common.submit')}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>

      <Card className="mt-6 overflow-x-auto">
        <div className="border-b border-border px-4 py-3 font-semibold">{t('income.list')}</div>
        {data?.vouchers.length ? (
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-subtle">
              <tr>
                <th className="px-3 py-2">{t('voucher.number')}</th>
                <th className="px-3 py-2">{t('common.date')}</th>
                <th className="px-3 py-2">{t('income.head')}</th>
                <th className="px-3 py-2">{t('income.receivedFrom')}</th>
                <th className="px-3 py-2">{t('income.receiptNo')}</th>
                <th className="px-3 py-2">{t('income.fund')}</th>
                <th className="px-3 py-2 text-right">{t('common.amount')}</th>
                <th className="px-3 py-2">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {data.vouchers.map((v) => {
                const h = heads.find((x) => x.id === v.accountId);
                return (
                  <tr key={v.id} className="border-t border-border hover:bg-muted/50">
                    <td className="px-3 py-2 tabular-nums">
                      <Link className="text-primary hover:underline" to={`/f/${source}/${v.fund.nature.toLowerCase()}/vouchers/${v.id}`}>
                        {v.number != null ? digits(v.number) : t('voucher.draftNo')}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{digits(v.dateBs)}</td>
                    <td className="px-3 py-2">{h ? name(h) : ''}</td>
                    <td className="px-3 py-2">{v.receivedFrom}</td>
                    <td className="px-3 py-2">{digits(v.receiptNo)}</td>
                    <td className="px-3 py-2">
                      {t(`nav.${v.fund.nature}`)} · {t(`income.${v.depositTo}`)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(v.amount)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={v.status} rejected={!!v.rejectComment} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <Empty />
        )}
      </Card>
    </div>
  );
}
