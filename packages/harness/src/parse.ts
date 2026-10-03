/** Strict: an `ACTION: <id>` line (the last one wins), or a reply that is only a legal id. Never guesses from prose. */
export function parseAction(text: string, legal: string[]): string | null {
  const byLower = new Map(legal.map((a) => [a.toLowerCase(), a]));
  const lines = [...text.matchAll(/ACTION[*_\s]*[:=][\s`"'*_]*([A-Za-z0-9_-]+)/gi)].map((m) => m[1].toLowerCase());
  for (let i = lines.length - 1; i >= 0; i--) { const hit = byLower.get(lines[i]); if (hit) return hit; }
  const bare = text.trim().replace(/^[`"'*\s]+|[`"'*.\s]+$/g, '').toLowerCase();
  return byLower.get(bare) ?? null;
}
