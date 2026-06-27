// ゲーム全体で共有する定数と基本型。
// このモジュールは他に依存しない(依存グラフの末端)。

export const VERSION = "1.0.4";

export const SIZE = 8;
export const CELL_COUNT = SIZE * SIZE;
export const SCORE_KEY = "puzzle-best10"; // localStorage キー
export const COLORS = ["red", "blue", "green", "yellow", "purple"] as const;

export const MIN_MATCH = 5;               // 消えるまでに必要な個数
export const FALL_MS = 250;               // 落下アニメ時間(CSS .falling と合わせる)
export const TIME_LIMIT_MS = 30000;       // タイムリミット
export const RECOVER_MS_PER_PANEL = 500;  // パネル1枚消すごとの回復時間
export const SPEED_RAMP_MS = 30 * 60 * 1000; // 最高速度に到達するまでの時間
export const SPEED_RAMP_MAX = 15;          // 最大速度倍率
export const SPEED_STEP_MS = 5 * 1000;    // レベルアップ（速度アップ）までの時間

// チェイン・マイルストーン
export const MILESTONE_CHAIN_INTERVAL = 50; // 何チェインごとにオーバーレイ表示するか

// フェード時間の動的短縮
export const FADE_MS = 2350;       // 消えるまでの時間(初期値)
export const FADE_MS_MIN = 1000;   // 消えるまでの時間(最小値、chain=FADE_CHAIN_MAX以上)
export const FADE_CHAIN_STEP = 10; // 何チェインごとにフェード時間を短縮するか
export const FADE_CHAIN_MAX = 300; // フェード時間が最短(FADE_MS_MIN)に達するチェイン数

// ドラッグ表示
export const DRAG_SCALE = 1.12; // ドラッグ中パネルの拡大率

// タイムバーの色変化閾値(残り時間の割合)
export const TIME_BAR_MID_RATIO = 0.5; // この割合を下回ると黄色になる
export const TIME_BAR_LOW_RATIO = 0.2; // この割合を下回ると赤になる

// アニメーションループ
export const TICK_MAX_DT_MS = 100; // フレーム間隔の上限(タブ非表示からの復帰で時間が飛ぶのを防ぐ)

// 盤面初期化
export const BOARD_INIT_GUARD = 500; // 初期配置で5連結を解消するための最大試行回数

// サウンド: マッチ音(アルペジオ)
export const SOUND_MATCH_GAIN = 0.22;         // 音量
export const SOUND_MATCH_ATTACK_S = 0.01;     // アタック時間(秒)
export const SOUND_MATCH_DECAY_S = 0.22;      // ディケイ時間(秒)
export const SOUND_MATCH_DUR_S = 0.25;        // ノートの持続時間(秒)
export const SOUND_MATCH_NOTE_DELAY_S = 0.07; // アルペジオのノート間隔(秒)
export const SOUND_MATCH_PITCH_RISE = 0.30;   // 1ティアあたりの最大音程上昇率

// サウンド: 消失音(周波数スウィープ)
export const SOUND_VANISH_FREQ_HI = 880;  // スウィープ開始周波数(Hz)
export const SOUND_VANISH_FREQ_LO = 280;  // スウィープ終了周波数(Hz)
export const SOUND_VANISH_SWEEP_S = 0.18; // スウィープ時間(秒)
export const SOUND_VANISH_GAIN = 0.18;    // 音量
export const SOUND_VANISH_DUR_S = 0.20;   // 持続時間(秒)

export type Color = (typeof COLORS)[number];

export interface Panel {
  id: number;
  color: Color;
  fadingSince: number | null; // フェード開始時刻(performance.now)。null=通常
}
