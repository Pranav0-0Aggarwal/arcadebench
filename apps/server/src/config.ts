import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SITE_ORIGIN } from '@arcadebench/api';

const env = process.env;
export const config = { port: +(env.PORT ?? 8787), data: resolve(env.DATA_DIR ?? './data'), web: resolve(env.WEB_DIST ?? '../web/dist'), origin: env.ORIGIN ?? SITE_ORIGIN };
export function dbFile() { mkdirSync(config.data, { recursive: true }); return join(config.data, 'arcadebench.db'); }
