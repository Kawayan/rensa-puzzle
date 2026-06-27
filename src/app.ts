// RENSA! — ゲームエンジン本体。
// 盤面状態・入力・消去判定・重力・アニメーションループなど、状態を共有する
// 中心ロジックをまとめる。独立した処理(定数/DOM/座標/乱数/サウンド/永続化)は
// 専用モジュールへ分離している。

import {
  VERSION,
  SIZE,
  CELL_COUNT,
  MIN_MATCH,
  FALL_MS,
  TIME_LIMIT_MS,
  RECOVER_MS_PER_PANEL,
  SPEED_RAMP_MS,
  SPEED_RAMP_MAX,
  SPEED_STEP_MS,
  MILESTONE_CHAIN_INTERVAL,
  FADE_MS,
  FADE_MS_MIN,
  FADE_CHAIN_STEP,
  FADE_CHAIN_MAX,
  DRAG_SCALE,
  TIME_BAR_MID_RATIO,
  TIME_BAR_LOW_RATIO,
  FADE_PASTEL_PCT,
  TICK_MAX_DT_MS,
  BOARD_INIT_GUARD,
} from "./constants.js";
import type { Color, Panel } from "./constants.js";
import {
  boardEl,
  scoreEl,
  chainEl,
  maxchainEl,
  levelEl,
  seedDisplayEl,
  resetBtn,
  versionEl,
  previewEl,
  timeBarFillEl,
  timeBarTextEl,
  gameOverEl,
  finalScoreEl,
  scoreListEl,
  restartBtn,
  chainMilestoneEl,
  startscreenEl,
  startBtn,
  bgmSelectEl,
  bgmVolumeEl,
  bgmVolumeValueEl,
  playtimeEl,
} from "./dom.js";
import {
  idx,
  rowOf,
  colOf,
  clamp,
  boardMetrics,
  cellTransform,
  pointerToCell,
} from "./geometry.js";
import { initRng, randomColor } from "./rng.js";
import { playMatchSound, playVanishSound, playGameOverSound } from "./sound.js";
import { saveBest10 } from "./storage.js";
import type { ScoreEntry } from "./storage.js";
import { populateBgmSelect, playBgm, stopBgm, getVolumeStep, setVolumeStep } from "./bgm.js";

// ---- 状態 ----
let board: (Panel | null)[] = new Array(CELL_COUNT).fill(null);
const panelEls = new Map<number, HTMLDivElement>();
let nextId = 1;
let score = 0;
let chain = 0;
let maxChain = 0; // セッション中の最大チェイン数

let nextColors: Color[] = [];            // 各列の次に落ちてくる色
const previewEls: HTMLDivElement[] = []; // プレビュー行のセル(列順)

let selectedId: number | null = null;
let isDragging = false;
let dragCell = -1;          // ドラッグ中の保持パネルの論理セル
let isFalling = false;      // 落下アニメ中フラグ
let timeLeftMs = TIME_LIMIT_MS; // 残り時間
let lastFrameTime = 0;          // 直前フレームの時刻(delta計算用)
let gameOver = false;
let running = false;            // ゲームループ稼働中フラグ(スタート画面表示中はfalse)
let lastSpeedStep = 0;          // 前フレームの速度ステップ(レベル更新検知用)

// ゲーム開始時刻。リセット時に更新し、LEVELと速度倍率を1に戻す。
let sessionStartTime = performance.now();

// 全パネルを論理位置へ再配置(リサイズ時など)
function syncAllPositions(): void {
  for (let i = 0; i < CELL_COUNT; i++) {
    const p = board[i];
    if (!p) continue;
    const el = panelEls.get(p.id);
    if (el) el.style.transform = cellTransform(rowOf(i), colOf(i));
  }
}

// 50チェーン達成時のオーバーレイ表示(3秒、CSSアニメーションで自動フェード)
function showChainMilestone(chainCount: number): void {
  chainMilestoneEl.textContent = `CHAIN ${chainCount}!!`;
  chainMilestoneEl.classList.remove("show");
  void chainMilestoneEl.offsetWidth; // アニメーションをリセットするためのreflow
  chainMilestoneEl.classList.add("show");
}

// チェイン数に応じたフェード時間を返す。
// chain=0 → FADE_MS、chain=FADE_CHAIN_MAX → FADE_MS_MIN。FADE_CHAIN_STEP ごとに段階的に短縮。
function currentFadeMs(): number {
  const maxSteps = FADE_CHAIN_MAX / FADE_CHAIN_STEP;
  const steps = Math.min(Math.floor(chain / FADE_CHAIN_STEP), maxSteps);
  return Math.round(FADE_MS - (steps * (FADE_MS - FADE_MS_MIN)) / maxSteps);
}

// ---- 盤面生成 ----
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
  for (let guard = 0; guard < BOARD_INIT_GUARD; guard++) {
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
// パネル要素を生成する。DOMへ追加する前に初期 transform を確定させることで、
// 追加直後の原点(左上)がトランジションの起点として残るのを防ぐ(斜め落下対策)。
function createPanelEl(panel: Panel, transform: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `panel color-${panel.color}`;
  el.dataset["id"] = String(panel.id);
  el.style.opacity = "1";
  el.style.transform = transform;
  boardEl.appendChild(el);
  panelEls.set(panel.id, el);
  return el;
}

// 次に落ちてくる色のプレビュー行を描画
function renderPreview(): void {
  previewEl.innerHTML = "";
  previewEls.length = 0;
  for (let col = 0; col < SIZE; col++) {
    const cell = document.createElement("div");
    cell.className = `preview-cell color-${nextColors[col]!}`;
    previewEl.appendChild(cell);
    previewEls.push(cell);
  }
}

// 指定列の次色を更新(状態とプレビュー表示の両方)
function setNextColor(col: number, color: Color): void {
  nextColors[col] = color;
  const cell = previewEls[col];
  if (cell) cell.className = `preview-cell color-${color}`;
}

function render(): void {
  boardEl.innerHTML = "";
  panelEls.clear();
  for (let i = 0; i < CELL_COUNT; i++) {
    const p = board[i];
    if (!p) continue;
    createPanelEl(p, cellTransform(rowOf(i), colOf(i)));
  }
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
  // 落下アニメ中(isFalling)でも掴めるようにする。board[] は重力処理後に確定済みで
  // 視覚位置だけがアニメ中なので、論理的には掴んで問題ない。
  if (gameOver) return;
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
  el.classList.remove("falling"); // 落下トランジションを切り、掴んだ瞬間に指へ追従させる
  el.classList.add("dragging");
  document.body.style.cursor = "grabbing";
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
  resolveMatches();
}

function onPointerUp(e: PointerEvent): void {
  if (!isDragging) return;
  isDragging = false;
  document.body.style.cursor = "";
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
  const { cell } = boardMetrics();
  const x = clamp(clientX - rect.left - cell / 2, 0, rect.width - cell);
  const y = clamp(clientY - rect.top - cell / 2, 0, rect.height - cell);
  el.style.transform = `translate(${x}px, ${y}px) scale(${DRAG_SCALE})`;
}

// ---- 消去判定 (仕様3・5) ----
function resolveMatches(): void {
  const now = performance.now();
  const comps = findComponents();
  let newlyFading = 0;
  for (const comp of comps) {
    const panels = comp.map((i) => board[i]!);
    const hasFading = panels.some((p) => p.fadingSince !== null);
    const hasFresh = panels.some((p) => p.fadingSince === null);
    if (hasFading && hasFresh) {
      // 消えかけのパネルに同色が接触 → サイズに関わらず連結した同色を
      // すべて巻き込んで消失させ、タイマーをリセットする。
      // 新しくフェードに加わった分だけ時間を回復する。
      newlyFading += panels.filter((p) => p.fadingSince === null).length;
      for (const p of panels) p.fadingSince = now;
    } else if (!hasFading && comp.length >= MIN_MATCH) {
      // 新しく5個以上つながった塊 → フェード開始
      newlyFading += comp.length;
      for (const p of panels) p.fadingSince = now;
    }
    // それ以外(全員フェード中で新規なし / 5未満で消えかけ無し)は変更しない
  }
  if (newlyFading > 0) {
    timeLeftMs = Math.min(TIME_LIMIT_MS, timeLeftMs + newlyFading * RECOVER_MS_PER_PANEL);
    playMatchSound(chain);
  }
}

// ---- 重力・補充 (仕様4) ----
function applyGravity(): void {
  const affectedCols: number[] = [];
  for (let col = 0; col < SIZE; col++) {
    const survivors: Panel[] = [];
    for (let row = 0; row < SIZE; row++) {
      const p = board[idx(row, col)];
      if (p) survivors.push(p);
    }
    const emptyCount = SIZE - survivors.length;
    if (emptyCount === 0) continue;
    affectedCols.push(col);

    const newPanels: Panel[] = [];
    for (let k = 0; k < emptyCount; k++) {
      // 一番下に積まれる(最初に落ちてくる)パネルはプレビューの色を使う
      const color = k === emptyCount - 1 ? nextColors[col]! : randomColor();
      newPanels.push(makePanel(color));
    }
    // プレビュー色を消費したので次色を補充し、表示を更新する
    setNextColor(col, randomColor());
    const column = [...newPanels, ...survivors]; // 上から並ぶ

    for (let row = 0; row < SIZE; row++) {
      const panel = column[row]!;
      board[idx(row, col)] = panel;
      const el = panelEls.get(panel.id);
      if (!el) {
        // 新規パネルは盤面の上(画面外)の開始位置で生成する。
        // createPanelEl が append 前に transform を設定するので、左上からの斜め移動にならない。
        const startRow = row - emptyCount; // 負の行 = 上方
        createPanelEl(panel, cellTransform(startRow, col));
      } else {
        // survivor は現在位置のまま。falling はこの後まとめて付ける
        if (!(isDragging && panel.id === selectedId)) {
          el.classList.remove("selected");
        }
      }
    }
  }

  if (affectedCols.length === 0) return;

  // 開始位置をブラウザに確定させてから(リフロー強制)目標位置へ遷移させる。
  // これをしないとトランジションが原点(左上)から斜めに走り、左右に流れて見える。
  void boardEl.offsetHeight;

  for (const col of affectedCols) {
    for (let row = 0; row < SIZE; row++) {
      const p = board[idx(row, col)];
      if (!p) continue;
      const el = panelEls.get(p.id);
      if (!el) continue;
      if (isDragging && p.id === selectedId) {
        // ドラッグ中パネルは落下アニメをスキップし、dragCell だけ新位置に更新する。
        // これをしないと onPointerUp が古い dragCell で要素を誤配置し黒背景が残る。
        dragCell = idx(row, col);
        continue;
      }
      el.classList.add("falling"); // 上→下の落下アニメを有効化
      el.style.transform = cellTransform(row, col);
    }
  }

  isFalling = true;
  window.setTimeout(() => {
    for (const el of panelEls.values()) el.classList.remove("falling");
    isFalling = false;
    resolveMatches(); // 連鎖判定
  }, FALL_MS);
}

// ---- タイムリミット ----
// セッション経過時間に応じた速度倍率
function timeSpeedRate(): number {
  const elapsed = Math.min(performance.now() - sessionStartTime, SPEED_RAMP_MS);
  const totalSteps = SPEED_RAMP_MS / SPEED_STEP_MS;
  const step = Math.floor(elapsed / SPEED_STEP_MS); // 現在のステップ
  return 1 + (SPEED_RAMP_MAX - 1) * (step / totalSteps);
}

function updateTimeBar(): void {
  const ratio = Math.max(0, Math.min(1, timeLeftMs / TIME_LIMIT_MS));
  timeBarFillEl.style.width = `${ratio * 100}%`;
  timeBarFillEl.style.background =
    ratio > TIME_BAR_MID_RATIO
      ? "var(--time-high)"
      : ratio > TIME_BAR_LOW_RATIO
        ? "var(--time-mid)"
        : "var(--time-low)";
  timeBarTextEl.textContent = String(Math.ceil(timeLeftMs / 1000));
}

// ---- ゲームオーバー ----
function renderScoreRanking(entries: ScoreEntry[], current: ScoreEntry): void {
  scoreListEl.innerHTML = "";
  let highlighted = false;
  for (const e of entries) {
    const li = document.createElement("li");
    li.innerHTML =
      `<span class="rank-score">${e.score}</span>` +
      `<span class="rank-chain">${e.maxChain} chain</span>`;
    // 今回の結果(スコアと最大チェインが一致する最初の行)を強調
    if (!highlighted && e.score === current.score && e.maxChain === current.maxChain) {
      li.classList.add("rank-current");
      highlighted = true;
    }
    scoreListEl.appendChild(li);
  }
}

function triggerGameOver(): void {
  gameOver = true;
  isDragging = false;
  stopBgm();
  playGameOverSound();
  finalScoreEl.textContent = String(score);
  const current: ScoreEntry = { score, maxChain };
  const top10 = saveBest10(current);
  renderScoreRanking(top10, current);
  gameOverEl.classList.remove("hidden");
}

// ---- アニメーションループ ----
function tick(): void {
  // スタート画面表示中などループ停止要求があれば再スケジュールせず終了
  if (!running) return;
  const now = performance.now();

  // ゲームオーバー中は時間も盤面も止める
  if (gameOver) {
    lastFrameTime = now;
    requestAnimationFrame(tick);
    return;
  }

  // 残り時間を減らす(タブ非表示などによる大ジャンプは抑制)
  if (lastFrameTime === 0) lastFrameTime = now;
  const dt = Math.min(now - lastFrameTime, TICK_MAX_DT_MS);
  lastFrameTime = now;
  timeLeftMs -= dt * timeSpeedRate();

  // 速度ステップが上がったらレベル表示を更新
  const step = Math.floor(Math.min(now - sessionStartTime, SPEED_RAMP_MS) / SPEED_STEP_MS);
  if (step !== lastSpeedStep) {
    lastSpeedStep = step;
    levelEl.textContent = String(step + 1);
  }

  // プレイ時間を秒で更新
  const elapsedSec = Math.floor((now - sessionStartTime) / 1000);
  playtimeEl.innerHTML = `${elapsedSec}<small>s</small>`;
  if (timeLeftMs <= 0) {
    timeLeftMs = 0;
    updateTimeBar();
    // フェード中パネルがある間はゲームオーバーを遅らせる
    if (!board.some((p) => p && p.fadingSince !== null)) {
      triggerGameOver();
      requestAnimationFrame(tick);
      return;
    }
  }

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
    const fadeMs = currentFadeMs();
    if (elapsed >= fadeMs) {
      expired.push(i);
    } else if (el) {
      // 上から徐々に色が抜けていき、残った色が下端まで減ると消失する
      const prog = Math.min(elapsed / fadeMs, 1);
      const pct = (prog * 100).toFixed(1);
      const light = `color-mix(in srgb, var(--c-${p.color}) ${FADE_PASTEL_PCT}%, white)`;
      el.style.background = `linear-gradient(to bottom, ${light} ${pct}%, var(--c-${p.color}) ${pct}%)`;
    }
  }

  if (expired.length > 0) {
    for (const i of expired) {
      const p = board[i]!;
      const el = panelEls.get(p.id);
      if (el) el.remove();
      panelEls.delete(p.id);
      if (selectedId === p.id) {
        selectedId = null;
        if (isDragging) {
          isDragging = false;
          document.body.style.cursor = "";
        }
      }
      board[i] = null;
      score += chain + 1; // chain倍率: 1連鎖目=1倍、2連鎖目=2倍…
    }
    scoreEl.textContent = String(score);
    chain++;
    chainEl.textContent = String(chain);
    if (chain > maxChain) {
      maxChain = chain;
      maxchainEl.textContent = String(maxChain);
    }
    if (chain % MILESTONE_CHAIN_INTERVAL === 0) showChainMilestone(chain);
    playVanishSound();
    applyGravity();
  }

  updateTimeBar();
  requestAnimationFrame(tick);
}

// ---- リセット ----
function reset(): void {
  isDragging = false;
  isFalling = false;
  selectedId = null;
  score = 0;
  chain = 0;
  maxChain = 0;
  scoreEl.textContent = "0";
  chainEl.textContent = "0";
  maxchainEl.textContent = "0";
  timeLeftMs = TIME_LIMIT_MS;
  lastFrameTime = 0;
  gameOver = false;
  gameOverEl.classList.add("hidden");
  updateTimeBar();
  sessionStartTime = performance.now();
  lastSpeedStep = 0;
  levelEl.textContent = "1";

  // 新しいSeedで乱数を初期化して表示
  const seed = (Math.random() * 0x100000000) >>> 0;
  initRng(seed);
  seedDisplayEl.textContent = seed.toString(16).toUpperCase().padStart(8, "0");

  board = new Array(CELL_COUNT).fill(null);
  initBoard();
  render();
  nextColors = Array.from({ length: SIZE }, () => randomColor());
  renderPreview();
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
// ループを止めてスタート画面へ戻る(リスタートボタン)
function showStartScreen(): void {
  running = false; // tickループを停止
  stopBgm();
  startscreenEl.classList.remove("hidden");
}

// スタート画面からゲームを開始する
function startGame(): void {
  startscreenEl.classList.add("hidden");
  playBgm(bgmSelectEl.value); // ユーザー操作直後なので自動再生がブロックされない
  reset();
  if (!running) {
    running = true;
    requestAnimationFrame(tick);
  }
}

resetBtn.addEventListener("click", showStartScreen);
restartBtn.addEventListener("click", showStartScreen);
window.addEventListener("resize", () => {
  if (!isDragging) syncAllPositions();
});

// スタート画面の BGM コンボボックスを構築
void populateBgmSelect(bgmSelectEl);

// スタート画面でBGMを選択したら即プレビュー再生する
bgmSelectEl.addEventListener("change", () => {
  playBgm(bgmSelectEl.value);
});

// 音量スライダーを記憶値で初期化し、操作に応じて即反映する
bgmVolumeEl.value = String(getVolumeStep());
bgmVolumeValueEl.textContent = String(getVolumeStep());
bgmVolumeEl.addEventListener("input", () => {
  const step = Number(bgmVolumeEl.value);
  setVolumeStep(step);
  bgmVolumeValueEl.textContent = String(step);
});

startBtn.addEventListener("click", startGame);
