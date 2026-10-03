import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { buildPrompt, parseAction } from '@arcadebench/harness';
import type { Agent, Reply } from '../types.ts';

/** keys are read from ~/.config/arcadebench/<name>.env at run time; never from the repo */
export function readKey(name: string, varName: string): string {
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

/** DeepSeek (OpenAI-compatible chat completions) with the official Closed prompt */
export function deepseekAgent(opts: { model?: string; thinking: boolean; maxTokens?: number }): Agent {
  const model = opts.model ?? 'deepseek-flash', key = readKey('deepseek', 'DEEPSEEK_API_KEY');
  const settings = { provider: 'deepseek', model, thinking: opts.thinking, temperature: opts.thinking ? 'ignored (thinking)' : 0, maxTokens: opts.maxTokens ?? (opts.thinking ? 16000 : 1024) };
  return {
    name: `${model}${opts.thinking ? '+thinking' : ''}`, harness: 'bare', settings,
    async act(obs, c): Promise<Reply> {
      const p = buildPrompt(c.game, obs, c.history), t0 = performance.now();
      const body: Record<string, unknown> = { model, messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }], max_tokens: settings.maxTokens, thinking: { type: opts.thinking ? 'enabled' : 'disabled' } };
      if (!opts.thinking) body.temperature = 0;
      const j = await withRetry(async () => {
        const r = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
        if (!r.ok) throw new HttpError(`deepseek ${r.status}: ${(await r.text()).slice(0, 200)}`, r.status === 429 || r.status >= 500);
        return r.json() as Promise<any>;
      });
      const text: string = j.choices?.[0]?.message?.content ?? '';
      return { action: parseAction(text, obs.actions.map((a) => a.id)) ?? '', latencyMs: performance.now() - t0, tokensIn: j.usage?.prompt_tokens, tokensOut: j.usage?.completion_tokens, raw: text.slice(-400) };
    },
  };
}

/** local models through Ollama's native API: thinking off, temperature 0, fixed seed */
export function ollamaAgent(model: string, opts: { maxTokens?: number } = {}): Agent {
  const settings = { provider: 'ollama', model, think: false, temperature: 0, seed: 0, numPredict: opts.maxTokens ?? 512 };
  return {
    name: model, harness: 'bare', settings,
    async act(obs, c): Promise<Reply> {
      const p = buildPrompt(c.game, obs, c.history), t0 = performance.now();
      const j = await withRetry(async () => {
        const r = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(300000),
          body: JSON.stringify({ model, stream: false, think: false, messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }], options: { temperature: 0, seed: 0, num_predict: settings.numPredict, num_ctx: 8192 } }) });
        if (!r.ok) throw new HttpError(`ollama ${r.status}: ${(await r.text()).slice(0, 200)}`, r.status >= 500);
        return r.json() as Promise<any>;
      });
      const text: string = j.message?.content ?? '';
      return { action: parseAction(text, obs.actions.map((a) => a.id)) ?? '', latencyMs: performance.now() - t0, tokensIn: j.prompt_eval_count, tokensOut: j.eval_count, raw: text.slice(-400) };
    },
  };
}
