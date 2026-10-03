import type { ReactNode } from 'react';

export default function Block({ id, title, sub, children }: { id?: string; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <section className="block" id={id} aria-labelledby={id && `${id}-h`}>
      <h2 id={id && `${id}-h`}>{title}</h2>
      {sub && <p className="sub">{sub}</p>}
      {children}
    </section>
  );
}
