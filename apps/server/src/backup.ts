import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config, dbFile } from './config.ts';
import { log } from './util.ts';

const KEEP = 7, dir = join(config.data, 'backups'), name = `arcadebench-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.db`;
mkdirSync(dir, { recursive: true });
rmSync(join(dir, name), { force: true });
const db = new DatabaseSync(dbFile());
db.exec('PRAGMA busy_timeout = 10000');
db.prepare('VACUUM INTO ?').run(join(dir, name));
db.close();
for (const f of readdirSync(dir).filter((f) => /^arcadebench-\d{8}\.db$/.test(f)).sort().slice(0, -KEEP)) rmSync(join(dir, f));
log('backup', { file: name });
