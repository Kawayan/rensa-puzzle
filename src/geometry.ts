// 盤面の座標計算ユーティリティ。
// 論理セル(row, col / index)とピクセル座標・CSS transform の相互変換を担う。

import { SIZE } from "./constants.js";
import { boardEl } from "./dom.js";

// 論理セルのインデックス変換
export const idx = (row: number, col: number): number => row * SIZE + col;
export const rowOf = (i: number): number => Math.floor(i / SIZE);
export const colOf = (i: number): number => i % SIZE;

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

interface Metrics {
  gap: number;
  cell: number;
  step: number;
}

// gap/cell/step はボード幅にのみ依存し、変化するのはリサイズ時だけ。
// getBoundingClientRect + getComputedStyle は高コスト(強制リフロー)なので、
// 一度計測した値をキャッシュし、リサイズ時に invalidateMetrics() で破棄する。
let metricsCache: Metrics | null = null;

// 盤面の実寸からセル・余白(px)を求める(キャッシュ済みなら再計測しない)
export function boardMetrics(): Metrics {
  if (metricsCache) return metricsCache;
  const rect = boardEl.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(boardEl).getPropertyValue("--gap")) || 4;
  const cell = (rect.width - (SIZE + 1) * gap) / SIZE;
  metricsCache = { gap, cell, step: cell + gap };
  return metricsCache;
}

// ボード寸法が変わった(リサイズ等)ときにキャッシュを破棄する
export function invalidateMetrics(): void {
  metricsCache = null;
}

// セル座標 → transform 文字列(px)。
// calc(var()) 同士の transform はトランジション補間が効かないため px で指定する。
// boardMetrics() はキャッシュ参照のため、ここではレイアウト読み取りが発生しない。
export function cellTransform(row: number, col: number): string {
  const { gap, step } = boardMetrics();
  const x = gap + col * step;
  const y = gap + row * step;
  return `translate(${x}px, ${y}px)`;
}

// ピクセル座標(clientX/Y) → 論理セル(row, col)。
// rect は呼び出し側で1イベント1回だけ取得して渡す(内部で getBoundingClientRect しない)。
export function pointerToCell(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { row: number; col: number } {
  const { gap, step } = boardMetrics();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const col = clamp(Math.floor((x - gap) / step), 0, SIZE - 1);
  const row = clamp(Math.floor((y - gap) / step), 0, SIZE - 1);
  return { row, col };
}
