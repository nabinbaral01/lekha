import { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Eye, Plus, Save, Send, Trash2, UserPlus } from 'lucide-react';
import { computeTds, formatNepali, parseAmount, toLatinDigits, TdsRounding } from '@pa/core';
import { api, ApiError, post, put } from '../lib/api';
import { useSession } from '../lib/session';
import { useFmt } from '../lib/prefs';
import type { Account, BudgetHead, Payee } from '../lib/types';
import { FundCrumb, useFund } from '../components/Layout';
import { BsDateInput } from '../components/BsDateInput';
import { Form203, F203Data } from '../components/Form203';
import { PayeeForm } from '../components/PayeeForm';
import { Badge, Button, Card, Combobox, cx, ErrorBox, Field, Input, Modal, PageTitle, Select, Spinner, Textarea } from '../components/ui';

interface PayRow {
  payeeId: string | null;
  billNo: string;
  billDateBs: string;
  gross: string;
  vatIncluded: boolean;
  taxCode: string;
  override: boolean;
  tdsOverride: string;
  tdsOverrideReason: string;
}
interface ManualLine {
  side: 'DR' | 'CR';
  accountId: string | null;
  amount: string;
  activityNo: string;
  componentNo: string;
  src1Agency: string;
  src1Method: string;
  src2Agency: string;
  src2Method: string;
}
const emptyPay = (): PayRow => ({ payeeId: null, billNo: '', billDateBs: '', gross: '', vatIncluded: false, taxCode: 'NON_VAT_FIRM', override: false, tdsOverride: '', tdsOverrideReason: '' });
const emptyLine = (side: 'DR' | 'CR'): ManualLine => ({ side, accountId: null, amount: '', activityNo: '', componentNo: '', src1Agency: '', src1Method: '', src2Agency: '', src2Method: '' });

const amt = (s: string): bigint | null => {
  try {
    const v = parseAmount(toLatinDigits(s));
    return v > 0n ? v : null;
  } catch {
    return null;
  }
};

/** Enter moves to the next field, like filling the paper form (Shift+Enter goes back). */
function enterToNext(e: KeyboardEvent<HTMLFormElement>) {
  const el = e.target as HTMLElement;
  if (e.key !== 'Enter' || e.defaultPrevented || el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON') return;
  e.preventDefault();
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])'));
  const i = items.indexOf(el);
  items[e.shiftKey ? i - 1 : i + 1]?.focus();
}

export default function VoucherEntry() {
  const { t } = useTranslation();
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { fund, base } = useFund();
  const { meta, fy } = useSession();
  const { money, paisa, name, digits } = useFmt();

  const defaultDate = meta && fy ? (meta.todayBs >= fy.startBs && meta.todayBs <= fy.endBs ? meta.todayBs : fy.startBs) : '';
  const [mode, setMode] = useState<'PAYMENT' | 'MANUAL'>('PAYMENT');
  const [h, setH] = useState({ type: 'NORMAL', dateBs: defaultDate, budgetSubHeadId: '', projectName: '', eftRef: '', narration: '' });
  const [pay, setPay] = useState({ expenseAccountId: null as string | null, paymentMethod: 'EFT', activityNo: '', componentNo: '', src1Agency: '', src1Method: '', src2Agency: '', src2Method: '' });
  const [rows, setRows] = useState<PayRow[]>([emptyPay()]);
  const [lines, setLines] = useState<ManualLine[]>([emptyLine('DR'), emptyLine('CR')]);
  const [version, setVersion] = useState<number | undefined>();
  const [err, setErr] = useState<unknown>(null);
  const [warn, setWarn] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<F203Data | null>(null);
  const [newPayeeFor, setNewPayeeFor] = useState<number | null>(null);

  const heads = useQuery({ queryKey: ['budget-position', fund.id, fy?.id], queryFn: () => api<BudgetHead[]>(`/funds/${fund.id}/budget-position?fy=${fy!.id}`), enabled: !!fy });
  const payees = useQuery({ queryKey: ['payees'], queryFn: () => api<Payee[]>('/payees') });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounts') });
  const existing = useQuery({ queryKey: ['voucher', id], queryFn: () => api<any>(`/vouchers/${id}`), enabled: !!id }); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    if (!h.dateBs && defaultDate) setH((x) => ({ ...x, dateBs: defaultDate }));
  }, [defaultDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load an existing draft for editing.
  useEffect(() => {
    const v = existing.data;
    if (!v) return;
    setVersion(v.version);
    setH({ type: v.type, dateBs: v.dateBs, budgetSubHeadId: v.budgetSubHeadId ?? '', projectName: v.projectName, eftRef: v.eftRef, narration: v.narration });
    if (v.mode === 'PAYMENT') {
      setMode('PAYMENT');
      const exp = v.lines.find((l: { accountKind: string }) => l.accountKind === 'EXPENSE');
      setPay({ expenseAccountId: exp?.accountId ?? null, paymentMethod: 'EFT', activityNo: exp?.activityNo ?? '', componentNo: exp?.componentNo ?? '', src1Agency: exp?.src1Agency ?? '', src1Method: exp?.src1Method ?? '', src2Agency: exp?.src2Agency ?? '', src2Method: exp?.src2Method ?? '' });
      setRows(
        v.payees.map((p: { payeeId: string; billNo: string; billDateBs: string; gross: string; vatIncluded: boolean; taxCode: string; tds: string; tdsOverrideReason: string | null }) => ({
          payeeId: p.payeeId, billNo: p.billNo, billDateBs: p.billDateBs, gross: p.gross, vatIncluded: p.vatIncluded, taxCode: p.taxCode ?? 'NON_VAT_FIRM',
          override: !!p.tdsOverrideReason && p.taxCode !== 'EXEMPT', tdsOverride: p.tds, tdsOverrideReason: p.tdsOverrideReason ?? '',
        })),
      );
    } else {
      setMode('MANUAL');
      setLines(v.lines.map((l: ManualLine) => ({ ...l })));
    }
  }, [existing.data]);

  const rule = (code: string) => meta?.taxRules.find((r) => r.code === code);
  const calc = (r: PayRow) => {
    const g = amt(r.gross);
    const tr = rule(r.taxCode);
    if (!g || !tr || !meta) return null;
    const c = computeTds({ bill: g, vatIncluded: r.vatIncluded, rateBp: tr.rateBp, vatRateBp: meta.org.vatRateBp, rounding: meta.org.tdsRounding as TdsRounding });
    const o = r.override ? amt(r.tdsOverride) ?? (r.tdsOverride.trim() === '0' ? 0n : null) : null;
    const tds = o ?? c.tds;
    return { ...c, tds, net: g - tds };
  };
  const totals = useMemo(() => {
    let gross = 0n;
    let tds = 0n;
    for (const r of rows) {
      const c = calc(r);
      if (c) (gross += amt(r.gross)!), (tds += c.tds);
    }
    return { gross, tds, net: gross - tds };
  }, [rows, meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const manualTotals = useMemo(() => {
    let dr = 0n;
    let cr = 0n;
    for (const l of lines) {
      const a = amt(l.amount) ?? 0n;
      l.side === 'DR' ? (dr += a) : (cr += a);
    }
    return { dr, cr };
  }, [lines]);

  const head = heads.data?.find((x) => x.id === pay.expenseAccountId);
  const remainingAfter = head ? parseAmount(head.remaining) - totals.gross : null;

  const payeeById = (pid: string | null) => payees.data?.find((p) => p.id === pid);
  const pickPayee = (i: number, pid: string, fresh?: Payee) => {
    const p = fresh ?? payeeById(pid);
    setRows((rs) =>
      rs.map((r, k) =>
        k !== i ? r : { ...r, payeeId: pid, vatIncluded: !!p?.vatRegistered, taxCode: p?.defaultTaxCode || (p?.vatRegistered ? 'VAT_SUPPLIER' : p?.payeeType === 'INDIVIDUAL' ? 'INDIVIDUAL_SERVICE' : 'NON_VAT_FIRM') },
      ),
    );
  };
  const setRow = (i: number, patch: Partial<PayRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const setLine = (i: number, patch: Partial<ManualLine>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const body = (confirmDuplicate = false) => ({
    ...h,
    budgetSubHeadId: h.budgetSubHeadId || null,
    mode,
    confirmDuplicate,
    version,
    ...(mode === 'PAYMENT'
      ? {
          payment: {
            ...pay,
            payees: rows.map((r) => ({
              payeeId: r.payeeId,
              billNo: r.billNo,
              billDateBs: r.billDateBs,
              gross: toLatinDigits(r.gross),
              vatIncluded: r.vatIncluded,
              taxCode: r.taxCode,
              ...(r.override ? { tdsOverride: toLatinDigits(r.tdsOverride || '0') } : {}),
              ...(r.override || r.taxCode === 'EXEMPT' ? { tdsOverrideReason: r.tdsOverrideReason } : {}),
            })),
          },
        }
      : { lines: lines.map((l) => ({ ...l, amount: toLatinDigits(l.amount) })) }),
  });

  const run = async (kind: 'preview' | 'save' | 'submit', confirmDuplicate = false) => {
    setBusy(kind);
    setErr(null);
    setWarn(null);
    try {
      if (kind === 'preview') {
        const p = await post<F203Data & { total: string }>(`/funds/${fund.id}/vouchers/preview`, body(confirmDuplicate));
        setPreview({ ...p, type: h.type, number: null, dateBs: h.dateBs, eftRef: h.eftRef, projectName: h.projectName, narration: h.narration, totals: { debit: p.total, credit: p.total }, budgetSubHead: meta?.subHeads.find((s) => s.id === h.budgetSubHeadId) ?? null });
        return;
      }
      const v = id ? await put<{ id: string; version: number }>(`/vouchers/${id}`, body(confirmDuplicate)) : await post<{ id: string; version: number }>(`/funds/${fund.id}/vouchers`, body(confirmDuplicate));
      if (kind === 'submit') await post(`/vouchers/${v.id}/submit`, { version: v.version });
      qc.invalidateQueries();
      nav(`${base}/vouchers/${v.id}`);
    } catch (x) {
      if (x instanceof ApiError && x.code === 'VOUCHER_WARNINGS') setWarn(x);
      else setErr(x);
    } finally {
      setBusy(null);
    }
  };
  const [lastAction, setLastAction] = useState<'preview' | 'save' | 'submit'>('save');
  const act = (k: 'preview' | 'save' | 'submit') => (setLastAction(k), run(k));

  if (!meta || !fy || heads.isLoading || (id && existing.isLoading)) return <Spinner />;
  if (existing.data && existing.data.status !== 'DRAFT') return <ErrorBox error={new ApiError(409, 'VOUCHER_NOT_DRAFT')} />;
  const headLabel = (x: BudgetHead) => `${x.code}${x.activityNo ? `/${x.activityNo}` : ''} · ${name(x)}`;
  const accLabel = (a: Account) => `${a.code}${a.activityNo ? `/${a.activityNo}` : ''} · ${name(a)}`;
  const manualAccounts = (accounts.data ?? []).filter((a) => a.active && (a.kind !== 'EXPENSE' || a.nature === fund.nature));

  return (
    <div>
      <FundCrumb page={t('nav.voucherEntry')} />
      <PageTitle actions={<Badge tone="primary">{t('voucher.form')}</Badge>}>
        {t('nav.voucherEntry')} — {name(fund)}
      </PageTitle>

      <form onKeyDown={enterToNext} onSubmit={(e) => e.preventDefault()} className="space-y-4">
        {/* Header (Form 203 top section) */}
        <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('common.date')}>
            <BsDateInput autoFocus value={h.dateBs} onChange={(v) => setH({ ...h, dateBs: v })} min={fy.startBs} max={fy.endBs} />
          </Field>
          <Field label={t('voucher.type')}>
            <Select value={h.type} onChange={(e) => setH({ ...h, type: e.target.value })}>
              {['NORMAL', 'ADJUSTMENT', 'REVERSAL'].map((k) => (
                <option key={k} value={k}>
                  {t(`vtype.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('voucher.subHead')}>
            <Select value={h.budgetSubHeadId} onChange={(e) => setH({ ...h, budgetSubHeadId: e.target.value })}>
              <option value="">—</option>
              {meta.subHeads.map((s) => (
                <option key={s.id} value={s.id}>
                  {digits(s.code)} {name(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('voucher.project')} className="lg:col-span-2">
            <Input value={h.projectName} onChange={(e) => setH({ ...h, projectName: e.target.value })} />
          </Field>
          <Field label={t('voucher.eft')}>
            <Input value={h.eftRef} onChange={(e) => setH({ ...h, eftRef: e.target.value })} />
          </Field>
        </Card>

        {/* Mode switch */}
        {!id && (
          <div className="flex gap-1 rounded-lg bg-muted p-1 sm:w-fit">
            {(['PAYMENT', 'MANUAL'] as const).map((m) => (
              <button type="button" key={m} onClick={() => setMode(m)} className={cx('flex-1 rounded-md px-4 py-2 text-sm font-medium sm:flex-none', mode === m ? 'bg-surface shadow-sm' : 'text-subtle')}>
                {t(m === 'PAYMENT' ? 'entry.modePayment' : 'entry.modeManual')}
              </button>
            ))}
          </div>
        )}

        {mode === 'PAYMENT' ? (
          <>
            <Card className="space-y-4 p-4">
              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <Field label={`१. ${t('entry.head')}`}>
                  <Combobox
                    items={heads.data ?? []}
                    value={pay.expenseAccountId}
                    onChange={(v) => setPay({ ...pay, expenseAccountId: v })}
                    getKey={(x) => x.id}
                    getLabel={headLabel}
                    placeholder={t('entry.chooseHead')}
                    renderItem={(x) => (
                      <div className="flex justify-between gap-3">
                        <span>{headLabel(x)}</span>
                        <span className={cx('tabular-nums', parseAmount(x.remaining) <= 0n ? 'text-danger' : 'text-subtle')}>
                          {t('entry.budgetLeft')}: {money(x.remaining)}
                        </span>
                      </div>
                    )}
                  />
                </Field>
                <Field label={t('entry.method')}>
                  <Select value={pay.paymentMethod} onChange={(e) => setPay({ ...pay, paymentMethod: e.target.value })}>
                    <option value="EFT">{t('entry.EFT')}</option>
                    <option value="CHEQUE">{t('entry.CHEQUE')}</option>
                  </Select>
                </Field>
              </div>
              {head && (
                <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-sm sm:grid-cols-4">
                  <div>
                    <div className="text-subtle">{t('common.allocated')}</div>
                    <div className="tabular-nums font-medium">{money(head.allocated)}</div>
                  </div>
                  <div>
                    <div className="text-subtle">{t('common.spent')}</div>
                    <div className="tabular-nums font-medium">{money(head.spent)}</div>
                  </div>
                  <div>
                    <div className="text-subtle">{t('common.pending')}</div>
                    <div className="tabular-nums font-medium">{money(head.pending)}</div>
                  </div>
                  <div>
                    <div className="text-subtle">{t('entry.budgetLeft')}</div>
                    <div className={cx('tabular-nums font-semibold', remainingAfter! < 0n ? 'text-danger' : 'text-success')}>{paisa(remainingAfter!)}</div>
                  </div>
                </div>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer text-subtle">
                  {t('voucher.activity')} · {t('voucher.component')} · {t('voucher.source')}
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {(['activityNo', 'componentNo', 'src1Agency', 'src1Method', 'src2Agency', 'src2Method'] as const).map((k) => (
                    <Field key={k} label={{ activityNo: t('voucher.activity'), componentNo: t('voucher.component'), src1Agency: `${t('voucher.primary')}: ${t('voucher.agency')}`, src1Method: `${t('voucher.primary')}: ${t('voucher.method')}`, src2Agency: `${t('voucher.secondary')}: ${t('voucher.agency')}`, src2Method: `${t('voucher.secondary')}: ${t('voucher.method')}` }[k]}>
                      <Input value={pay[k]} placeholder={k === 'activityNo' ? head?.activityNo : ''} onChange={(e) => setPay({ ...pay, [k]: e.target.value })} />
                    </Field>
                  ))}
                </div>
              </details>
            </Card>

            {rows.map((r, i) => {
              const c = calc(r);
              const p = payeeById(r.payeeId);
              return (
                <Card key={i} className="space-y-4 p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      २. {t('entry.payee')} {rows.length > 1 && digits(i + 1)}
                    </div>
                    {rows.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, k) => k !== i))}>
                        <Trash2 className="h-4 w-4" /> {t('common.remove')}
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr]">
                    <Field label={t('entry.payee')} hint={p ? `PAN ${digits(p.pan || '—')} · ${p.bankName} ${digits(p.accountNo)}${p.vatRegistered ? ' · VAT' : ''}` : undefined}>
                      <Combobox
                        items={payees.data ?? []}
                        value={r.payeeId}
                        onChange={(v) => pickPayee(i, v)}
                        getKey={(x) => x.id}
                        getLabel={(x) => `${x.name}${x.pan ? ` (${x.pan})` : ''}`}
                        placeholder={t('entry.choosePayee')}
                        footer={
                          <button type="button" onMouseDown={(e) => (e.preventDefault(), setNewPayeeFor(i))} className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-sm font-medium text-primary hover:bg-primary-soft">
                            <UserPlus className="h-4 w-4" /> {t('entry.newPayee')}
                          </button>
                        }
                      />
                    </Field>
                    <Field label={t('entry.billNo')}>
                      <Input value={r.billNo} onChange={(e) => setRow(i, { billNo: e.target.value })} />
                    </Field>
                    <Field label={t('entry.billDate')}>
                      <BsDateInput value={r.billDateBs} onChange={(v) => setRow(i, { billDateBs: v })} />
                    </Field>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-[1fr_1fr_2fr]">
                    <Field label={`३. ${t('entry.bill')}`}>
                      <Input inputMode="decimal" className="text-right text-lg tabular-nums" value={r.gross} invalid={!!r.gross && !amt(r.gross)} onChange={(e) => setRow(i, { gross: e.target.value })} />
                    </Field>
                    <Field label={t('entry.taxType')}>
                      <Select value={r.taxCode} onChange={(e) => setRow(i, { taxCode: e.target.value })}>
                        {meta.taxRules.map((tr) => (
                          <option key={tr.code} value={tr.code}>
                            {name(tr)} — {digits(tr.rateBp / 100)}%
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="flex flex-col justify-end gap-2">
                      <label className={cx('flex items-center gap-2', !p?.vatRegistered && 'opacity-50')}>
                        <input type="checkbox" className="h-4 w-4" disabled={!p?.vatRegistered} checked={r.vatIncluded} onChange={(e) => setRow(i, { vatIncluded: e.target.checked })} />
                        {t('entry.vatIncluded')}
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="h-4 w-4" checked={r.override} onChange={(e) => setRow(i, { override: e.target.checked, tdsOverride: c ? formatNepali(c.tds).replace(/,/g, '') : '' })} />
                        {t('entry.overrideTds')}
                      </label>
                    </div>
                  </div>
                  {(r.override || r.taxCode === 'EXEMPT') && (
                    <div className="grid gap-4 sm:grid-cols-[1fr_3fr]">
                      {r.override ? (
                        <Field label={t('entry.tds')}>
                          <Input inputMode="decimal" className="text-right tabular-nums" value={r.tdsOverride} onChange={(e) => setRow(i, { tdsOverride: e.target.value })} />
                        </Field>
                      ) : (
                        <div />
                      )}
                      <Field label={t('entry.overrideReason')}>
                        <Input value={r.tdsOverrideReason} invalid={r.tdsOverrideReason.trim().length < 5} onChange={(e) => setRow(i, { tdsOverrideReason: e.target.value })} />
                      </Field>
                    </div>
                  )}
                  {c && (
                    <div className="grid grid-cols-2 gap-3 rounded-lg border border-primary/30 bg-primary-soft p-3 text-sm sm:grid-cols-4">
                      <div>
                        <div className="text-subtle">{t('entry.taxable')}</div>
                        <div className="tabular-nums font-medium">{paisa(c.taxableBase)}</div>
                      </div>
                      <div>
                        <div className="text-subtle">{t('entry.vat')}</div>
                        <div className="tabular-nums font-medium">{paisa(c.vat)}</div>
                      </div>
                      <div>
                        <div className="text-subtle">{t('entry.tds')}</div>
                        <div className="tabular-nums font-semibold">{paisa(c.tds)}</div>
                      </div>
                      <div>
                        <div className="text-subtle">{t('entry.net')}</div>
                        <div className="tabular-nums text-base font-bold text-primary">{paisa(c.net)}</div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
            <Button type="button" variant="secondary" onClick={() => setRows([...rows, emptyPay()])}>
              <Plus className="h-4 w-4" /> {t('entry.addPayee')}
            </Button>

            <Card className="grid grid-cols-3 gap-3 p-4 text-center">
              <div>
                <div className="text-sm text-subtle">{t('voucher.debit')} ({t('entry.head')})</div>
                <div className="text-lg font-semibold tabular-nums">{paisa(totals.gross)}</div>
              </div>
              <div>
                <div className="text-sm text-subtle">{t('entry.tds')}</div>
                <div className="text-lg font-semibold tabular-nums">{paisa(totals.tds)}</div>
              </div>
              <div>
                <div className="text-sm text-subtle">{t('entry.net')}</div>
                <div className="text-lg font-bold tabular-nums text-primary">{paisa(totals.net)}</div>
              </div>
            </Card>
          </>
        ) : (
          <Card className="overflow-x-auto p-4">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="text-left text-subtle">
                <tr>
                  <th className="w-20 pb-2">{t('voucher.drcr')}</th>
                  <th className="pb-2">{t('entry.account')}</th>
                  <th className="w-24 pb-2">{t('voucher.activity')}</th>
                  <th className="w-24 pb-2">{t('voucher.component')}</th>
                  <th className="w-28 pb-2">{t('voucher.agency')} १</th>
                  <th className="w-28 pb-2">{t('voucher.method')} १</th>
                  <th className="w-28 pb-2">{t('voucher.agency')} २</th>
                  <th className="w-28 pb-2">{t('voucher.method')} २</th>
                  <th className="w-40 pb-2 text-right">{t('common.amount')}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-1 pr-2">
                      <Select value={l.side} onChange={(e) => setLine(i, { side: e.target.value as 'DR' | 'CR' })}>
                        <option value="DR">{t('side.DR')}</option>
                        <option value="CR">{t('side.CR')}</option>
                      </Select>
                    </td>
                    <td className="py-1 pr-2">
                      <Combobox items={manualAccounts} value={l.accountId} onChange={(v) => setLine(i, { accountId: v })} getKey={(a) => a.id} getLabel={accLabel} placeholder={t('entry.chooseHead')} />
                    </td>
                    {(['activityNo', 'componentNo', 'src1Agency', 'src1Method', 'src2Agency', 'src2Method'] as const).map((k) => (
                      <td key={k} className="py-1 pr-2">
                        <Input value={l[k]} onChange={(e) => setLine(i, { [k]: e.target.value })} />
                      </td>
                    ))}
                    <td className="py-1 pr-2">
                      <Input inputMode="decimal" className="text-right tabular-nums" value={l.amount} invalid={!!l.amount && !amt(l.amount)} onChange={(e) => setLine(i, { amount: e.target.value })} />
                    </td>
                    <td className="py-1">
                      {lines.length > 2 && (
                        <button type="button" className="p-2 text-subtle hover:text-danger" onClick={() => setLines(lines.filter((_, k) => k !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={8} className="pt-3 text-right">
                    {t('voucher.debit')} {paisa(manualTotals.dr)} · {t('voucher.credit')} {paisa(manualTotals.cr)}
                  </td>
                  <td className={cx('pt-3 text-right tabular-nums', manualTotals.dr === manualTotals.cr ? 'text-success' : 'text-danger')}>
                    {manualTotals.dr === manualTotals.cr ? `✓ ${t('entry.balanced')}` : `${t('entry.difference')} ${paisa(manualTotals.dr - manualTotals.cr)}`}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => setLines([...lines, emptyLine('DR')])}>
              <Plus className="h-4 w-4" /> {t('entry.addLine')}
            </Button>
          </Card>
        )}

        <Card className="p-4">
          <Field label={t('voucher.narration')}>
            <Textarea value={h.narration} onChange={(e) => setH({ ...h, narration: e.target.value })} />
          </Field>
        </Card>

        {!!err && <ErrorBox error={err} />}
        {warn && (
          <div className="space-y-2">
            <ErrorBox error={warn} tone="warn" />
            <Button type="button" variant="secondary" onClick={() => run(lastAction, true)}>
              {t('entry.duplicateConfirm')}
            </Button>
          </div>
        )}

        <div className="no-print sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur">
          <Button type="button" variant="secondary" busy={busy === 'preview'} onClick={() => act('preview')}>
            <Eye className="h-4 w-4" /> {t('common.preview')}
          </Button>
          <Button type="button" variant="secondary" busy={busy === 'save'} onClick={() => act('save')}>
            <Save className="h-4 w-4" /> {t('common.saveDraft')}
          </Button>
          <Button type="button" busy={busy === 'submit'} onClick={() => act('submit')}>
            <Send className="h-4 w-4" /> {t('common.save')} + {t('common.submit')}
          </Button>
        </div>
      </form>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={t('entry.previewTitle')} wide>
        {preview && <Form203 v={preview} />}
      </Modal>
      <Modal open={newPayeeFor !== null} onClose={() => setNewPayeeFor(null)} title={t('entry.newPayee')}>
        <PayeeForm
          onSaved={(p) => {
            qc.setQueryData<Payee[]>(['payees'], (old) => [...(old ?? []), p]);
            if (newPayeeFor !== null) pickPayee(newPayeeFor, p.id, p);
            setNewPayeeFor(null);
          }}
        />
      </Modal>
    </div>
  );
}

