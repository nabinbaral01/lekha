import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ban, CheckCircle2, Pencil, Plus, Printer, Send, Undo2, Wallet } from 'lucide-react';
import { api, ApiError, post } from '../lib/api';
import { useSession } from '../lib/session';
import { useFmt } from '../lib/prefs';
import { FundCrumb, useFund } from '../components/Layout';
import { Form203, F203Data } from '../components/Form203';
import { Button, Card, Confirm, cx, Empty, ErrorBox, Input, PageTitle, Select, Spinner, StatusBadge } from '../components/ui';
import { PrintFooter } from './Reports';

interface ListItem {
  id: string;
  number: number | null;
  dateBs: string;
  type: string;
  mode: string;
  status: string;
  narration: string;
  totalAmount: string;
  rejectComment: string | null;
  payees: { name: string }[];
}

export function VoucherList() {
  const { t } = useTranslation();
  const { fund, base } = useFund();
  const { fy, can } = useSession();
  const { money, digits } = useFmt();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['vouchers', fund.id, fy?.id, status, search, page],
    queryFn: () => api<{ total: number; items: ListItem[]; pageSize: number }>(`/funds/${fund.id}/vouchers?fy=${fy!.id}&page=${page}${status ? `&status=${status}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    enabled: !!fy,
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;
  return (
    <div>
      <FundCrumb page={t('nav.voucherList')} />
      <PageTitle
        actions={
          can.write && (
            <Link to={`${base}/vouchers/new`}>
              <Button>
                <Plus className="h-4 w-4" /> {t('list.newVoucher')}
              </Button>
            </Link>
          )
        }
      >
        {t('nav.voucherList')}
      </PageTitle>
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-3">
          <Input className="max-w-sm" placeholder={t('list.searchHint')} value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} />
          <div className="w-44">
            <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
              <option value="">{t('common.all')}</option>
              {['DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED'].map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {q.isLoading ? (
          <Spinner />
        ) : !q.data?.items.length ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-subtle">
                <tr>
                  <th className="px-3 py-2">{t('voucher.number')}</th>
                  <th className="px-3 py-2">{t('common.date')}</th>
                  <th className="px-3 py-2">{t('voucher.narration')}</th>
                  <th className="px-3 py-2">{t('entry.payee')}</th>
                  <th className="px-3 py-2">{t('common.type')}</th>
                  <th className="px-3 py-2 text-right">{t('common.amount')}</th>
                  <th className="px-3 py-2">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((v) => (
                  <tr key={v.id} className={cx('border-t border-border hover:bg-muted/60', v.status === 'CANCELLED' && 'text-subtle line-through decoration-danger/50')}>
                    <td className="px-3 py-2 font-medium">
                      <Link className="text-primary hover:underline" to={`${base}/vouchers/${v.id}`}>
                        {v.number != null ? digits(v.number) : `${t('voucher.draftNo')}`}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{digits(v.dateBs)}</td>
                    <td className="max-w-xs truncate px-3 py-2" title={v.narration}>
                      {v.narration}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2">{v.payees.map((p) => p.name).join(', ')}</td>
                    <td className="px-3 py-2">{t(`vmode.${v.mode}`)}</td>
                    <td className="num px-3 py-2">{money(v.totalAmount)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={v.status} rejected={!!v.rejectComment} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-border p-3 text-sm">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ‹
            </Button>
            <span>
              {t('common.page')} {digits(page)} / {digits(pages)}
            </span>
            <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              ›
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

type Action = 'submit' | 'approve' | 'reject' | 'cancel' | 'paid';

export function VoucherView() {
  const { t } = useTranslation();
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { base } = useFund();
  const { user, can } = useSession();
  const { digits } = useFmt();
  const q = useQuery({ queryKey: ['voucher', id], queryFn: () => api<F203Data & Record<string, any>>(`/vouchers/${id}`) }); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [needOverride, setNeedOverride] = useState(false);

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const v = q.data;
  const mine = v.preparedById === user?.id || can.admin;

  const run = async (reason: string) => {
    setBusy(true);
    setErr(null);
    try {
      const body =
        action === 'reject' ? { comment: reason, version: v.version } :
        action === 'cancel' ? { reason, version: v.version } :
        action === 'paid' ? { ref: reason } :
        { version: v.version, ...(reason ? { budgetOverrideReason: reason } : {}) };
      await post(`/vouchers/${v.id}/${action}`, body);
      setAction(null);
      setNeedOverride(false);
      qc.invalidateQueries();
    } catch (x) {
      // An overspend can only be pushed through by the Super Admin with a written reason.
      if (x instanceof ApiError && x.code === 'BUDGET_EXCEEDED' && can.admin && (action === 'approve' || action === 'submit')) setNeedOverride(true);
      setErr(x);
    } finally {
      setBusy(false);
    }
  };
  const print = async () => {
    await post(`/vouchers/${v.id}/printed`).catch(() => {});
    window.print();
  };
  const msg: Record<Action, string> = { submit: t('confirm.submit'), approve: t('confirm.approve'), reject: t('confirm.reject'), cancel: t('confirm.cancel'), paid: t('common.markPaid') };
  const reasonLabel =
    action === 'reject' ? t('voucher.rejectComment') :
    action === 'cancel' ? t('voucher.cancelReason') :
    action === 'paid' ? t('voucher.eft') :
    needOverride ? t('voucher.budgetOverride') : undefined;

  return (
    <div>
      <FundCrumb page={v.number != null ? `${t('voucher.number')} ${digits(v.number)}` : t('voucher.draftNo')} />
      <PageTitle
        actions={
          <>
            {v.status === 'DRAFT' && mine && can.write && v.mode !== 'TAX_DEPOSIT' && v.mode !== 'RECEIPT' && (
              <Button variant="secondary" onClick={() => nav(`${base}/vouchers/${v.id}/edit`)}>
                <Pencil className="h-4 w-4" /> {t('common.edit')}
              </Button>
            )}
            {v.status === 'DRAFT' && mine && can.write && (
              <Button onClick={() => (setErr(null), setAction('submit'))}>
                <Send className="h-4 w-4" /> {t('common.submit')}
              </Button>
            )}
            {v.status === 'SUBMITTED' && can.admin && (
              <>
                <Button variant="secondary" onClick={() => (setErr(null), setAction('reject'))}>
                  <Undo2 className="h-4 w-4" /> {t('common.reject')}
                </Button>
                <Button variant="success" onClick={() => (setErr(null), setNeedOverride(false), setAction('approve'))}>
                  <CheckCircle2 className="h-4 w-4" /> {t('common.approve')}
                </Button>
              </>
            )}
            {(v.status === 'DRAFT' || v.status === 'SUBMITTED') && mine && can.write && (
              <Button variant="danger" onClick={() => (setErr(null), setAction('cancel'))}>
                <Ban className="h-4 w-4" /> {t('common.cancel')}
              </Button>
            )}
            {v.status === 'APPROVED' && !v.paidAt && can.write && v.mode !== 'RECEIPT' && (
              <Button variant="secondary" onClick={() => (setErr(null), setAction('paid'))}>
                <Wallet className="h-4 w-4" /> {t('common.markPaid')}
              </Button>
            )}
            <Button variant="secondary" onClick={print}>
              <Printer className="h-4 w-4" /> {t('common.print')}
            </Button>
          </>
        }
      >
        <span className="flex items-center gap-3">
          {t('voucher.title')} <StatusBadge status={v.status ?? "DRAFT"} rejected={!!v.rejectComment} paid={!!v.paidAt} />
        </span>
      </PageTitle>
      <div className="no-print mb-4 space-y-2">
        {v.rejectComment && v.status === 'DRAFT' && (
          <Card className="border-warn/50 bg-warn-soft p-3 text-sm text-warn">
            {t('voucher.rejectComment')}: <b>{v.rejectComment}</b>
          </Card>
        )}
        {v.cancelReason && (
          <Card className="border-danger/40 bg-danger-soft p-3 text-sm text-danger">
            {t('voucher.cancelReason')}: <b>{v.cancelReason}</b>
          </Card>
        )}
        {v.budgetOverrideReason && (
          <Card className="border-warn/50 bg-warn-soft p-3 text-sm text-warn">
            {t('voucher.budgetOverride')}: <b>{v.budgetOverrideReason}</b>
          </Card>
        )}
      </div>
      <Form203 v={v} />
      <PrintFooter />
      <Confirm
        open={!!action}
        title={action ? (action === 'paid' ? t('common.markPaid') : t(`common.${action}`)) : ''}
        message={action ? msg[action] : ''}
        reasonLabel={reasonLabel}
        reasonRequired={action === 'reject' || action === 'cancel' || needOverride}
        tone={action === 'cancel' ? 'danger' : action === 'approve' ? 'success' : 'primary'}
        busy={busy}
        error={err}
        onCancel={() => (setAction(null), setNeedOverride(false))}
        onConfirm={run}
      />
    </div>
  );
}
