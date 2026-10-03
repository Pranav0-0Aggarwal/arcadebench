import { useEffect, useRef, useState, type ReactNode } from 'react';

export default function InView({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null), [on, set] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => set(e.isIntersecting), { rootMargin: '120px' });
    io.observe(ref.current!);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={className}>{on && children}</div>;
}
