// ベスト10スコアの localStorage 永続化。

import { SCORE_KEY } from "./constants.js";

const MAX_RANKS = 10;

export interface ScoreEntry {
  score: number;
  maxChain: number;
}

// 1件の生データを ScoreEntry に正規化する。
// 旧フォーマット(数値のみ = maxChain 無し)との後方互換のため、数値は maxChain=0 として扱う。
function toEntry(raw: unknown): ScoreEntry | null {
  if (typeof raw === "number") return { score: raw, maxChain: 0 };
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o["score"] === "number") {
      return { score: o["score"], maxChain: typeof o["maxChain"] === "number" ? o["maxChain"] : 0 };
    }
  }
  return null;
}

export function loadBest10(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(SCORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(toEntry)
      .filter((e): e is ScoreEntry => e !== null)
      .slice(0, MAX_RANKS);
  } catch {
    return [];
  }
}

export function saveBest10(entry: ScoreEntry): ScoreEntry[] {
  const entries = loadBest10();
  entries.push(entry);
  entries.sort((a, b) => b.score - a.score);
  const top10 = entries.slice(0, MAX_RANKS);
  try {
    localStorage.setItem(SCORE_KEY, JSON.stringify(top10));
  } catch {
    /* storage unavailable */
  }
  return top10;
}
