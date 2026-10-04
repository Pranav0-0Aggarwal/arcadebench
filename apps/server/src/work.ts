import { Worker } from 'node:worker_threads';
import type { jobs } from './sim.ts';
import { Fail } from './util.ts';

type Jobs = typeof jobs;
interface Job { job: string; args: unknown[]; res: (v: any) => void; rej: (e: Error) => void }
const TSX = import.meta.resolve('tsx/esm/api'), FILE = new URL('./work.worker.ts', import.meta.url).href;

export function makePool({ queue: max = 64, urgent: most = 16, timeoutMs = 60_000, recycle = 200 } = {}) {
  const queue: Job[] = [];
  let w: Worker | undefined, cur: Job | undefined, timer: ReturnType<typeof setTimeout> | undefined, done = 0;
  const settle = (f: (j: Job) => void) => { const j = cur!; clearTimeout(timer); cur = undefined; f(j); next(); };
  const kill = (e: Error) => { const x = w; w = undefined; x?.removeAllListeners().terminate(); if (cur) settle((j) => j.rej(e)); };
  const spawn = () => {
    const x = new Worker(`import(${JSON.stringify(TSX)}).then((t) => { t.register(); return import(${JSON.stringify(FILE)}); })`, { eval: true, resourceLimits: { maxOldGenerationSizeMb: 48, maxYoungGenerationSizeMb: 8 } });
    x.on('message', ({ result, error }) => {
      if (++done % recycle === 0) { w = undefined; x.removeAllListeners().terminate(); }
      settle((j) => (error ? j.rej(new Error(error)) : j.res(result)));
    });
    x.on('error', kill);
    x.on('exit', () => kill(new Error('worker exited')));
    x.unref();
    return x;
  };
  function next() {
    if (cur || !queue.length) return;
    cur = queue.shift()!;
    timer = setTimeout(() => kill(new Error(`${cur!.job} timed out`)), timeoutMs);
    (w ??= spawn()).postMessage({ job: cur.job, args: cur.args });
  }
  return {
    run: <K extends keyof Jobs>(job: K, ...args: Parameters<Jobs[K]>) => new Promise<Awaited<ReturnType<Jobs[K]>>>((res, rej) => {
      const urgent = job !== 'reference', i = urgent ? queue.findIndex((j) => j.job === 'reference') : -1;
      if (urgent ? (i < 0 ? queue.length : i) >= most : queue.length >= max) return rej(new Fail(503, 'server busy; try again shortly', 5));
      queue.splice(i < 0 ? queue.length : i, 0, { job, args, res, rej });
      next();
    }),
    get size() { return queue.length + +!!cur; },
    close: () => { queue.length = 0; clearTimeout(timer); cur = undefined; w?.removeAllListeners().terminate(); w = undefined; },
  };
}
export type Pool = ReturnType<typeof makePool>;
