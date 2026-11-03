'use client';

export interface BadgeProps {
  text: string;
  tone?: 'moss' | 'amber' | 'red' | 'gray';
}

const TONES: Record<string, string> = {
  moss: 'bg-moss-50 text-moss-700 border-moss-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  gray: 'bg-stone-100 text-stone-600 border-stone-200',
};

export function Badge({ text, tone = 'gray' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5 ${TONES[tone]}`}
    >
      {text}
    </span>
  );
}

export function CreditPill({ score }: { score: number }) {
  const tone = score >= 100 ? 'moss' : score >= 80 ? 'amber' : 'red';
  return <Badge text={`信用 ${score}`} tone={tone as 'moss' | 'amber' | 'red'} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-300 border-t-moss-600" />
      {label ?? '加载中'}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-stone-100">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9a9a90" strokeWidth="1.6">
          <path d="M3 20h18M6 20V9l6-4 6 4v11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

export function Toast({
  message,
  tone = 'moss',
  onClose,
}: {
  message: string;
  tone?: 'moss' | 'red' | 'amber';
  onClose: () => void;
}) {
  const bg =
    tone === 'red'
      ? 'bg-red-600'
      : tone === 'amber'
        ? 'bg-amber-600'
        : 'bg-moss-700';
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div
        className={`animate-fade-up flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${bg}`}
      >
        <span>{message}</span>
        <button onClick={onClose} className="text-white/70 hover:text-white">
          ✕
        </button>
      </div>
    </div>
  );
}
