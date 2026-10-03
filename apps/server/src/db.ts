import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import type { AgentType, Kind, Listing, Mode } from '@arcadebench/api';
import type { HelpLevel } from '@arcadebench/engine';

const MIGRATIONS = [`
CREATE TABLE entries (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, x TEXT NOT NULL, email TEXT NOT NULL, linkedin TEXT, listing TEXT NOT NULL,
  name TEXT NOT NULL, mode TEXT, agent_type TEXT, help INTEGER NOT NULL, skill TEXT, baseline INTEGER NOT NULL, created TEXT NOT NULL);
CREATE TABLE seasons (id TEXT PRIMARY KEY, opens TEXT NOT NULL, closes TEXT NOT NULL, seeds TEXT NOT NULL, salt TEXT NOT NULL, commitment TEXT NOT NULL);
CREATE TABLE quota (entry TEXT NOT NULL, season TEXT NOT NULL, game TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (entry, season, game));
CREATE TABLE runs (n INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, entry TEXT, season TEXT NOT NULL, game TEXT NOT NULL, version TEXT NOT NULL, seed INTEGER NOT NULL,
  repeat INTEGER NOT NULL, track TEXT NOT NULL, help INTEGER NOT NULL, cap INTEGER NOT NULL, ranked INTEGER NOT NULL, score REAL NOT NULL, norm REAL, steps INTEGER NOT NULL,
  agree INTEGER NOT NULL, dec INTEGER NOT NULL, truncated INTEGER NOT NULL, created TEXT NOT NULL, ep BLOB NOT NULL);
CREATE INDEX runs_board ON runs (season, track, game);
CREATE INDEX runs_entry ON runs (entry);
CREATE INDEX runs_seed ON runs (game, seed);
CREATE TABLE refs (game TEXT NOT NULL, seed INTEGER NOT NULL, cap INTEGER NOT NULL, expert REAL NOT NULL, random REAL NOT NULL, PRIMARY KEY (game, seed, cap));
`];

export interface Entry {
  id: string; token: string; kind: Kind; x: string; email: string; linkedin: string | null; listing: Listing; name: string;
  mode: Mode | null; agent_type: AgentType | null; help: HelpLevel; skill: string | null; baseline: number; created: string;
}

export function openDb(file: string) {
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL');
  const version = (d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let i = version; i < MIGRATIONS.length; i++) d.exec(`BEGIN; ${MIGRATIONS[i]} PRAGMA user_version = ${i + 1}; COMMIT;`);
  const cache = new Map<string, StatementSync>();
  const st = (sql: string) => cache.get(sql) ?? cache.set(sql, d.prepare(sql)).get(sql)!;
  return {
    run: (sql: string, ...p: SQLInputValue[]) => st(sql).run(...p),
    get: <T>(sql: string, ...p: SQLInputValue[]) => st(sql).get(...p) as T | undefined,
    all: <T>(sql: string, ...p: SQLInputValue[]) => st(sql).all(...p) as T[],
    close: () => d.close(),
  };
}
export type Db = ReturnType<typeof openDb>;
