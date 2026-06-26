// ベスト10スコアの localStorage 永続化。

import { SCORE_KEY } from "./constants.js";

const MAX_RANKS = 10;

export function loadBest10(): number[] {
  try {
    const raw = localStorage.getItem(SCORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is number => typeof v === "number").slice(0, MAX_RANKS);
  } catch {
    return [];
  }
}

export function saveBest10(newScore: number): number[] {
  const scores = loadBest10();
  scores.push(newScore);
  scores.sort((a, b) => b - a);
  const top10 = scores.slice(0, MAX_RANKS);
  try {
    localStorage.setItem(SCORE_KEY, JSON.stringify(top10));
  } catch {
    /* storage unavailable */
  }
  return top10;
}
