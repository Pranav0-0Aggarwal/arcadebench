import { Worker } from 'node:worker_threads';
import type { jobs } from './sim.ts';

type Jobs = typeof jobs;
const TSX = import.meta.resolve('tsx/esm/api'), FILE = new URL('./work.worker.ts', import.meta.url).href;

export function makePool() {
  let w: Worker | undefined, n = 0;
  const pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  const fail = (e: Error) => { for (const p of pending.values()) p.rej(e); pending.clear(); w = undefined; };
  const spawn = () => {
    const x = new Worker(`import(${JSON.stringify(TSX)}).then((t) => { t.register(); return import(${JSON.stringify(FILE)}); })`, { eval: true });
    x.on('message', ({ id, result, error }) => { const p = pending.get(id); if (!p) return; pending.delete(id); if (error) p.rej(new Error(error)); else p.res(result); });
    x.on('error', fail);
    x.on('exit', () => fail(new Error('worker exited')));
    x.unref();
    return x;
  };
  return {
    run: <K extends keyof Jobs>(job: K, ...args: Parameters<Jobs[K]>) => new Promise<Awaited<ReturnType<Jobs[K]>>>((res, rej) => { const t = (w ??= spawn()); pending.set(++n, { res, rej }); t.postMessage({ id: n, job, args }); }),
    close: () => { pending.clear(); w?.terminate(); },
  };
}
export type Pool = ReturnType<typeof makePool>;
