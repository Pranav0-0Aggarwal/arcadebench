import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { toSystemOne } from '@arcadebench/harness';
import type { Agent, Reply } from '../types.ts';

const MODELS = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../research/agents/models.json', import.meta.url)), 'utf8')) as Record<string, { python: string; adapter: string; label: string }>;
const BRIDGE = fileURLToPath(new URL('../../../../research/agents/s1_bridge.py', import.meta.url));

export function systemOneAgent(id: string): Agent {
  const m = MODELS[id];
  if (!m) throw new Error(`unknown System One model ${id}; known: ${Object.keys(MODELS).join(', ')}`);
  const home = process.env.HOME ?? '';
  let child: ChildProcessWithoutNullStreams | null = null, lines: AsyncIterator<string> | null = null, chain = Promise.resolve() as Promise<unknown>;
  const start = async () => {
    child = spawn(m.python.replace('~', home), [BRIDGE, m.adapter.replace('~', home)], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', TOKENIZERS_PARALLELISM: 'false' } });
    child.stderr.on('data', () => {});
    lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    const ready = await lines.next();
    if (ready.done || !String(ready.value).startsWith('{"ready"')) throw new Error(`bridge for ${id} failed to start`);
  };
  const ask = async (payload: unknown): Promise<any> => {
    if (!child) await start();
    child!.stdin.write(JSON.stringify(payload) + '\n');
    const r = await lines!.next();
    if (r.done) throw new Error(`bridge for ${id} exited`);
    return JSON.parse(String(r.value));
  };
  return {
    name: m.label, harness: 'system-one', settings: { model: id, decoding: 'argmax' },
    act(obs, c): Promise<Reply> {
      const run = chain.then(async () => {
        const q = toSystemOne(c.game, obs), t0 = performance.now(), out = await ask(q);
        if (out.error) return { action: '', latencyMs: performance.now() - t0, error: out.error };
        return { action: String(out.choice ?? ''), latencyMs: performance.now() - t0, raw: JSON.stringify(out.probs ?? {}).slice(0, 400) };
      });
      chain = run.catch(() => {});
      return run;
    },
    async close() { child?.stdin.end(); child?.kill(); child = null; },
  };
}
