import { useEffect, useState } from 'react';
import { API, type LiveFrame } from '@arcadebench/api';
import { api, HttpError } from './api.ts';

export interface Watch { frame?: LiveFrame; state: 'connecting' | 'live' | 'done' | 'gone' }

export function useWatch(id: string): Watch {
  const [w, set] = useState<Watch>({ state: 'connecting' });
  useEffect(() => {
    set({ state: 'connecting' });
    const q: LiveFrame[] = [];
    let es: EventSource | undefined, poll = 0, last = -1, over = false;
    const stop = () => { over = true; es?.close(); clearTimeout(poll); };
    const push = (f: LiveFrame) => {
      if (f.step === last && !f.done) return;
      last = f.step;
      if (q.push(f) > 300) q.shift();
      if (f.done) stop();
    };
    const pull = () => api.watch(id).then(push, (e) => {
      if (e instanceof HttpError && e.status === 404) { stop(); set((p) => (p.state === 'done' ? p : { ...p, state: 'gone' })); }
    }).finally(() => { if (!over) poll = window.setTimeout(pull, 1000); });
    es = new EventSource(`${API}/watch/${encodeURIComponent(id)}/stream`);
    es.onmessage = (e) => { try { push(JSON.parse(e.data)); } catch {} };
    es.onerror = () => { if (over) return; es?.close(); pull(); };
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const n = q.length;
      if (n) { const f = q.splice(0, n > 60 ? Math.ceil(n / 30) : 1).pop()!; set({ frame: f, state: f.done ? 'done' : 'live' }); }
    };
    raf = requestAnimationFrame(tick);
    return () => { stop(); cancelAnimationFrame(raf); };
  }, [id]);
  return w;
}
