import { ButtonHTMLAttributes, forwardRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, ChevronDown, Loader2, X } from 'lucide-react';
import { ApiError } from '../lib/api';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:opacity-90',
  secondary: 'bg-surface border border-border text-fg hover:bg-muted',
  danger: 'bg-danger text-white hover:opacity-90',
  success: 'bg-success text-white hover:opacity-90',
  ghost: 'text-fg hover:bg-muted',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; size?: 'sm' | 'md' }>(
  ({ variant = 'primary', busy, size = 'md', className, children, disabled, ...p }, ref) => (
    <button
      ref={ref}
      disabled={disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4',
        variants[variant],
        className,
      )}
      {...p}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  ),
);

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-xl border border-border bg-surface shadow-sm', className)} {...p}>
      {children}
    </div>
  );
}

const inputCls = 'h-10 w-full rounded-md border border-border bg-surface px-3 text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-muted';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ className, invalid, ...p }, ref) => (
  <input ref={ref} className={cx(inputCls, invalid && 'border-danger ring-1 ring-danger', className)} {...p} />
));

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cx(inputCls, 'h-auto min-h-[72px] py-2', className)} {...p} />
));

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cx(inputCls, 'appearance-none pr-8', className)} {...p}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-medium text-subtle">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-subtle">{hint}</span>}
    </label>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'primary' | 'success' | 'danger' | 'warn'; children: ReactNode }) {
  const t = { neutral: 'bg-muted text-subtle', primary: 'bg-primary-soft text-primary', success: 'bg-success-soft text-success', danger: 'bg-danger-soft text-danger', warn: 'bg-warn-soft text-warn' }[tone];
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', t)}>{children}</span>;
}

export function StatusBadge({ status, rejected, paid }: { status: string; rejected?: boolean; paid?: boolean }) {
  const { t } = useTranslation();
  if (status === 'DRAFT' && rejected) return <Badge tone="danger">{t('status.REJECTED')}</Badge>;
  if (status === 'APPROVED' && paid) return <Badge tone="success">{t('status.PAID')}</Badge>;
  const tone = ({ DRAFT: 'neutral', SUBMITTED: 'warn', APPROVED: 'success', CANCELLED: 'danger' } as const)[status as 'DRAFT'] ?? 'neutral';
  return <Badge tone={tone}>{t(`status.${status}`)}</Badge>;
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 p-6 text-subtle">
      <Loader2 className="h-5 w-5 animate-spin" /> {label ?? t('common.loading')}
    </div>
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  return <div className="p-8 text-center text-subtle">{children ?? t('common.noData')}</div>;
}

/** Translates server error codes (and per-line issues) into the user's language with fix instructions. */
export function ErrorBox({ error, tone = 'danger' }: { error: unknown; tone?: 'danger' | 'warn' }) {
  const { t } = useTranslation();
  if (!error) return null;
  const e = error instanceof ApiError ? error : new ApiError(0, 'ERROR');
  const issues = e.issues.filter((i) => i.code !== e.code || i.params);
  const tr = (code: string, params: Record<string, unknown> = {}) => t(`errors.${code}`, { ...params, defaultValue: t('errors.ERROR') }) as string;
  return (
    <div role="alert" className={cx('rounded-md border p-3 text-sm', tone === 'danger' ? 'border-danger/40 bg-danger-soft text-danger' : 'border-warn/40 bg-warn-soft text-warn')}>
      <div className="flex items-start gap-2 font-medium">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{tr(e.code, e.params)}</span>
      </div>
      {issues.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-8">
          {issues.map((i, k) => (
            <li key={k}>{tr(i.code, { ...i.params, line: i.line })}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center" onMouseDown={onClose}>
      <div role="dialog" aria-modal className={cx('w-full rounded-xl border border-border bg-surface shadow-xl', wide ? 'max-w-5xl' : 'max-w-lg')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="rounded p-1 text-subtle hover:bg-muted" onClick={onClose} aria-label="close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Mandatory confirmation before approve / cancel / reject / deposit. Optionally collects a reason. */
export function Confirm({
  open, title, message, onCancel, onConfirm, busy, error, reasonLabel, reasonRequired, tone = 'primary',
}: {
  open: boolean; title: ReactNode; message: ReactNode; onCancel: () => void; onConfirm: (reason: string) => void; busy?: boolean; error?: unknown;
  reasonLabel?: string; reasonRequired?: boolean; tone?: Variant;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="mb-4">{message}</p>
      {reasonLabel && (
        <Field label={reasonLabel} className="mb-4">
          <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      {!!error && (
        <div className="mb-4">
          <ErrorBox error={error} />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t('common.close')}
        </Button>
        <Button variant={tone} busy={busy} disabled={reasonRequired && reason.trim().length < 1} onClick={() => onConfirm(reason.trim())}>
          <Check className="h-4 w-4" /> {t('common.yesConfirm')}
        </Button>
      </div>
    </Modal>
  );
}

/** Searchable select (keyboard friendly): type to filter, ↑/↓ to move, Enter to pick. */
export function Combobox<T>({
  items, value, onChange, getKey, getLabel, renderItem, placeholder, invalid, autoFocus, footer,
}: {
  items: T[]; value: string | null; onChange: (key: string) => void; getKey: (i: T) => string; getLabel: (i: T) => string;
  renderItem?: (i: T) => ReactNode; placeholder?: string; invalid?: boolean; autoFocus?: boolean; footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const selected = items.find((i) => getKey(i) === value);
  const list = items.filter((i) => getLabel(i).toLowerCase().includes(q.toLowerCase())).slice(0, 100);
  useEffect(() => {
    const h = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const pick = (i: T) => {
    onChange(getKey(i));
    setOpen(false);
    setQ('');
  };
  return (
    <div className="relative" ref={box}>
      <Input
        autoFocus={autoFocus}
        invalid={invalid}
        placeholder={selected ? getLabel(selected) : placeholder}
        value={open ? q : selected ? getLabel(selected) : ''}
        onFocus={() => (setOpen(true), setHi(0))}
        onChange={(e) => (setQ(e.target.value), setOpen(true), setHi(0))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setOpen(true), setHi((h) => Math.min(h + 1, list.length - 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setHi((h) => Math.max(h - 1, 0)));
          else if (e.key === 'Enter' && open && list[hi]) (e.preventDefault(), pick(list[hi]));
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
      {open && (
        <div className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg">
          {list.map((i, k) => (
            <button
              type="button"
              key={getKey(i)}
              onMouseDown={(e) => (e.preventDefault(), pick(i))}
              onMouseEnter={() => setHi(k)}
              className={cx('block w-full px-3 py-2 text-left text-sm', k === hi ? 'bg-primary-soft' : '', getKey(i) === value && 'font-semibold')}
            >
              {renderItem ? renderItem(i) : getLabel(i)}
            </button>
          ))}
          {!list.length && <div className="px-3 py-2 text-sm text-subtle">—</div>}
          {footer}
        </div>
      )}
    </div>
  );
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{children}</h1>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
