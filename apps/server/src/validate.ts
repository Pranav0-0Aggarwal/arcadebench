import { LIMITS, type AgentType, type Kind, type Listing, type Mode } from '@arcadebench/api';
import type { HelpLevel } from '@arcadebench/engine';
import { Fail } from './util.ts';

export const bad = (field: string, why: string): never => { throw new Fail(400, `${field}: ${why}`); };
export const pick = <T>(v: unknown, options: readonly T[], field: string, fallback?: T): T =>
  v === undefined && fallback !== undefined ? fallback : options.includes(v as T) ? (v as T) : bad(field, `must be one of ${options.join(', ')}`);
const text = (v: unknown, field: string, max: number) => (typeof v === 'string' && v.trim() && v.length <= max && !/[\u0000-\u001f]/.test(v) ? v.trim() : bad(field, `required, up to ${max} characters`));

function linkedin(v: unknown) {
  if (v === undefined || v === '') return null;
  const u = (() => { try { return new URL(String(v)); } catch { return null; } })();
  if (!u || !/^https?:$/.test(u.protocol) || !/(^|\.)linkedin\.com$/.test(u.hostname) || u.href.length > 200) bad('linkedin', 'must be a linkedin.com URL');
  return u!.href;
}

export interface NewEntry { kind: Kind; x: string; email: string; linkedin: string | null; listing: Listing; name: string; mode: Mode | null; agentType: AgentType | null; help: HelpLevel; skill: string | null; baseline: boolean }

export function parseRegister(b: Record<string, unknown>): NewEntry {
  const kind = pick<Kind>(b.kind, ['ai', 'human'], 'kind');
  const x = typeof b.x === 'string' && LIMITS.xHandle.test(b.x) ? b.x : bad('x', 'must be 1 to 15 letters, digits or underscores');
  const email = typeof b.email === 'string' && b.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) ? b.email : bad('email', 'must be an email address');
  const base = { kind, x, email, linkedin: linkedin(b.linkedin), listing: pick<Listing>(b.listing, ['listed', 'unlisted'], 'listing') };
  if (kind === 'ai') return { ...base, name: text(b.model, 'model', 80), mode: pick<Mode>(b.mode, ['tool', 'computer-use'], 'mode', 'tool'), agentType: pick<AgentType>(b.agentType, ['llm', 'system-one', 'agent', 'other'], 'agentType', 'other'), help: pick<HelpLevel>(b.help, [0, 1, 2], 'help', 1), skill: null, baseline: false };
  return { ...base, name: 'human', mode: null, agentType: null, help: 0, skill: b.skill === undefined ? null : pick(b.skill, ['first-time', 'sometimes', 'often'], 'skill'), baseline: b.baselineOptIn === undefined ? false : b.baselineOptIn === true || bad('baselineOptIn', 'must be a boolean') };
}
