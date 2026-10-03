import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.ts';

export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { data?: T; error?: string } {
  const [s, set] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    let live = true;
    set({});
    load().then((data) => live && set({ data }), (e: Error) => live && set({ error: e.message }));
    return () => { live = false; };
  }, deps);
  return s;
}

export function useFlash(ms = 2000): [string, (m: string) => void, (text: string, ok?: string) => void] {
  const [msg, set] = useState(''), h = useRef(0);
  const flash = (m: string) => { set(m); clearTimeout(h.current); h.current = window.setTimeout(() => set(''), ms); };
  const copy = (text: string, ok = 'Copied') => navigator.clipboard.writeText(text).then(() => flash(ok), () => flash('Copy blocked by the browser'));
  return [msg, flash, copy];
}

export function useTitle(t?: string) {
  useEffect(() => { document.title = t ? `${t} · ArcadeBench` : 'ArcadeBench'; }, [t]);
}

export function useHash() {
  useEffect(() => {
    const go = () => setTimeout(() => location.hash && document.getElementById(location.hash.slice(1))?.scrollIntoView(), 0);
    go();
    addEventListener('popstate', go);
    return () => removeEventListener('popstate', go);
  }, []);
}

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const once = <T>(f: () => Promise<T>) => {
  let p: Promise<T> | undefined;
  return () => (p ??= f().catch((e) => { p = undefined; throw e; }));
};
export const season = once(api.season);
export const daily = once(api.daily);
