import type { KeyboardEvent, ReactNode } from 'react';

export interface Tab { id: string; label: string }

export function Tabs({ items, value, onChange, label }: { items: Tab[]; value: string; onChange: (id: string) => void; label: string }) {
  const key = (e: KeyboardEvent) => {
    const i = items.findIndex((t) => t.id === value);
    const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    const t = items[(n + items.length) % items.length];
    onChange(t.id);
    document.getElementById(`tab-${t.id}`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={key}>
      {items.map((t) => <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={t.id === value} aria-controls="tabpanel" tabIndex={t.id === value ? 0 : -1} onClick={() => onChange(t.id)}>{t.label}</button>)}
    </div>
  );
}

export const Panel = ({ value, children, className }: { value: string; children: ReactNode; className?: string }) => (
  <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${value}`} className={className}>{children}</div>
);
