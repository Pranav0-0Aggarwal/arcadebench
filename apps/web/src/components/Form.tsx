import type { InputHTMLAttributes, ReactNode } from 'react';

export function Field({ id, label, hint, prefix, children }: { id: string; label: ReactNode; hint?: ReactNode; prefix?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="in">{prefix && <span aria-hidden="true">{prefix}</span>}{children}</div>
      {hint && <span className="hint" id={`${id}-h`}>{hint}</span>}
    </div>
  );
}

export function Opt({ title, children, ...rest }: { title: string; children: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="opt"><input type="radio" {...rest} /><div><b>{title}</b><span>{children}</span></div></label>;
}
