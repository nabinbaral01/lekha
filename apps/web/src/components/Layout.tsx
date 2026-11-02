import { ReactNode } from 'react';
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Home, LogOut, Moon, Settings, ShieldCheck, Sun, Layers } from 'lucide-react';
import { useSession } from '../lib/session';
import { useFmt, usePrefs } from '../lib/prefs';
import type { Fund } from '../lib/types';
import { cx } from './ui';

export function TopBar() {
  const { t } = useTranslation();
  const { user, meta, fy, setFyId, logout, can } = useSession();
  const { lang, setLang, devanagari, setDevanagari, dark, setDark } = usePrefs();
  const { name, digits } = useFmt();
  return (
    <header className="no-print sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-fg">पा</div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold">{name(meta?.org)}</div>
            <div className="truncate text-xs text-subtle">{t('app.title')}</div>
          </div>
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          {meta && (
            <select aria-label={t('common.fiscalYear')} className="h-8 rounded-md border border-border bg-surface px-2" value={fy?.id ?? ''} onChange={(e) => setFyId(e.target.value)}>
              {meta.fiscalYears.map((f) => (
                <option key={f.id} value={f.id}>
                  {t('common.fiscalYear')} {digits(f.code)}
                </option>
              ))}
            </select>
          )}
          <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label={t('common.language')}>
            {(['ne', 'en'] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} className={cx('h-8 px-2.5', lang === l ? 'bg-primary text-primary-fg' : 'hover:bg-muted')}>
                {l === 'ne' ? 'नेपाली' : 'English'}
              </button>
            ))}
          </div>
          <button title={t('common.digits')} onClick={() => setDevanagari(!devanagari)} className="h-8 rounded-md border border-border px-2.5 hover:bg-muted">
            {devanagari ? '१२३' : '123'}
          </button>
          <button title={t('common.theme')} onClick={() => setDark(!dark)} className="grid h-8 w-8 place-items-center rounded-md border border-border hover:bg-muted">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {(can.admin || user?.role === 'AUDITOR') && (
            <>
              <Link to="/consolidated" title={t('nav.consolidated')} className="grid h-8 w-8 place-items-center rounded-md border border-border hover:bg-muted">
                <Layers className="h-4 w-4" />
              </Link>
              <Link to="/audit" title={t('nav.audit')} className="grid h-8 w-8 place-items-center rounded-md border border-border hover:bg-muted">
                <ShieldCheck className="h-4 w-4" />
              </Link>
            </>
          )}
          {can.admin && (
            <Link to="/admin" title={t('nav.admin')} className="grid h-8 w-8 place-items-center rounded-md border border-border hover:bg-muted">
              <Settings className="h-4 w-4" />
            </Link>
          )}
          <div className="hidden text-right leading-tight sm:block">
            <div className="font-medium">{user?.fullName}</div>
            <div className="text-xs text-subtle">{user && t(`role.${user.role}`)}</div>
          </div>
          <button onClick={logout} title={t('nav.logout')} className="grid h-8 w-8 place-items-center rounded-md border border-border hover:bg-muted">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

export function Breadcrumb({ items }: { items: { label: ReactNode; to?: string }[] }) {
  const { t } = useTranslation();
  return (
    <nav aria-label="breadcrumb" className="no-print mb-4 flex flex-wrap items-center gap-1 text-sm text-subtle">
      <Link to="/" className="flex items-center gap-1 hover:text-primary">
        <Home className="h-4 w-4" /> {t('nav.home')}
      </Link>
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4" />
          {it.to ? (
            <Link to={it.to} className="hover:text-primary">
              {it.label}
            </Link>
          ) : (
            <span className="font-medium text-fg">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function AppShell() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-[1400px] px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}

export interface FundCtx {
  fund: Fund;
  base: string;
  crumbs: { label: ReactNode; to?: string }[];
}
export const useFund = () => useOutletContext<FundCtx>();

const TABS = [
  ['', 'dashboard'],
  ['vouchers/new', 'voucherEntry'],
  ['vouchers', 'voucherList'],
  ['cash-book', 'cashBook'],
  ['budget-ledger', 'budgetLedger'],
  ['advance', 'advance'],
  ['tds', 'tax'],
  ['budget-statement', 'budgetStatement'],
  ['reports', 'reports'],
] as const;

/** Inside one of the 4 funds: sub-menu + breadcrumb context. */
export function FundLayout() {
  const { t } = useTranslation();
  const { source = '', nature = '' } = useParams();
  const { fundBy, can } = useSession();
  const fund = fundBy(source, nature);
  if (!fund) return <div className="p-6 text-danger">{t('errors.FUND_NOT_FOUND')}</div>;
  const base = `/f/${source}/${nature}`;
  const crumbs = [
    { label: t(`nav.${fund.source}`), to: `/f/${source}` },
    { label: t(`nav.${fund.nature}`), to: base },
  ];
  return (
    <div>
      <nav className="no-print -mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border pb-px">
        {TABS.filter(([p]) => p !== 'vouchers/new' || can.write).map(([path, key]) => (
          <NavLink
            key={key}
            to={path ? `${base}/${path}` : base}
            end={path === '' || path === 'vouchers'}
            className={({ isActive }) =>
              cx('whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm font-medium', isActive ? 'border-primary text-primary' : 'border-transparent text-subtle hover:text-fg')
            }
          >
            {t(`nav.${key}`)}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ fund, base, crumbs } satisfies FundCtx} />
    </div>
  );
}

/** Breadcrumb for a page inside a fund: Home › अनुदान › चालु खर्च › <page>. */
export function FundCrumb({ page }: { page?: ReactNode }) {
  const { crumbs } = useFund();
  return <Breadcrumb items={page ? [...crumbs, { label: page }] : [crumbs[0], { label: crumbs[1].label }]} />;
}
