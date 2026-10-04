import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { config, dbFile } from './config.ts';
import { log, logError } from './util.ts';

const { app, close } = createApp({ file: dbFile(), web: config.web, origin: config.origin });
const server = serve({ fetch: app.fetch, port: config.port }, (a) => log('listen', { port: a.port }));
const stop = (signal: string) => { log('stop', { signal }); server.close(); close(); process.exit(0); };
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.once(sig, stop);
process.on('unhandledRejection', (e) => logError(e, { unhandled: true }));
