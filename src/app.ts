// ===== カラーパズル (7x7) =====
// 仕様:
//  - 7x7 を色付きパネルで埋める
//  - パネルをドラッグで動かす(通過したパネルと順次入れ替わる / パズドラ方式)
//  - 同色を上下左右に5個以上つなぐと、徐々に薄くなり3秒後に消える
//  - 消えた場所に上から新しいパネルが降ってくる
//  - 消えかけの塊に同色をつなぐと消失タイマーがリセットされる

const VERSION = "1.0.0";
const SIZE = 8;
const CELL_COUNT = SIZE * SIZE;
const COLORS = ["red", "blue", "green", "yellow", "purple"] as const;
const MIN_MATCH = 5;
const FADE_MS = 3000;        // 消えるまでの時間
const FALL_MS = 300;         // 落下アニメ時間(CSS .falling と合わせる)

type Color = (typeof COLORS)[number];

interface Panel {
  id: number;
  color: Color;
  fadingSince: number | null; // フェード開始時刻(performance.now)。null=通常
}

// ---- DOM 参照 ----
const boardEl = document.getElementById("board") as HTMLDivElement;
const scoreEl = document.getElementById("score") as HTMLDivElement;
const chainEl = document.getElementById("chain") as HTMLDivElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const versionEl = document.getElementById("version") as HTMLElement;

// ---- 状態 ----
let board: (Panel | null)[] = new Array(CELL_COUNT).fill(null);
const panelEls = new Map<number, HTMLDivElement>();
let nextId = 1;
let score = 0;
let chain = 0;

let selectedId: number | null = null;
let isDragging = false;
let dragCell = -1;          // ドラッグ中の保持パネルの論理セル
let isFalling = false;      // 落下アニメ中フラグ

// ---- 座標ヘルパ ----
const idx = (row: number, col: number): number => row * SIZE + col;
const rowOf = (i: number): number => Math.floor(i / SIZE);
const colOf = (i: number): number => i % SIZE;
const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

// 盤面の実寸からセル・余白(px)を求める
function boardMetrics(): { gap: number; cell: number; step: number } {
  const rect = boardEl.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(boardEl).getPropertyValue("--gap")) || 4;
  const cell = (rect.width - (SIZE + 1) * gap) / SIZE;
  return { gap, cell, step: cell + gap };
}

// セル座標 → transform 文字列(px)。
// calc(var()) 同士の transform はトランジション補間が効かないため px で指定する。
function cellTransform(row: number, col: number): string {
  const { gap, step } = boardMetrics();
  const x = gap + col * step;
  const y = gap + row * step;
  return `translate(${x}px, ${y}px)`;
}

// 全パネルを論理位置へ再配置(リサイズ時など)
function syncAllPositions(): void {
  for (let i = 0; i < CELL_COUNT; i++) {
    const p = board[i];
    if (!p) continue;
    const el = panelEls.get(p.id);
    if (el) el.style.transform = cellTransform(rowOf(i), colOf(i));
  }
}

// ---- 盤面生成 ----
function randomColor(): Color {
  return COLORS[Math.floor(Math.random() * COLORS.length)]!;
}

function makePanel(color: Color): Panel {
  return { id: nextId++, color, fadingSince: null };
}

// 同色の連結成分を全列挙 (4近傍)
function findComponents(): number[][] {
  const seen = new Array<boolean>(CELL_COUNT).fill(false);
  const comps: number[][] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const p = board[i];
    if (!p || seen[i]) continue;
    const color = p.color;
    const stack = [i];
    const comp: number[] = [];
    seen[i] = true;
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      const r = rowOf(cur);
      const c = colOf(cur);
      const neighbors = [
        r > 0 ? idx(r - 1, c) : -1,
        r < SIZE - 1 ? idx(r + 1, c) : -1,
        c > 0 ? idx(r, c - 1) : -1,
        c < SIZE - 1 ? idx(r, c + 1) : -1,
      ];
      for (const n of neighbors) {
        if (n < 0 || seen[n]) continue;
        const np = board[n];
        if (np && np.color === color) {
          seen[n] = true;
          stack.push(n);
        }
      }
    }
    comps.push(comp);
  }
  return comps;
}

// 初期盤面: 5連結ができないようにして生成
function initBoard(): void {
  for (let i = 0; i < CELL_COUNT; i++) {
    board[i] = makePanel(randomColor());
  }
  // 5個以上の塊が無くなるまで一部を塗り替える
  for (let guard = 0; guard < 500; guard++) {
    const big = findComponents().filter((c) => c.length >= MIN_MATCH);
    if (big.length === 0) break;
    for (const comp of big) {
      const pick = comp[Math.floor(Math.random() * comp.length)]!;
      const p = board[pick]!;
      let nc = randomColor();
      while (nc === p.color) nc = randomColor();
      p.color = nc;
    }
  }
}

// ---- 描画 ----
function createPanelEl(panel: Panel): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `panel color-${panel.color}`;
  el.dataset["id"] = String(panel.id);
  boardEl.appendChild(el);
  panelEls.set(panel.id, el);
  return el;
}

function render(): void {
  boardEl.innerHTML = "";
  panelEls.clear();
  for (let i = 0; i < CELL_COUNT; i++) {
    const p = board[i];
    if (!p) continue;
    const el = createPanelEl(p);
    el.style.transform = cellTransform(rowOf(i), colOf(i));
    el.style.opacity = "1";
  }
}

// ---- ヒット判定(ピクセル→セル) ----
function pointerToCell(clientX: number, clientY: number): { row: number; col: number } {
  const rect = boardEl.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(boardEl).getPropertyValue("--gap")) || 4;
  const cellPx = (rect.width - (SIZE + 1) * gap) / SIZE;
  const step = cellPx + gap;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const col = clamp(Math.floor((x - gap) / step), 0, SIZE - 1);
  const row = clamp(Math.floor((y - gap) / step), 0, SIZE - 1);
  return { row, col };
}

function setSelected(id: number | null): void {
  if (selectedId !== null) {
    const prev = panelEls.get(selectedId);
    if (prev) prev.classList.remove("selected");
  }
  selectedId = id;
  if (id !== null) {
    const el = panelEls.get(id);
    if (el) el.classList.add("selected");
  }
}

// ---- 入力 (マウス & タッチ) ----
function onPointerDown(e: PointerEvent): void {
  if (isFalling) return;
  const { row, col } = pointerToCell(e.clientX, e.clientY);
  const cell = idx(row, col);
  const panel = board[cell];
  if (!panel) return;

  setSelected(panel.id);
  isDragging = true;
  dragCell = cell;
  try {
    boardEl.setPointerCapture(e.pointerId);
  } catch {
    /* synthetic pointer や未対応環境では無視 */
  }

  const el = panelEls.get(panel.id)!;
  el.classList.add("dragging");
  followPointer(el, e.clientX, e.clientY);
  e.preventDefault();
}

function onPointerMove(e: PointerEvent): void {
  if (!isDragging || selectedId === null) return;

  const held = board[dragCell];
  if (!held || held.id !== selectedId) return;

  const heldEl = panelEls.get(selectedId)!;
  followPointer(heldEl, e.clientX, e.clientY);

  const { row, col } = pointerToCell(e.clientX, e.clientY);
  const newCell = idx(row, col);
  if (newCell === dragCell) return;

  const target = board[newCell];
  if (!target) return;

  // 論理位置を入れ替え。保持パネルは指に追従、相手はセルへスナップ
  board[dragCell] = target;
  board[newCell] = held;
  const targetEl = panelEls.get(target.id)!;
  targetEl.classList.remove("falling");
  targetEl.style.transform = cellTransform(rowOf(dragCell), colOf(dragCell));
  dragCell = newCell;
}

function onPointerUp(e: PointerEvent): void {
  if (!isDragging) return;
  isDragging = false;
  if (selectedId !== null) {
    const el = panelEls.get(selectedId);
    if (el) {
      el.classList.remove("dragging");
      el.style.transform = cellTransform(rowOf(dragCell), colOf(dragCell));
    }
  }
  try {
    boardEl.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  resolveMatches();
}

// 保持パネルをポインタ位置へ追従(中心合わせ + 拡大)
function followPointer(el: HTMLDivElement, clientX: number, clientY: number): void {
  const rect = boardEl.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(boardEl).getPropertyValue("--gap")) || 4;
  const cellPx = (rect.width - (SIZE + 1) * gap) / SIZE;
  const x = clamp(clientX - rect.left - cellPx / 2, 0, rect.width - cellPx);
  const y = clamp(clientY - rect.top - cellPx / 2, 0, rect.height - cellPx);
  el.style.transform = `translate(${x}px, ${y}px) scale(1.12)`;
}

// ---- 消去判定 (仕様3・5) ----
function resolveMatches(): void {
  const now = performance.now();
  const comps = findComponents();
  for (const comp of comps) {
    const panels = comp.map((i) => board[i]!);
    const hasFading = panels.some((p) => p.fadingSince !== null);
    const hasFresh = panels.some((p) => p.fadingSince === null);
    if (hasFading && hasFresh) {
      // 消えかけのパネルに同色が接触 → サイズに関わらず連結した同色を
      // すべて巻き込んで消失させ、タイマーをリセットする
      for (const p of panels) p.fadingSince = now;
    } else if (!hasFading && comp.length >= MIN_MATCH) {
      // 新しく5個以上つながった塊 → フェード開始
      for (const p of panels) p.fadingSince = now;
    }
    // それ以外(全員フェード中で新規なし / 5未満で消えかけ無し)は変更しない
  }
}

// ---- 重力・補充 (仕様4) ----
function applyGravity(): void {
  for (let col = 0; col < SIZE; col++) {
    const survivors: Panel[] = [];
    for (let row = 0; row < SIZE; row++) {
      const p = board[idx(row, col)];
      if (p) survivors.push(p);
    }
    const emptyCount = SIZE - survivors.length;
    if (emptyCount === 0) continue;

    const newPanels: Panel[] = [];
    for (let k = 0; k < emptyCount; k++) newPanels.push(makePanel(randomColor()));
    const column = [...newPanels, ...survivors]; // 上から並ぶ

    for (let row = 0; row < SIZE; row++) {
      const panel = column[row]!;
      board[idx(row, col)] = panel;
      let el = panelEls.get(panel.id);
      if (!el) {
        // 新規パネルは盤面の上(画面外)から落とす
        el = createPanelEl(panel);
        const startRow = row - emptyCount; // 負の行 = 上方
        el.style.opacity = "1";
        el.style.transform = cellTransform(startRow, col);
      }
      el.classList.add("falling");
      el.classList.remove("selected");
    }
  }

  // 次フレームで目標位置へ移動させて落下アニメ発火
  requestAnimationFrame(() => {
    for (let i = 0; i < CELL_COUNT; i++) {
      const p = board[i];
      if (!p) continue;
      const el = panelEls.get(p.id);
      if (el) el.style.transform = cellTransform(rowOf(i), colOf(i));
    }
  });

  isFalling = true;
  window.setTimeout(() => {
    for (const el of panelEls.values()) el.classList.remove("falling");
    isFalling = false;
    resolveMatches(); // 連鎖判定
  }, FALL_MS);
}

// ---- アニメーションループ ----
function tick(): void {
  const now = performance.now();

  const anyFading = board.some((p) => p && p.fadingSince !== null);
  if (!anyFading && !isFalling && chain !== 0) {
    chain = 0;
    chainEl.textContent = "0";
  }

  const expired: number[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const p = board[i];
    if (!p || p.fadingSince === null) continue;
    const elapsed = now - p.fadingSince;
    const el = panelEls.get(p.id);
    if (elapsed >= FADE_MS) {
      expired.push(i);
    } else if (el) {
      // 上から徐々に色が抜けていき、残った色が下端まで減ると消失する
      const prog = Math.min(elapsed / FADE_MS, 1);
      const pct = (prog * 100).toFixed(1);
      el.style.background = `linear-gradient(to bottom, transparent ${pct}%, var(--c-${p.color}) ${pct}%)`;
    }
  }

  if (expired.length > 0) {
    for (const i of expired) {
      const p = board[i]!;
      const el = panelEls.get(p.id);
      if (el) el.remove();
      panelEls.delete(p.id);
      if (selectedId === p.id) selectedId = null;
      board[i] = null;
      score++;
    }
    scoreEl.textContent = String(score);
    chain++;
    chainEl.textContent = String(chain);
    applyGravity();
  }

  requestAnimationFrame(tick);
}

// ---- リセット ----
function reset(): void {
  isDragging = false;
  isFalling = false;
  selectedId = null;
  score = 0;
  chain = 0;
  scoreEl.textContent = "0";
  chainEl.textContent = "0";
  board = new Array(CELL_COUNT).fill(null);
  initBoard();
  render();
  // 中央パネルを初期選択
  const center = board[idx(Math.floor(SIZE / 2), Math.floor(SIZE / 2))];
  if (center) setSelected(center.id);
}

// ---- イベント登録 / 起動 ----
versionEl.textContent = `v${VERSION}`;
boardEl.addEventListener("pointerdown", onPointerDown);
boardEl.addEventListener("pointermove", onPointerMove);
boardEl.addEventListener("pointerup", onPointerUp);
boardEl.addEventListener("pointercancel", onPointerUp);
resetBtn.addEventListener("click", reset);
window.addEventListener("resize", () => {
  if (!isDragging) syncAllPositions();
});

reset();
requestAnimationFrame(tick);
