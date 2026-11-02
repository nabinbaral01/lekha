import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BS_MONTHS_EN, BS_MONTHS_NE, daysInBsMonth, fiscalMonths, parseAmount, parseBs } from '@pa/core';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useFmt } from '../lib/prefs';
import { ChartBucket, ChartSeries, TrendChart } from './TrendChart';
import { Select, Spinner } from './ui';

interface TrendData {
  fiscalYear: { startYear: number };
  allocated: string | null;
  days: { dateBs: string; fundId: string; expense: string; paid: string; tds: string }[];
}
type Metric = 'expense' | 'paid' | 'tds';

/**
 * Money-flow chart with a period control: whole fiscal year by BS month, one month by week,
 * or cumulative spending against the appropriation.
 * With fundId: series are expense / bank payment / TDS. Without: one expense line per fund.
 */
export function TrendPanel({ fundId }: { fundId?: string }) {
  const { t } = useTranslation();
  const { fy, meta } = useSession();
  const { lang, digits, name } = useFmt();
  const [period, setPeriod] = useState('year');
  const q = useQuery({
    queryKey: ['trend', fy?.id, fundId ?? 'all'],
    queryFn: () => api<TrendData>(`/reports/trend?fy=${fy!.id}${fundId ? `&fund=${fundId}` : ''}`),
    enabled: !!fy,
  });
  const months = lang === 'ne' ? BS_MONTHS_NE : BS_MONTHS_EN;
  const fyMonths = fy ? fiscalMonths(fy.startYear) : [];

  const view = useMemo(() => {
    if (!q.data || !fy) return null;
    const cumulative = period === 'cumulative';
    let buckets: ChartBucket[];
    let bucketOf: (dateBs: string) => number;
    if (period.startsWith('m:')) {
      // One BS month, by week: 1–7, 8–14, 15–21, 22–28, 29–end.
      const [y, m] = period.slice(2).split('-').map(Number);
      const dim = daysInBsMonth(y, m);
      const ranges = [[1, 7], [8, 14], [15, 21], [22, 28], ...(dim > 28 ? [[29, dim]] : [])];
      buckets = ranges.map(([a, b], i) => ({ label: `${t('chart.week')} ${digits(i + 1)}`, title: `${months[m - 1]} ${digits(a)}–${digits(b)}, ${digits(y)}` }));
      bucketOf = (d) => {
        const b = parseBs(d);
        return b.y === y && b.m === m ? Math.min(Math.floor((b.d - 1) / 7), ranges.length - 1) : -1;
      };
    } else {
      buckets = fyMonths.map(({ y, m }) => ({ label: months[m - 1], title: `${months[m - 1]} ${digits(y)}` }));
      bucketOf = (d) => {
        const b = parseBs(d);
        return fyMonths.findIndex((x) => x.y === b.y && x.m === b.m);
      };
    }
    const sumBy = (metric: Metric, fund?: string) => {
      const v = buckets.map(() => 0n);
      for (const d of q.data.days) {
        if (fund && d.fundId !== fund) continue;
        const i = bucketOf(d.dateBs);
        if (i >= 0) v[i] += parseAmount(d[metric]);
      }
      if (cumulative) for (let i = 1; i < v.length; i++) v[i] += v[i - 1];
      return v;
    };
    let series: ChartSeries[];
    if (fundId) {
      series = [
        { key: 'expense', label: t('chart.expense'), slot: 1, values: sumBy('expense') },
        { key: 'paid', label: t('chart.paid'), slot: 2, values: sumBy('paid') },
        { key: 'tds', label: t('chart.tds'), slot: 3, values: sumBy('tds') },
      ];
    } else {
      // Fixed fund order -> fixed colour per fund, whichever funds have data.
      const order = ['INTERNAL:CAPITAL', 'INTERNAL:RECURRENT', 'GRANT:CAPITAL', 'GRANT:RECURRENT'];
      series = [...(meta?.funds ?? [])]
        .sort((a, b) => order.indexOf(`${a.source}:${a.nature}`) - order.indexOf(`${b.source}:${b.nature}`))
        .map((f, i) => ({ key: f.id, label: name(f), slot: (i + 1) as 1 | 2 | 3 | 4, values: sumBy('expense', f.id) }));
    }
    const reference = cumulative && q.data.allocated ? { label: t('common.allocated'), value: parseAmount(q.data.allocated) } : null;
    return { buckets, series, reference };
  }, [q.data, period, lang, fy]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading || !view) return <Spinner />;
  return (
    <TrendChart
      title={fundId ? t('chart.fundTitle') : t('chart.allTitle')}
      buckets={view.buckets}
      series={view.series}
      reference={view.reference}
      emptyText={t('chart.noSpend')}
      controls={
        <div className="w-52">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={t('chart.period')}>
            <option value="year">{t('chart.byMonth')}</option>
            <option value="cumulative">{t('chart.cumulative')}</option>
            <optgroup label={t('chart.weekly')}>
              {fyMonths.map(({ y, m }) => (
                <option key={`${y}-${m}`} value={`m:${y}-${m}`}>
                  {months[m - 1]} {digits(y)}
                </option>
              ))}
            </optgroup>
          </Select>
        </div>
      }
    />
  );
}
