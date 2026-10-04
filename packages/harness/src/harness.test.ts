import { describe, expect, it } from 'vitest';
import { GAMES, observe } from '@arcadebench/engine';
import { buildPrompt, parseAction, PROMPT_HASH, toSystemOne } from './index.ts';

describe('parseAction', () => {
  const legal = ['r1c4', 'r0c0', 'up', 'c3'];
  it('reads the ACTION line, last one wins', () => { expect(parseAction('thinking... ACTION: r0c0\nno wait\nACTION: r1c4', legal)).toBe('r1c4'); });
  it('accepts formatting around the id and any case', () => { expect(parseAction('ACTION: `R1C4`', legal)).toBe('r1c4'); expect(parseAction('**ACTION:** c3', legal)).toBe('c3'); expect(parseAction('**ACTION**: up', legal)).toBe('up'); expect(parseAction('ACTION: **c3**', legal)).toBe('c3'); });
  it('accepts a bare id', () => { expect(parseAction('  up. ', legal)).toBe('up'); });
  it('reads function names with dots', () => { const fns = ['maps.get_distance', 'maps.get_distance_duration']; expect(parseAction('ACTION: `Maps.Get_Distance_Duration`.', fns)).toBe('maps.get_distance_duration'); expect(parseAction('ACTION: maps.get_distance.', fns)).toBe('maps.get_distance'); });
  it('never guesses from prose or accepts illegal ids', () => { expect(parseAction("I won't go up, too risky", legal)).toBeNull(); expect(parseAction('ACTION: r9c9', legal)).toBeNull(); expect(parseAction('', legal)).toBeNull(); });
});

describe('prompts', () => {
  it('lists every legal action, with features at L1 and outcomes at L2', () => {
    const g = GAMES.tetris, s = g.init(1);
    const p0 = buildPrompt(g, observe(g, s, 0), []), p2 = buildPrompt(g, observe(g, s, 2), [{ action: 'r0c0', scoreDelta: 1 }]);
    for (const a of g.legal(s)) expect(p0.user).toContain(`- ${a}:`);
    expect(p0.user).not.toContain('holes=');
    expect(p2.user).toContain('holes=');
    expect(p2.user).toContain('outcome: score');
    expect(p2.user).toContain('r0c0 (+1)');
    expect(PROMPT_HASH).toMatch(/^[0-9a-f]{12}$/);
  });
  it('builds a System One choice with one criterion per action', () => {
    const g = GAMES.snake, q = toSystemOne(g, observe(g, g.init(2), 1));
    expect(Object.keys(q.question.criteria)).toEqual(['left', 'straight', 'right']);
    expect(q.state).toContain(g.rules);
  });
  it('asks the plain question on the bare state when a game has one', () => {
    const g = GAMES.sorter, o = observe(g, g.init(2), 1), q = toSystemOne(g, o);
    expect([q.state, q.question.instructions, Object.keys(q.question.criteria)]).toEqual([o.text, 'Is this SMS spam?', ['inbox', 'spam']]);
  });
});
