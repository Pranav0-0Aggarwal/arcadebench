import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CLASSICS, DUELS, GAMES, LAB, ORIGINALS, type HelpLevel } from '@arcadebench/engine';
import { isBaseline, makeAgent } from './agents/index.ts';
import { runEpisode } from './runner.ts';
import { report } from './report.ts';
import type { Clock, Episode } from './types.ts';

const args = process.argv.slice(2), cmd = args[0];
const opt = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k: string) => args.includes(`--${k}`);

function seedList(spec: string): number[] {
  return spec.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i); });
}
function gameList(spec: string): string[] {
  if (spec === 'all') return Object.keys(GAMES);
  if (spec === 'classics') return CLASSICS.map((g) => g.id);
  if (spec === 'originals') return ORIGINALS.map((g) => g.id);
  if (spec === 'lab') return LAB.map((g) => g.id);
  if (spec === 'duels') return DUELS.map((g) => g.id);
  return spec.split(',').map((g) => { if (!GAMES[g]) throw new Error(`unknown game ${g}`); return g; });
}
const keyOf = (e: Pick<Episode, 'agent' | 'harness' | 'game' | 'seed' | 'help' | 'clock' | 'repeat' | 'cap'>) => [e.agent, e.harness, e.game, e.seed, e.help, e.clock, e.repeat, e.cap].join('|');

async function run() {
  const spec = opt('agent')!, out = opt('out')!, help = +(opt('help', '1')!) as HelpLevel, clock = opt('clock', 'none') as Clock;
  const games = gameList(opt('games', 'all')!), seeds = seedList(opt('seeds', '0-9')!), repeats = +(opt('repeats', '1')!), conc = +(opt('concurrency', '1')!);
  if (!spec || !out) throw new Error('usage: run --agent <spec> --out <file.jsonl> [--games all] [--seeds 0-9] [--help 1] [--clock none|latency|token] [--repeats 1] [--concurrency 1]');
  mkdirSync(dirname(out), { recursive: true });
  const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => keyOf(JSON.parse(l))) : []);
  const agent = makeAgent(spec);
  const tasks: (() => Promise<void>)[] = [];
  for (const id of games) {
    const g = GAMES[id], cap = opt('cap') ? +opt('cap')! : g.maxSteps;
    const c: Clock = g.realtime ? clock : 'none';
    if (g.realtime && c === 'none' && !isBaseline(spec) && !flag('allow-untimed')) { console.error(`skip ${id}: real-time games need --clock latency|token for model agents`); continue; }
    for (const seed of seeds) for (let r = 0; r < repeats; r++) {
      const k = keyOf({ agent: agent.name, harness: agent.harness, game: id, seed, help, clock: c, repeat: r, cap });
      if (done.has(k)) continue;
      tasks.push(async () => {
        const e = await runEpisode(g, seed, agent, { help, clock: c, cap, repeat: r });
        appendFileSync(out, JSON.stringify(e) + '\n');
        console.log(`${agent.name.padEnd(28)} ${id.padEnd(12)} seed ${String(seed).padStart(3)} r${r}  score ${String(+e.score.toFixed(2)).padStart(7)}  steps ${String(e.steps).padStart(5)}  invalid ${e.invalid}  ${(e.wallMs / 1000).toFixed(1)}s`);
      });
    }
  }
  console.error(`${tasks.length} episodes to run (${done.size} already in ${out})`);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, conc) }, async () => { while (next < tasks.length) await tasks[next++](); }));
  await agent.close?.();
}

if (cmd === 'run') await run();
else if (cmd === 'report') report(opt('dir', 'results/raw')!, opt('out', 'results/summary.json')!);
else console.error('commands: run, report');
