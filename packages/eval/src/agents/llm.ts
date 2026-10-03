import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { buildPrompt, parseAction } from '@arcadebench/harness';
import type { Agent, Reply } from '../types.ts';

function readKey(name: string, varName: string): string {
  const txt = readFileSync(`${homedir()}/.config/arcadebench/${name}.env`, 'utf8');
  const m = new RegExp(`^${varName}=(.+)$`, 'm').exec(txt);
  if (!m) throw new Error(`${varName} missing in ~/.config/arcadebench/${name}.env`);
  return m[1].trim().replace(/^["']|["']$/g, '');
}

async function withRetry<T>(f: () => Promise<T>, tries = 6): Promise<T> {
  let wait = 1000;
  for (let i = 0; ; i++) {
    try { return await f(); }
    catch (e: any) {
      if (i + 1 >= tries || !(e?.retry ?? true)) throw e;
      await new Promise((r) => setTimeout(r, wait)); wait = Math.min(wait * 2, 30000);
    }
  }
}
class HttpError extends Error { constructor(msg: string, public retry: boolean) { super(msg); } }

function post(label: string, url: string, body: unknown, retry: (status: number) => boolean, headers: Record<string, string> = {}): Promise<any> {
  return withRetry(async () => {
    const r = await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
    if (!r.ok) throw new HttpError(`${label} ${r.status}: ${(await r.text()).slice(0, 200)}`, retry(r.status));
    return r.json();
  });
}

export const NUDGE = 'Your reply was cut off. Reply with only one line: ACTION: <action id>';
type Msg = { role: string; content: string };
type Chat = (m: Msg[], max: number, think: boolean) => Promise<{ text: string; tin: number; tout: number; cut: boolean }>;

function bare(name: string, settings: Record<string, unknown>, chat: Chat, max: number, think: boolean): Agent {
  return {
    name, harness: 'bare', settings,
    async act(obs, c) {
      const p = buildPrompt(c.game, obs, c.history), t0 = performance.now(), ids = obs.actions.map((a) => a.id);
      const m: Msg[] = [{ role: 'system', content: p.system }, { role: 'user', content: p.user }];
      const r = await chat(m, max, think);
      let action = parseAction(r.text, ids), { tin, tout, text } = { ...r };
      if (!action && r.cut) {
        const f = await chat([...m, { role: 'assistant', content: r.text }, { role: 'user', content: NUDGE }], 32, false);
        action = parseAction(f.text, ids); tin += f.tin; tout += f.tout; text += `\n${f.text}`;
      }
      return { action: action ?? '', latencyMs: performance.now() - t0, tokensIn: tin, tokensOut: tout, raw: text.slice(-400) };
    },
  };
}

export function deepseekAgent(opts: { model?: string; thinking: boolean; maxTokens?: number }): Agent {
  const model = opts.model ?? 'deepseek-flash', key = readKey('deepseek', 'DEEPSEEK_API_KEY'), max = opts.maxTokens ?? (opts.thinking ? 16000 : 4096);
  const chat: Chat = async (messages, max_tokens, think) => {
    const j = await post('deepseek', 'https://api.deepseek.com/chat/completions', { model, messages, max_tokens, thinking: { type: think ? 'enabled' : 'disabled' }, ...(think ? {} : { temperature: 0 }) }, (s) => s === 429 || s >= 500, { authorization: `Bearer ${key}` });
    const ch = j.choices?.[0];
    return { text: ch?.message?.content ?? '', tin: j.usage?.prompt_tokens ?? 0, tout: j.usage?.completion_tokens ?? 0, cut: ch?.finish_reason === 'length' };
  };
  return bare(`${model}${opts.thinking ? '+thinking' : ''}`, { provider: 'deepseek', model, thinking: opts.thinking, temperature: opts.thinking ? 'ignored (thinking)' : 0, maxTokens: max, cutoffFollowUp: true }, chat, max, opts.thinking);
}

export function ollamaAgent(model: string, opts: { maxTokens?: number } = {}): Agent {
  const max = opts.maxTokens ?? 2048;
  const chat: Chat = async (messages, num_predict) => {
    const j = await post('ollama', 'http://127.0.0.1:11434/api/chat', { model, stream: false, think: false, messages, options: { temperature: 0, seed: 0, num_predict, num_ctx: 8192 } }, (s) => s >= 500);
    return { text: j.message?.content ?? '', tin: j.prompt_eval_count ?? 0, tout: j.eval_count ?? 0, cut: j.done_reason === 'length' };
  };
  return bare(model, { provider: 'ollama', model, think: false, temperature: 0, seed: 0, numPredict: max, cutoffFollowUp: true }, chat, max, false);
}
