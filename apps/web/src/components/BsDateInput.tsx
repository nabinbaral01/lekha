import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { BS_MAX_YEAR, BS_MIN_YEAR, BS_MONTHS_EN, BS_MONTHS_NE, bsToAd, daysInBsMonth, formatBs, parseBs, toDevanagariDigits, toLatinDigits, todayBs } from '@pa/core';
import { usePrefs } from '../lib/prefs';
import { cx, Input } from './ui';

const WEEK_NE = ['आइत', 'सोम', 'मंगल', 'बुध', 'बिही', 'शुक्र', 'शनि'];
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function tryParse(s: string) {
  try {
    return parseBs(s);
  } catch {
    return null;
  }
}

/**
 * Bikram Sambat date field. Accepts typing ("2082.4.1", "२०८२.०४.०१") or picking from a BS calendar.
 * Value is always canonical "YYYY.MM.DD" (Latin digits); display follows the user's digit preference.
 */
export function BsDateInput({ value, onChange, invalid, min, max, autoFocus }: { value: string; onChange: (v: string) => void; invalid?: boolean; min?: string; max?: string; autoFocus?: boolean }) {
  const { lang, devanagari } = usePrefs();
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const cur = tryParse(value) ?? tryParse(todayBs())!;
  const [view, setView] = useState({ y: cur.y, m: cur.m });
  const box = useRef<HTMLDivElement>(null);
  const show = (s: string) => (devanagari ? toDevanagariDigits(s) : s);

  useEffect(() => setText(value ? show(value) : ''), [value, devanagari]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const commit = (s: string) => {
    const b = tryParse(toLatinDigits(s));
    if (b) onChange(formatBs(b));
    else setText(s);
  };
  const outOfRange = (s: string) => (min && bsToAd(s) < bsToAd(min)) || (max && bsToAd(s) > bsToAd(max));
  const firstWeekday = new Date(`${bsToAd({ y: view.y, m: view.m, d: 1 })}T00:00:00Z`).getUTCDay();
  const days = daysInBsMonth(view.y, view.m);
  const move = (dm: number) => {
    let m = view.m + dm;
    let y = view.y;
    if (m < 1) (m = 12), y--;
    if (m > 12) (m = 1), y++;
    if (y >= BS_MIN_YEAR && y <= BS_MAX_YEAR) setView({ y, m });
  };
  const textValid = !!tryParse(toLatinDigits(text));

  return (
    <div className="relative" ref={box}>
      <Input
        autoFocus={autoFocus}
        value={text}
        placeholder="YYYY.MM.DD"
        invalid={invalid || (!!text && !textValid)}
        onChange={(e) => (setText(e.target.value), tryParse(toLatinDigits(e.target.value)) && commit(e.target.value))}
        onBlur={(e) => commit(e.target.value)}
        className="pr-9"
      />
      <button type="button" tabIndex={-1} className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle" onClick={() => (setView({ y: cur.y, m: cur.m }), setOpen((o) => !o))} aria-label="calendar">
        <CalendarDays className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-72 rounded-lg border border-border bg-surface p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="rounded p-1 hover:bg-muted" onClick={() => move(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="font-semibold">
              {(lang === 'ne' ? BS_MONTHS_NE : BS_MONTHS_EN)[view.m - 1]} {show(String(view.y))}
            </div>
            <button type="button" className="rounded p-1 hover:bg-muted" onClick={() => move(1)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {(lang === 'ne' ? WEEK_NE : WEEK_EN).map((w, i) => (
              <div key={w} className={cx('py-1 font-medium text-subtle', i === 6 && 'text-danger')}>
                {w}
              </div>
            ))}
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {Array.from({ length: days }).map((_, i) => {
              const d = formatBs({ y: view.y, m: view.m, d: i + 1 });
              const disabled = !!outOfRange(d);
              const sat = (firstWeekday + i) % 7 === 6;
              return (
                <button
                  type="button"
                  key={d}
                  disabled={disabled}
                  onClick={() => (onChange(d), setOpen(false))}
                  className={cx('rounded py-1.5 text-sm hover:bg-primary-soft disabled:opacity-30', d === value && 'bg-primary text-primary-fg hover:bg-primary', d === todayBs() && d !== value && 'ring-1 ring-primary', sat && d !== value && 'text-danger')}
                >
                  {show(String(i + 1))}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
