import { CHESS } from '@arcadebench/api';

export const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));
export const nextElo = (elo: number, games: number, opp: number, score: number) => elo + (games < CHESS.provisional ? CHESS.kProvisional : CHESS.k) * (score - expected(elo, opp));
