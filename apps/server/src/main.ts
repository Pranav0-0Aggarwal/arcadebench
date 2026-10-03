import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { config, dbFile } from './config.ts';

const { app, close } = createApp({ file: dbFile(), web: config.web, origin: config.origin, warm: true });
const server = serve({ fetch: app.fetch, port: config.port }, (a) => console.log(`arcadebench listening on :${a.port}`));
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => { server.close(); close(); process.exit(0); });
