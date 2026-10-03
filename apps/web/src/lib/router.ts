import { useEffect, useState } from 'react';
import { BASE_PATH } from '@arcadebench/api';

/** tiny client router under BASE_PATH; links with data-link or <Link> use pushState */
export const path = () => window.location.pathname.replace(new RegExp(`^${BASE_PATH}`), '') || '/';
export function navigate(to: string) { window.history.pushState({}, '', BASE_PATH + to); window.dispatchEvent(new PopStateEvent('popstate')); window.scrollTo(0, 0); }
export function usePath(): string {
  const [p, set] = useState(path());
  useEffect(() => { const f = () => set(path()); window.addEventListener('popstate', f); return () => window.removeEventListener('popstate', f); }, []);
  return p;
}
export const href = (to: string) => BASE_PATH + to;
