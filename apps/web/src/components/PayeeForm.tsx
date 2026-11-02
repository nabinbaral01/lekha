import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { isValidPan, toLatinDigits } from '@pa/core';
import { patch, post } from '../lib/api';
import type { Payee } from '../lib/types';
import { Button, ErrorBox, Field, Input, Select } from './ui';

const blank = { name: '', pan: '', vatRegistered: false, payeeType: 'FIRM', bankName: '', bankBranch: '', accountNo: '', phone: '', address: '' };

/** Add or edit a payee (PAN 9 digits, bank details for EFT). */
export function PayeeForm({ initial, onSaved }: { initial?: Payee; onSaved: (p: Payee) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState({ ...blank, ...(initial ?? {}) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const panBad = !!f.pan && !isValidPan(toLatinDigits(f.pan));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body = { name: f.name, pan: toLatinDigits(f.pan), vatRegistered: f.vatRegistered, payeeType: f.payeeType, bankName: f.bankName, bankBranch: f.bankBranch, accountNo: toLatinDigits(f.accountNo), phone: f.phone, address: f.address };
      const p = initial ? await patch<Payee>(`/payees/${initial.id}`, body) : await post<Payee>('/payees', body);
      qc.invalidateQueries({ queryKey: ['payees'] });
      onSaved(p);
    } catch (x) {
      setErr(x);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label={t('common.name')} className="sm:col-span-2">
        <Input autoFocus value={f.name} onChange={set('name')} />
      </Field>
      <Field label={t('voucher.pan')} hint={panBad ? t('errors.PAN_INVALID') : undefined}>
        <Input value={f.pan} onChange={set('pan')} invalid={panBad} inputMode="numeric" maxLength={9} />
      </Field>
      <Field label={t('payeeForm.type')}>
        <Select value={f.payeeType} onChange={set('payeeType')}>
          {['FIRM', 'INDIVIDUAL', 'STAFF', 'GOVERNMENT', 'OTHER'].map((k) => (
            <option key={k} value={k}>
              {t(`payeeForm.${k}`)}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 sm:col-span-2">
        <input type="checkbox" className="h-4 w-4" checked={f.vatRegistered} onChange={(e) => setF({ ...f, vatRegistered: e.target.checked })} />
        {t('payeeForm.vatRegistered')}
      </label>
      <Field label={t('payeeForm.bankName')}>
        <Input value={f.bankName} onChange={set('bankName')} />
      </Field>
      <Field label={t('payeeForm.branch')}>
        <Input value={f.bankBranch} onChange={set('bankBranch')} />
      </Field>
      <Field label={t('voucher.account')}>
        <Input value={f.accountNo} onChange={set('accountNo')} />
      </Field>
      <Field label={t('payeeForm.phone')}>
        <Input value={f.phone} onChange={set('phone')} />
      </Field>
      <Field label={t('payeeForm.address')} className="sm:col-span-2">
        <Input value={f.address} onChange={set('address')} />
      </Field>
      <div className="sm:col-span-2">
        <ErrorBox error={err} />
      </div>
      <div className="flex justify-end sm:col-span-2">
        <Button busy={busy} disabled={!f.name || panBad}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
