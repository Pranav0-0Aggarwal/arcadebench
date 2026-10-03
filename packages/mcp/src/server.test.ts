import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { GAMES, PAPER_CAPS } from '@arcadebench/engine';
import { runEpisode } from '@arcadebench/eval';
import { nullAgent } from '../../eval/src/agents/baselines.ts';

const SERVER = fileURLToPath(new URL('./server.ts', import.meta.url));
function client(extra: string[]) {
  const out = join(mkdtempSync(join(tmpdir(), 'abmcp-')), 'ep.jsonl');
  const p = spawn(process.execPath, ['--import', 'tsx', SERVER, ...extra, '--out', out, '--agent', 'test', '--harness', 'scripted'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: p.stdout })[Symbol.asyncIterator]();
  let id = 0;
  const rpc = async (method: string, params: unknown = {}) => { p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) + '\n'); return JSON.parse(String((await lines.next()).value)); };
  const tool = async (name: string, args: unknown = {}) => { const r = await rpc('tools/call', { name, arguments: args }); return { isError: r.result.isError, text: r.result.content[0].text as string }; };
  return { p, out, rpc, tool };
}
const episodes = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

describe('mcp server', () => {
  it('speaks MCP and a scripted game matches the bare runner move for move', async () => {
    const c = client(['--game', 'connect4', '--seed', '3', '--help', '0']);
    const init = await c.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
    expect(init.result.capabilities.tools).toBeDefined();
    expect((await c.rpc('tools/list')).result.tools.map((t: any) => t.name)).toContain('make_move');
    let v = JSON.parse((await c.tool('start_game', { game: 'tetris', seed: 99 })).text.split('\n').at(-1)!);
    expect(v.game).toBe('Connect Four');
    while (!v.done) v = JSON.parse((await c.tool('make_move', { session: v.session, action: v.legalActions[0].id })).text);
    c.p.stdin.end(); await new Promise((r) => c.p.on('exit', r));
    const [ep] = episodes(c.out), ref = await runEpisode(GAMES.connect4, 3, nullAgent(), { help: 0, clock: 'none', cap: PAPER_CAPS.connect4 });
    expect(ep.actions).toEqual(ref.actions);
    expect(ep.score).toBe(ref.score);
    expect(ep.truncated).toBe(false);
  });
  it('writes a truncated episode when the harness stops mid-game', async () => {
    const c = client(['--game', 'snake', '--seed', '1']);
    await c.rpc('initialize', {});
    const v = JSON.parse((await c.tool('start_game')).text);
    await c.tool('make_move', { session: v.session, action: 'straight' });
    c.p.kill('SIGTERM'); await new Promise((r) => c.p.on('exit', r));
    const [ep] = episodes(c.out);
    expect(ep.truncated).toBe(true); expect(ep.steps).toBe(1);
  });
  it('rejects illegal moves with the legal list, counts them, and resumes instead of restarting', async () => {
    const c = client(['--game', 'beams', '--seed', '2']);
    await c.rpc('initialize', {});
    const v = JSON.parse((await c.tool('start_game')).text);
    const bad = await c.tool('make_move', { session: v.session, action: 'teleport' });
    expect(bad.isError).toBe(true); expect(bad.text).toContain('flip0');
    await c.tool('make_move', { session: v.session, action: 'flip0' });
    const again = JSON.parse((await c.tool('start_game')).text);
    expect(again.step).toBe(1);
    c.p.stdin.end(); await new Promise((r) => c.p.on('exit', r));
    expect(episodes(c.out)[0].invalid).toBe(1);
  });
});
