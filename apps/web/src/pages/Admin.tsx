import { FormEvent, ReactNode, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Lock, LockOpen, Plus, ShieldAlert, ShieldCheck } from 'lucide-react';
import { BS_MONTHS_EN, BS_MONTHS_NE, fiscalMonths, toLatinDigits } from '@pa/core';
import { api, patch, post } from '../lib/api';
import { useSession } from '../lib/session';
import { useFmt } from '../lib/prefs';
import type { Account, BudgetHead, Org, Payee, Role, TaxRule } from '../lib/types';
import { Breadcrumb } from '../components/Layout';
import { BsDateInput } from '../components/BsDateInput';
import { PayeeForm } from '../components/PayeeForm';
import { Badge, Button, Card, cx, Empty, ErrorBox, Field, Input, Modal, PageTitle, Select, Spinner } from '../components/ui';

/** Runs an async save with busy/error state; refreshes cached data on success. */
function useSave() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [ok, setOk] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      await fn();
      await qc.invalidateQueries();
      setOk(true);
      return true;
    } catch (x) {
      setErr(x);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, ok, run };
}

const TABS = ['org', 'subheads', 'budget', 'opening', 'numbering', 'periods', 'users', 'taxes', 'accounts', 'payees'] as const;

export default function Admin() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<(typeof TABS)[number]>('budget');
  return (
    <div>
      <Breadcrumb items={[{ label: t('nav.admin') }]} />
      <PageTitle>{t('nav.admin')}</PageTitle>
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((k) => (
          <button key={k} onClick={() => setTab(k)} className={cx('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', tab === k ? 'border-primary text-primary' : 'border-transparent text-subtle hover:text-fg')}>
            {k === 'payees' ? t('entry.payee') : t(`admin.${k}`)}
          </button>
        ))}
      </nav>
      {tab === 'org' && <OrgTab />}
      {tab === 'subheads' && <SubHeadsTab />}
      {tab === 'budget' && <BudgetTab />}
      {tab === 'opening' && <OpeningTab />}
      {tab === 'numbering' && <NumberingTab />}
      {tab === 'periods' && <PeriodsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'taxes' && <TaxTab />}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'payees' && <PayeesTab />}
    </div>
  );
}

function Saved({ ok }: { ok: boolean }) {
  const { t } = useTranslation();
  return ok ? <span className="text-sm text-success">✓ {t('common.save')}</span> : null;
}

function OrgTab() {
  const { t } = useTranslation();
  const { meta } = useSession();
  const [f, setF] = useState<Org | null>(meta?.org ?? null);
  const s = useSave();
  if (!f) return <Spinner />;
  const txt = (k: keyof Org, label: ReactNode) => (
    <Field label={label}>
      <Input value={String(f[k] ?? '')} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Field>
  );
  const save = (e: FormEvent) => {
    e.preventDefault();
    const { id: _id, ...rest } = f;
    const keys = ['nameNe', 'nameEn', 'govLevelNe', 'govLevelEn', 'ministryNe', 'ministryEn', 'officeCode', 'addressNe', 'addressEn', 'districtNe', 'districtEn', 'pan', 'tdsRounding', 'vatRateBp', 'sessionIdleMinutes', 'accountsHeadName', 'accountsHeadPost', 'officeHeadName', 'officeHeadPost'] as const;
    s.run(() => patch('/organization', Object.fromEntries(keys.map((k) => [k, (rest as Record<string, unknown>)[k]]))));
  };
  return (
    <Card className="p-4">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {txt('nameNe', `${t('common.name')} (नेपाली)`)}
        {txt('nameEn', `${t('common.name')} (English)`)}
        {txt('govLevelNe', 'नेपाल सरकार/प्रदेश सरकार/स्थानीय तह')}
        {txt('govLevelEn', 'Government level (English)')}
        {txt('ministryNe', 'मन्त्रालय/विभाग/कार्यालय')}
        {txt('ministryEn', 'Ministry / department (English)')}
        {txt('officeCode', t('voucher.officeCode'))}
        {txt('pan', t('voucher.pan'))}
        {txt('addressNe', `${t('payeeForm.address')} (नेपाली)`)}
        {txt('addressEn', `${t('payeeForm.address')} (English)`)}
        {txt('districtNe', `${t('statement.district')} (नेपाली)`)}
        {txt('districtEn', `${t('statement.district')} (English)`)}
        {txt('accountsHeadName', `${t('cashBook.accountsHead')} — ${t('common.name')}`)}
        {txt('accountsHeadPost', `${t('cashBook.accountsHead')} — ${t('admin.post')}`)}
        {txt('officeHeadName', `${t('cashBook.officeHead')} — ${t('common.name')}`)}
        {txt('officeHeadPost', `${t('cashBook.officeHead')} — ${t('admin.post')}`)}
        <Field label={t('admin.rounding')}>
          <Select value={f.tdsRounding} onChange={(e) => setF({ ...f, tdsRounding: e.target.value })}>
            {['UP_RUPEE', 'NEAREST_RUPEE', 'DOWN_RUPEE', 'PAISA'].map((k) => (
              <option key={k} value={k}>
                {t(`admin.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="VAT %">
          <Input type="number" step="0.01" value={f.vatRateBp / 100} onChange={(e) => setF({ ...f, vatRateBp: Math.round(Number(e.target.value) * 100) })} />
        </Field>
        <div className="sm:col-span-2">
          <ErrorBox error={s.err} />
        </div>
        <div className="flex items-center justify-end gap-3 sm:col-span-2">
          <Saved ok={s.ok} />
          <Button busy={s.busy}>{t('common.save')}</Button>
        </div>
      </form>
    </Card>
  );
}

function FundPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const { meta } = useSession();
  const { name } = useFmt();
  return (
    <Field label={t('admin.fund')}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {meta?.funds.map((f) => (
          <option key={f.id} value={f.id}>
            {name(f)}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** बजेट उपशीर्षक: the sub-head numbers from the व्यय अनुमान (रातो किताब), chosen on every voucher. */
function SubHeadsTab() {
  const { t } = useTranslation();
  const { meta } = useSession();
  const { digits } = useFmt();
  const [f, setF] = useState({ code: '', nameNe: '', nameEn: '' });
  const [edit, setEdit] = useState<{ id: string; code: string; nameNe: string; nameEn: string } | null>(null);
  const s = useSave();
  const e = useSave();
  const add = async (ev: FormEvent) => {
    ev.preventDefault();
    if (await s.run(() => post('/sub-heads', { code: toLatinDigits(f.code.trim()), nameNe: f.nameNe, nameEn: f.nameEn }))) setF({ code: '', nameNe: '', nameEn: '' });
  };
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-1 font-semibold">{t('admin.newSubHead')}</div>
        <p className="mb-3 text-sm text-subtle">{t('admin.subHeadHelp')}</p>
        <form onSubmit={add} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_2fr_auto]">
          <Field label={t('voucher.subHead')}>
            <Input value={f.code} onChange={(x) => setF({ ...f, code: x.target.value })} placeholder="३५०००१" />
          </Field>
          <Field label={`${t('common.name')} (नेपाली)`}>
            <Input value={f.nameNe} onChange={(x) => setF({ ...f, nameNe: x.target.value })} />
          </Field>
          <Field label={`${t('common.name')} (English) — ${t('common.optional')}`}>
            <Input value={f.nameEn} onChange={(x) => setF({ ...f, nameEn: x.target.value })} />
          </Field>
          <div className="flex items-end">
            <Button busy={s.busy} disabled={!f.code.trim() || !f.nameNe.trim()}>
              <Plus className="h-4 w-4" /> {t('common.add')}
            </Button>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <ErrorBox error={s.err} />
          </div>
        </form>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-subtle">
            <tr>
              <th className="px-3 py-2">{t('voucher.subHead')}</th>
              <th className="px-3 py-2">{t('common.name')}</th>
              <th className="px-3 py-2">English</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(meta?.subHeads ?? []).map((h) => (
              <tr key={h.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium tabular-nums">{digits(h.code)}</td>
                <td className="px-3 py-2">{h.nameNe}</td>
                <td className="px-3 py-2 text-subtle">{h.nameEn}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ ...h })}>
                    {t('common.edit')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!meta?.subHeads.length && <Empty />}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={t('voucher.subHead')}>
        {edit && (
          <form onSubmit={async (ev) => (ev.preventDefault(), (await e.run(() => patch(`/sub-heads/${edit.id}`, { code: toLatinDigits(edit.code.trim()), nameNe: edit.nameNe, nameEn: edit.nameEn }))) && setEdit(null))} className="space-y-3">
            <Field label={t('voucher.subHead')}>
              <Input value={edit.code} onChange={(x) => setEdit({ ...edit, code: x.target.value })} />
            </Field>
            <Field label={`${t('common.name')} (नेपाली)`}>
              <Input value={edit.nameNe} onChange={(x) => setEdit({ ...edit, nameNe: x.target.value })} />
            </Field>
            <Field label="English">
              <Input value={edit.nameEn} onChange={(x) => setEdit({ ...edit, nameEn: x.target.value })} />
            </Field>
            <ErrorBox error={e.err} />
            <div className="flex justify-end">
              <Button busy={e.busy}>{t('common.save')}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function BudgetTab() {
  const { t } = useTranslation();
  const { meta, fy } = useSession();
  const { money, name, digits } = useFmt();
  const [fundId, setFundId] = useState(meta?.funds[0]?.id ?? '');
  const heads = useQuery({ queryKey: ['budget-position', fundId, fy?.id], queryFn: () => api<BudgetHead[]>(`/funds/${fundId}/budget-position?fy=${fy!.id}`), enabled: !!fy && !!fundId });
  const [f, setF] = useState({ type: 'APPROPRIATION', accountId: '', toAccountId: '', amount: '', note: '' });
  const s = useSave();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await s.run(() => post('/budget-entries', { fiscalYearId: fy!.id, fundId, type: f.type, accountId: f.accountId, ...(f.type === 'TRANSFER' ? { toAccountId: f.toAccountId } : {}), amount: toLatinDigits(f.amount), note: f.note }));
    if (ok) setF({ ...f, amount: '', note: '' });
  };
  const headOpts = (heads.data ?? []).map((h) => (
    <option key={h.id} value={h.id}>
      {digits(h.code)}
      {h.activityNo && `/${digits(h.activityNo)}`} {name(h)}
    </option>
  ));
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FundPicker value={fundId} onChange={setFundId} />
          <Field label={t('admin.entryType')}>
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {['APPROPRIATION', 'ADDITIONAL', 'REDUCTION', 'TRANSFER'].map((k) => (
                <option key={k} value={k}>
                  {t(`admin.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('entry.head')}>
            <Select value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
              <option value="">—</option>
              {headOpts}
            </Select>
          </Field>
          {f.type === 'TRANSFER' && (
            <Field label={t('admin.toHead')}>
              <Select value={f.toAccountId} onChange={(e) => setF({ ...f, toAccountId: e.target.value })}>
                <option value="">—</option>
                {headOpts}
              </Select>
            </Field>
          )}
          <Field label={t('common.amount')}>
            <Input inputMode="decimal" className="text-right" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
          <Field label={t('admin.note')} className="lg:col-span-2">
            <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <ErrorBox error={s.err} />
          </div>
          <div className="flex items-center justify-end gap-3 sm:col-span-2 lg:col-span-3">
            <Saved ok={s.ok} />
            <Button busy={s.busy} disabled={!f.accountId || !f.amount || !f.note}>
              <Plus className="h-4 w-4" /> {t('common.add')}
            </Button>
          </div>
        </form>
      </Card>
      <Card className="overflow-x-auto">
        <div className="border-b border-border bg-warn-soft px-4 py-2 text-sm text-warn">{t('admin.verifyCodes')}</div>
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-subtle">
            <tr>
              <th className="px-3 py-2">{t('voucher.code')}</th>
              <th className="px-3 py-2">{t('voucher.headName')}</th>
              <th className="px-3 py-2 text-right">{t('common.allocated')}</th>
              <th className="px-3 py-2 text-right">{t('common.spent')}</th>
              <th className="px-3 py-2 text-right">{t('common.remaining')}</th>
            </tr>
          </thead>
          <tbody>
            {(heads.data ?? []).map((h) => (
              <tr key={h.id} className="border-t border-border">
                <td className="px-3 py-2 tabular-nums">
                  {digits(h.code)}
                  {h.activityNo && `/${digits(h.activityNo)}`}
                </td>
                <td className="px-3 py-2">{name(h)}</td>
                <td className="num px-3 py-2">{money(h.allocated)}</td>
                <td className="num px-3 py-2">{money(h.spent)}</td>
                <td className="num px-3 py-2">{money(h.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!heads.data?.length && <Empty />}
      </Card>
    </div>
  );
}

function OpeningTab() {
  const { t } = useTranslation();
  const { meta, fy } = useSession();
  const { money, name } = useFmt();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounts') });
  const list = useQuery({ queryKey: ['openings', fy?.id], queryFn: () => api<{ id: string; fundId: string; accountId: string; dateBs: string; amount: string }[]>(`/opening-balances?fy=${fy!.id}`), enabled: !!fy });
  const [f, setF] = useState({ fundId: meta?.funds[0]?.id ?? '', accountId: '', dateBs: fy?.startBs ?? '', amount: '' });
  const s = useSave();
  const nonExpense = (accounts.data ?? []).filter((a) => a.kind !== 'EXPENSE' && a.kind !== 'REVENUE');
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form onSubmit={(e) => (e.preventDefault(), s.run(() => post('/opening-balances', { ...f, amount: toLatinDigits(f.amount) })))} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FundPicker value={f.fundId} onChange={(v) => setF({ ...f, fundId: v })} />
          <Field label={t('entry.account')}>
            <Select value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
              <option value="">—</option>
              {nonExpense.map((a) => (
                <option key={a.id} value={a.id}>
                  {name(a)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.date')}>
            <BsDateInput value={f.dateBs} onChange={(v) => setF({ ...f, dateBs: v })} min={fy?.startBs} max={fy?.endBs} />
          </Field>
          <Field label={t('common.amount')} hint="Dr +, Cr −">
            <Input inputMode="decimal" className="text-right" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <ErrorBox error={s.err} />
          </div>
          <div className="flex items-center justify-end gap-3 sm:col-span-2 lg:col-span-4">
            <Saved ok={s.ok} />
            <Button busy={s.busy} disabled={!f.accountId || !f.amount}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        {(list.data ?? []).map((o) => (
          <div key={o.id} className="flex justify-between border-b border-border px-4 py-2 text-sm last:border-0">
            <span>
              {name(meta?.funds.find((x) => x.id === o.fundId))} · {name(accounts.data?.find((a) => a.id === o.accountId))} · {o.dateBs}
            </span>
            <span className="tabular-nums font-medium">{money(o.amount)}</span>
          </div>
        ))}
        {!list.data?.length && <Empty />}
      </Card>
    </div>
  );
}

function NumberingTab() {
  const { t } = useTranslation();
  const { meta, fy } = useSession();
  const [fundId, setFundId] = useState(meta?.funds[0]?.id ?? '');
  const [n, setN] = useState('1');
  const s = useSave();
  return (
    <Card className="max-w-xl p-4">
      <form onSubmit={(e) => (e.preventDefault(), s.run(() => post(`/funds/${fundId}/voucher-start-number`, { fiscalYearId: fy!.id, nextNumber: Number(toLatinDigits(n)) })))} className="space-y-4">
        <FundPicker value={fundId} onChange={setFundId} />
        <Field label={t('admin.startNumber')} hint={t('admin.startNumberHelp')}>
          <Input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} />
        </Field>
        <ErrorBox error={s.err} />
        <div className="flex items-center justify-end gap-3">
          <Saved ok={s.ok} />
          <Button busy={s.busy}>{t('common.save')}</Button>
        </div>
      </form>
    </Card>
  );
}

function PeriodsTab() {
  const { t } = useTranslation();
  const { fy, meta } = useSession();
  const { lang, digits } = useFmt();
  const locks = useQuery({ queryKey: ['locks', fy?.id], queryFn: () => api<{ bsYear: number; bsMonth: number }[]>(`/fiscal-years/${fy!.id}/locks`), enabled: !!fy });
  const s = useSave();
  const [newFy, setNewFy] = useState(String((meta?.fiscalYears[0]?.startYear ?? 2082) + 1));
  if (!fy) return <Spinner />;
  const isLocked = (y: number, m: number) => !!locks.data?.some((l) => l.bsYear === y && l.bsMonth === m);
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 font-semibold">
          {t('common.fiscalYear')} {digits(fy.code)} — {t('admin.lockMonth')}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {fiscalMonths(fy.startYear).map(({ y, m }) => {
            const locked = isLocked(y, m);
            return (
              <button
                key={`${y}-${m}`}
                onClick={() => s.run(() => post(`/fiscal-years/${fy.id}/locks`, { bsYear: y, bsMonth: m, locked: !locked }))}
                className={cx('flex items-center justify-between rounded-md border px-3 py-2 text-sm', locked ? 'border-danger/50 bg-danger-soft text-danger' : 'border-border hover:bg-muted')}
              >
                {(lang === 'ne' ? BS_MONTHS_NE : BS_MONTHS_EN)[m - 1]} {digits(y)}
                {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4 text-subtle" />}
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <ErrorBox error={s.err} />
        </div>
      </Card>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label={`${t('common.create')} ${t('common.fiscalYear')}`} className="w-48">
          <Input value={newFy} onChange={(e) => setNewFy(e.target.value)} />
        </Field>
        <Button variant="secondary" busy={s.busy} onClick={() => s.run(() => post('/fiscal-years', { startYear: Number(toLatinDigits(newFy)) }))}>
          <Plus className="h-4 w-4" /> {digits(`${newFy}/${String((Number(toLatinDigits(newFy)) + 1) % 100).padStart(2, '0')}`)}
        </Button>
      </Card>
    </div>
  );
}

interface UserRow { id: string; username: string; fullName: string; post: string; role: Role; active: boolean; lockedUntil: string | null }

function UsersTab() {
  const { t } = useTranslation();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<UserRow[]>('/users') });
  const [f, setF] = useState({ username: '', password: '', fullName: '', post: '', role: 'ACCOUNTANT' });
  const [reset, setReset] = useState<UserRow | null>(null);
  const [pw, setPw] = useState('');
  const s = useSave();
  const r = useSave();
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 font-semibold">{t('admin.newUser')}</div>
        <form onSubmit={async (e) => (e.preventDefault(), (await s.run(() => post('/users', f))) && setF({ ...f, username: '', password: '', fullName: '', post: '' }))} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t('login.username')}>
            <Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
          </Field>
          <Field label={t('login.password')}>
            <Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Field>
          <Field label={t('common.name')}>
            <Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
          </Field>
          <Field label={t('admin.post')}>
            <Input value={f.post} onChange={(e) => setF({ ...f, post: e.target.value })} />
          </Field>
          <Field label={t('admin.role')}>
            <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {['SUPER_ADMIN', 'ACCOUNTANT', 'AUDITOR'].map((k) => (
                <option key={k} value={k}>
                  {t(`role.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-5">
            <ErrorBox error={s.err} />
          </div>
          <div className="flex justify-end sm:col-span-2 lg:col-span-5">
            <Button busy={s.busy}>
              <Plus className="h-4 w-4" /> {t('common.add')}
            </Button>
          </div>
        </form>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {(users.data ?? []).map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{u.username}</td>
                <td className="px-3 py-2">
                  {u.fullName} <span className="text-subtle">{u.post}</span>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={u.role === 'SUPER_ADMIN' ? 'primary' : 'neutral'}>{t(`role.${u.role}`)}</Badge>
                </td>
                <td className="px-3 py-2">{!u.active ? <Badge tone="danger">✕</Badge> : u.lockedUntil && new Date(u.lockedUntil) > new Date() ? <Badge tone="warn">{t('admin.locked')}</Badge> : null}</td>
                <td className="space-x-1 px-3 py-2 text-right">
                  {u.lockedUntil && new Date(u.lockedUntil) > new Date() && (
                    <Button size="sm" variant="secondary" onClick={() => r.run(() => patch(`/users/${u.id}`, { unlock: true }))}>
                      {t('admin.unlock')}
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => r.run(() => patch(`/users/${u.id}`, { active: !u.active }))}>
                    {u.active ? '✕' : '✓'} {t('admin.active')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => (setReset(u), setPw(''))}>
                    {t('admin.resetPassword')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-3">
          <ErrorBox error={r.err} />
        </div>
      </Card>
      <Modal open={!!reset} onClose={() => setReset(null)} title={`${t('admin.resetPassword')} — ${reset?.username}`}>
        <form onSubmit={async (e) => (e.preventDefault(), (await r.run(() => patch(`/users/${reset!.id}`, { password: pw }))) && setReset(null))} className="space-y-4">
          <Input type="password" autoComplete="new-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
          <ErrorBox error={r.err} />
          <div className="flex justify-end">
            <Button busy={r.busy}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function TaxTab() {
  const { t } = useTranslation();
  const { fy } = useSession();
  const { name, digits } = useFmt();
  const rules = useQuery({ queryKey: ['tax-rules'], queryFn: () => api<TaxRule[]>('/tax-rules') });
  const [f, setF] = useState({ code: '', nameNe: '', nameEn: '', rate: '', excludeVat: false, effectiveFromBs: fy?.startBs ?? '' });
  const s = useSave();
  const pickExisting = (code: string) => {
    const r = rules.data?.find((x) => x.code === code);
    if (r) setF({ ...f, code, nameNe: r.nameNe, nameEn: r.nameEn, rate: String(r.rateBp / 100), excludeVat: r.excludeVat });
    else setF({ ...f, code });
  };
  return (
    <div className="space-y-4">
      <Card className="border-warn/50 bg-warn-soft p-3 text-sm text-warn">{t('admin.verifyTax')}</Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-subtle">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">{t('common.name')}</th>
              <th className="px-3 py-2 text-right">{t('admin.rate')}</th>
              <th className="px-3 py-2">{t('admin.effectiveFrom')}</th>
            </tr>
          </thead>
          <tbody>
            {(rules.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                <td className="px-3 py-2">{name(r)}</td>
                <td className="num px-3 py-2">{digits(r.rateBp / 100)}%</td>
                <td className="px-3 py-2">{digits(r.effectiveFromBs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="p-4">
        <div className="mb-3 font-semibold">{t('admin.newRate')}</div>
        <form
          onSubmit={(e) => (e.preventDefault(), s.run(() => post('/tax-rules', { code: f.code, nameNe: f.nameNe, nameEn: f.nameEn, rateBp: Math.round(Number(toLatinDigits(f.rate)) * 100), excludeVat: f.excludeVat, effectiveFromBs: f.effectiveFromBs })))}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field label="Code">
            <Input list="tax-codes" value={f.code} onChange={(e) => pickExisting(e.target.value.toUpperCase())} />
            <datalist id="tax-codes">
              {[...new Set((rules.data ?? []).map((r) => r.code))].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label={`${t('common.name')} (नेपाली)`}>
            <Input value={f.nameNe} onChange={(e) => setF({ ...f, nameNe: e.target.value })} />
          </Field>
          <Field label={`${t('common.name')} (English)`}>
            <Input value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} />
          </Field>
          <Field label={t('admin.rate')}>
            <Input inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
          </Field>
          <Field label={t('admin.effectiveFrom')}>
            <BsDateInput value={f.effectiveFromBs} onChange={(v) => setF({ ...f, effectiveFromBs: v })} />
          </Field>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" className="h-4 w-4" checked={f.excludeVat} onChange={(e) => setF({ ...f, excludeVat: e.target.checked })} /> VAT ÷ 1.13
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <ErrorBox error={s.err} />
          </div>
          <div className="flex items-center justify-end gap-3 sm:col-span-2 lg:col-span-3">
            <Saved ok={s.ok} />
            <Button busy={s.busy}>{t('common.add')}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function AccountsTab() {
  const { t } = useTranslation();
  const { name, digits } = useFmt();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounts') });
  const [edit, setEdit] = useState<Partial<Account> | null>(null);
  const s = useSave();
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    const body = { code: edit.code, activityNo: edit.activityNo ?? '', nameNe: edit.nameNe, nameEn: edit.nameEn, folioNo: edit.folioNo ?? '', bankName: edit.bankName ?? '', bankBranch: edit.bankBranch ?? '', accountNo: edit.accountNo ?? '', active: edit.active ?? true, ...(edit.kind === 'EXPENSE' ? { nature: edit.nature } : {}), ...(edit.kind === 'REVENUE' ? { source: edit.source ?? 'INTERNAL' } : {}) };
    const ok = await s.run(() => (edit.id ? patch(`/accounts/${edit.id}`, body) : post('/accounts', { ...body, kind: edit.kind })));
    if (ok) setEdit(null);
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEdit({ kind: 'EXPENSE', nature: 'RECURRENT', active: true })}>
          <Plus className="h-4 w-4" /> {t('common.add')}
        </Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-subtle">
            <tr>
              <th className="px-3 py-2">{t('admin.kind')}</th>
              <th className="px-3 py-2">{t('voucher.code')}</th>
              <th className="px-3 py-2">{t('voucher.activity')}</th>
              <th className="px-3 py-2">{t('voucher.headName')}</th>
              <th className="px-3 py-2">{t('admin.nature')}</th>
              <th className="px-3 py-2">{t('voucher.folio')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(accounts.data ?? []).map((a) => (
              <tr key={a.id} className={cx('border-t border-border', !a.active && 'text-subtle')}>
                <td className="px-3 py-2 text-xs">{a.kind}</td>
                <td className="px-3 py-2 tabular-nums">{digits(a.code)}</td>
                <td className="px-3 py-2">{digits(a.activityNo)}</td>
                <td className="px-3 py-2">{name(a)}</td>
                <td className="px-3 py-2">{a.nature ? t(`nav.${a.nature}`) : a.source ? `${t('nav.INCOME')} · ${t(`nav.${a.source}`)}` : ''}</td>
                <td className="px-3 py-2">{digits(a.folioNo)}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEdit(a)}>
                    {t('common.edit')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={t('admin.accounts')}>
        {edit && (
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            {!edit.id && (
              <Field label={t('admin.kind')}>
                <Select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>
                  {['EXPENSE', 'REVENUE', 'BANK', 'CASH', 'TDS_PAYABLE', 'ADVANCE', 'DEPOSIT', 'OTHER'].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </Select>
              </Field>
            )}
            {edit.kind === 'EXPENSE' && (
              <Field label={t('admin.nature')}>
                <Select value={edit.nature ?? 'RECURRENT'} onChange={(e) => setEdit({ ...edit, nature: e.target.value as 'CAPITAL' | 'RECURRENT' })}>
                  <option value="RECURRENT">{t('nav.RECURRENT')}</option>
                  <option value="CAPITAL">{t('nav.CAPITAL')}</option>
                </Select>
              </Field>
            )}
            {edit.kind === 'REVENUE' && (
              <Field label={t('admin.source')}>
                <Select value={edit.source ?? 'INTERNAL'} onChange={(e) => setEdit({ ...edit, source: e.target.value as 'INTERNAL' | 'GRANT' })}>
                  <option value="INTERNAL">{t('nav.INTERNAL')}</option>
                  <option value="GRANT">{t('nav.GRANT')}</option>
                </Select>
              </Field>
            )}
            {(['code', 'activityNo', 'nameNe', 'nameEn', 'folioNo'] as const).map((k) => (
              <Field key={k} label={{ code: t('voucher.code'), activityNo: t('voucher.activity'), nameNe: `${t('common.name')} (नेपाली)`, nameEn: `${t('common.name')} (English)`, folioNo: t('voucher.folio') }[k]}>
                <Input value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
              </Field>
            ))}
            {edit.kind === 'BANK' &&
              (['bankName', 'bankBranch', 'accountNo'] as const).map((k) => (
                <Field key={k} label={{ bankName: t('payeeForm.bankName'), bankBranch: t('payeeForm.branch'), accountNo: t('voucher.account') }[k]}>
                  <Input value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
                </Field>
              ))}
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" className="h-4 w-4" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> {t('admin.active')}
            </label>
            <div className="sm:col-span-2">
              <ErrorBox error={s.err} />
            </div>
            <div className="flex justify-end sm:col-span-2">
              <Button busy={s.busy}>{t('common.save')}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function PayeesTab() {
  const { t } = useTranslation();
  const { digits } = useFmt();
  const [search, setSearch] = useState('');
  const list = useQuery({ queryKey: ['payees', 'all', search], queryFn: () => api<Payee[]>(`/payees?all=true${search ? `&search=${encodeURIComponent(search)}` : ''}`) });
  const [edit, setEdit] = useState<Payee | 'new' | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-3">
        <Input className="max-w-sm" placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button onClick={() => setEdit('new')}>
          <Plus className="h-4 w-4" /> {t('entry.newPayee')}
        </Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {(list.data ?? []).map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{p.name}</td>
                <td className="px-3 py-2 tabular-nums">{digits(p.pan)}</td>
                <td className="px-3 py-2">{p.vatRegistered && <Badge tone="primary">VAT</Badge>}</td>
                <td className="px-3 py-2">{t(`payeeForm.${p.payeeType}`)}</td>
                <td className="px-3 py-2">
                  {p.bankName} {digits(p.accountNo)}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEdit(p)}>
                    {t('common.edit')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.data?.length && <Empty />}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit === 'new' ? t('entry.newPayee') : t('common.edit')}>
        {edit && <PayeeForm initial={edit === 'new' ? undefined : edit} onSaved={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}

interface AuditItem { id: number; at: string; username: string; action: string; entity: string; entityId: string; ip: string; before: unknown; after: unknown }

export function AuditPage() {
  const { t } = useTranslation();
  const { digits } = useFmt();
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AuditItem | null>(null);
  const q = useQuery({ queryKey: ['audit', entity, page], queryFn: () => api<{ total: number; items: AuditItem[] }>(`/audit?page=${page}&pageSize=50${entity ? `&entity=${entity}` : ''}`) });
  const verify = useQuery({ queryKey: ['audit-verify'], queryFn: () => api<{ intact: boolean; firstBrokenId: number | null }>('/audit/verify') });
  return (
    <div>
      <Breadcrumb items={[{ label: t('nav.audit') }]} />
      <PageTitle>{t('nav.audit')}</PageTitle>
      {verify.data && (
        <Card className={cx('mb-4 flex items-center gap-2 p-3 text-sm', verify.data.intact ? 'border-success/40 bg-success-soft text-success' : 'border-danger/40 bg-danger-soft text-danger')}>
          {verify.data.intact ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          {verify.data.intact ? t('audit.chainOk') : t('audit.chainBroken', { id: verify.data.firstBrokenId })}
        </Card>
      )}
      <Card>
        <div className="border-b border-border p-3">
          <div className="w-56">
            <Select value={entity} onChange={(e) => (setEntity(e.target.value), setPage(1))}>
              <option value="">{t('common.all')}</option>
              {['Voucher', 'User', 'Payee', 'BudgetEntry', 'OpeningBalance', 'TaxRule', 'LedgerAccount', 'Organization', 'FiscalYear', 'CashBook', 'BudgetStatement', 'VoucherCounter'].map((e) => (
                <option key={e}>{e}</option>
              ))}
            </Select>
          </div>
        </div>
        {q.isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-subtle">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">{t('audit.when')}</th>
                  <th className="px-3 py-2">{t('audit.who')}</th>
                  <th className="px-3 py-2">{t('audit.action')}</th>
                  <th className="px-3 py-2">{t('audit.entity')}</th>
                  <th className="px-3 py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.items ?? []).map((a) => (
                  <tr key={a.id} className="cursor-pointer border-t border-border hover:bg-muted/60" onClick={() => setOpen(a)}>
                    <td className="px-3 py-2 tabular-nums">{a.id}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{new Date(a.at).toLocaleString('en-GB')}</td>
                    <td className="px-3 py-2">{a.username}</td>
                    <td className="px-3 py-2">
                      <Badge tone={a.action.includes('FAIL') || a.action === 'USER_LOCKED' ? 'danger' : a.action === 'APPROVE' ? 'success' : 'neutral'}>{a.action}</Badge>
                    </td>
                    <td className="px-3 py-2">{a.entity}</td>
                    <td className="px-3 py-2 text-xs text-subtle">{a.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-border p-3 text-sm">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ‹
          </Button>
          <span>{digits(page)}</span>
          <Button size="sm" variant="secondary" disabled={(q.data?.items.length ?? 0) < 50} onClick={() => setPage(page + 1)}>
            ›
          </Button>
        </div>
      </Card>
      <Modal open={!!open} onClose={() => setOpen(null)} title={`#${open?.id} ${open?.action} ${open?.entity}`} wide>
        {open && (
          <div className="grid gap-4 text-xs md:grid-cols-2">
            {(['before', 'after'] as const).map((k) => (
              <div key={k}>
                <div className="mb-1 font-semibold">{k}</div>
                <pre className="max-h-[60vh] overflow-auto rounded bg-muted p-3">{JSON.stringify(open[k], null, 2)}</pre>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
