// シード付き乱数 (Mulberry32) と色のランダム選択。
// 内部の rng 状態はこのモジュールに閉じ込め、initRng / randomColor のみ公開する。

import { COLORS } from "./constants.js";
import type { Color } from "./constants.js";

let rng: () => number = Math.random;

export function initRng(seed: number): void {
  let s = seed >>> 0;
  rng = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

export function randomColor(): Color {
  return COLORS[Math.floor(rng() * COLORS.length)]!;
}
