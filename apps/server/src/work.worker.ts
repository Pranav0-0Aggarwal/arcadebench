import { parentPort } from 'node:worker_threads';
import { jobs } from './sim.ts';

parentPort!.on('message', async ({ job, args }: { job: keyof typeof jobs; args: any[] }) => {
  try { parentPort!.postMessage({ result: await (jobs[job] as (...a: any[]) => unknown)(...args) }); }
  catch (e) { parentPort!.postMessage({ error: String(e) }); }
});
