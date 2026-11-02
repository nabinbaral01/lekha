import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Building2, CalendarClock, Clock, Gift, Hammer, Landmark, Receipt, Wrench } from 'lucide-react';
import { diffBsDays, parseAmount, todayBs } from '@pa/core';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useFmt, usePrefs } from '../lib/prefs';
import type { Fund, Money } from '../lib/types';
import { Breadcrumb } from '../components/Layout';
import { Button, Card, cx, ErrorBox, Field, Input, Spinner } from '../components/ui';
import { TrendPanel } from '../components/TrendPanel';

export function Login() {
  const { t } = useTranslation();
  const { login } = useSession();
  const { lang, setLang } = usePrefs();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(u, p);
    } catch (x) {
      setErr(x);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-bg p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-xl font-bold text-primary-fg">पा</div>
          <h1 className="text-lg font-semibold">{lang === 'ne' ? 'पाथीभरा क्षेत्र विकास समिति' : 'Pathibhara Area Development Committee'}</h1>
          <p className="text-sm text-subtle">{lang === 'ne' ? 'ताप्लेजुङ' : 'Taplejung'} · {t('app.title')}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('login.username')}>
            <Input autoFocus autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} />
          </Field>
          <Field label={t('login.password')}>
            <Input type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} />
          </Field>
          <ErrorBox error={err} />
          <Button className="w-full" busy={busy} disabled={!u || !p}>
            {t('login.signIn')}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          <button className="text-primary hover:underline" onClick={() => setLang(lang === 'ne' ? 'en' : 'ne', false)}>
            {lang === 'ne' ? 'English' : 'नेपाली'}
          </button>
        </div>
      </Card>
    </div>
  );
}

export interface Summary {
  fund: Fund;
  allocated: Money;
  spent: Money;
  bank: Money;
  pendingTds: Money;
  counts: Partial<Record<'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'CANCELLED', number>>;
  rejected: number;
}

export function useSummaries() {
  const { fy } = useSession();
  return useQuery({ queryKey: ['summaries', fy?.id], queryFn: () => api<Summary[]>(`/reports/fund-summaries?fy=${fy!.id}`), enabled: !!fy });
}

const P = (m: Money) => parseAmount(m);
export function pct(spent: Money, allocated: Money) {
  const a = P(allocated);
  return a > 0n ? Number((P(spent) * 1000n) / a) / 10 : 0;
}

export function Progress({ value }: { value: number }) {
  const tone = value > 100 ? 'bg-danger' : value >= 90 ? 'bg-warn' : 'bg-primary';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={cx('h-full rounded-full', tone)} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Clock; label: string; value: React.ReactNode; tone?: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={cx('grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary', tone)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-sm text-subtle">{label}</div>
        <div className="text-lg font-semibold tabular-nums">{value}</div>
      </div>
    </Card>
  );
}

export function Home() {
  const { t } = useTranslation();
  const { user, fy } = useSession();
  const { paisa: fmt, digits } = useFmt();
  const s = useSummaries();
  if (s.isLoading || !fy) return <Spinner />;
  const all = s.data ?? [];
  const sum = (k: 'allocated' | 'spent' | 'bank' | 'pendingTds', f = all) => f.reduce((a, x) => a + P(x[k]), 0n);
  const daysLeft = Math.max(0, diffBsDays(todayBs(), fy.endBs));
  const awaiting = all.reduce((a, x) => a + (x.counts.SUBMITTED ?? 0), 0);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">
        {t('home.welcome')}, {user?.fullName}
      </h1>
      <p className="mb-6 text-subtle">{t('home.chooseSource')}</p>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Landmark} label={t('home.sharedBank')} value={`रु. ${fmt(sum('bank'))}`} />
        <Stat icon={Clock} label={t('home.awaitingApproval')} value={digits(awaiting)} tone={awaiting ? 'bg-warn-soft text-warn' : ''} />
        <Stat icon={Receipt} label={t('home.tdsPending')} value={`रु. ${fmt(sum('pendingTds'))}`} tone={sum('pendingTds') > 0n ? 'bg-warn-soft text-warn' : ''} />
        <Stat icon={CalendarClock} label={t('home.daysLeft')} value={digits(daysLeft)} tone={daysLeft <= 45 ? 'bg-danger-soft text-danger' : ''} />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {(['INTERNAL', 'GRANT'] as const).map((src) => {
          const f = all.filter((x) => x.fund.source === src);
          const a = sum('allocated', f);
          const sp = sum('spent', f);
          const p = a > 0n ? Number((sp * 1000n) / a) / 10 : 0;
          const Icon = src === 'INTERNAL' ? Building2 : Gift;
          return (
            <Link key={src} to={`/f/${src.toLowerCase()}`} className="group">
              <Card className="h-full p-6 transition group-hover:border-primary group-hover:shadow-md">
                <div className="mb-4 flex items-center gap-4">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-fg">
                    <Icon className="h-7 w-7" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{t(`nav.${src}`)}</h2>
                    <p className="text-subtle">{t(`sourceDesc.${src}`)}</p>
                  </div>
                  <ArrowRight className="ml-auto h-6 w-6 text-subtle transition group-hover:translate-x-1 group-hover:text-primary" />
                </div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-subtle">{t('home.budget')}</span>
                  <span className="tabular-nums">रु. {fmt(a)}</span>
                </div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-subtle">{t('common.spent')}</span>
                  <span className="tabular-nums">
                    रु. {fmt(sp)} ({digits(p)}%)
                  </span>
                </div>
                <Progress value={p} />
              </Card>
            </Link>
          );
        })}
      </div>
      <div className="mt-6">
        <TrendPanel />
      </div>
    </div>
  );
}

/** आन्तरिक / अनुदान → पूँजीगत / चालु */
export function SourcePage() {
  const { t } = useTranslation();
  const { source = '' } = useParams();
  const { money, digits } = useFmt();
  const s = useSummaries();
  const SRC = source.toUpperCase();
  if (SRC !== 'INTERNAL' && SRC !== 'GRANT') return null;
  return (
    <div>
      <Breadcrumb items={[{ label: t(`nav.${SRC}`) }]} />
      <h1 className="mb-6 text-2xl font-semibold">
        {t(`nav.${SRC}`)} — {t('home.chooseNature')}
      </h1>
      <div className="grid gap-5 md:grid-cols-2">
        {(['CAPITAL', 'RECURRENT'] as const).map((n) => {
          const sm = s.data?.find((x) => x.fund.source === SRC && x.fund.nature === n);
          const p = sm ? pct(sm.spent, sm.allocated) : 0;
          const Icon = n === 'CAPITAL' ? Hammer : Wrench;
          return (
            <Link key={n} to={`/f/${source}/${n.toLowerCase()}`} className="group">
              <Card className="h-full p-6 transition group-hover:border-primary group-hover:shadow-md">
                <div className="mb-4 flex items-center gap-4">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
                    <Icon className="h-7 w-7" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{t(`nav.${n}`)}</h2>
                    <p className="text-subtle">{t(`natureDesc.${n}`)}</p>
                  </div>
                  <ArrowRight className="ml-auto h-6 w-6 text-subtle transition group-hover:translate-x-1 group-hover:text-primary" />
                </div>
                {sm && (
                  <>
                    <div className="mb-2 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-subtle">{t('common.allocated')}</div>
                        <div className="tabular-nums">{money(sm.allocated)}</div>
                      </div>
                      <div>
                        <div className="text-subtle">{t('common.spent')}</div>
                        <div className="tabular-nums">{money(sm.spent)}</div>
                      </div>
                      <div>
                        <div className="text-subtle">{t('home.awaitingApproval')}</div>
                        <div className="tabular-nums">{digits(sm.counts.SUBMITTED ?? 0)}</div>
                      </div>
                    </div>
                    <Progress value={p} />
                  </>
                )}
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
