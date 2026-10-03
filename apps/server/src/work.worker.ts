import { parentPort } from 'node:worker_threads';
import { jobs } from './sim.ts';

parentPort!.on('message', async ({ id, job, args }: { id: number; job: keyof typeof jobs; args: any[] }) => {
  try { parentPort!.postMessage({ id, result: await (jobs[job] as (...a: any[]) => unknown)(...args) }); }
  catch (e) { parentPort!.postMessage({ id, error: String(e) }); }
});
