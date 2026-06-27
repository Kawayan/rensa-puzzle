// HTML 上の各要素への参照をまとめたモジュール。
// このモジュールは他に依存しない。

export const boardEl = document.getElementById("board") as HTMLDivElement;
export const scoreEl = document.getElementById("score") as HTMLDivElement;
export const chainEl = document.getElementById("chain") as HTMLDivElement;
export const maxchainEl = document.getElementById("maxchain") as HTMLDivElement;
export const levelEl = document.getElementById("level") as HTMLDivElement;
export const seedDisplayEl = document.getElementById("seed-display") as HTMLSpanElement;
export const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
export const versionEl = document.getElementById("version") as HTMLElement;
export const previewEl = document.getElementById("preview") as HTMLDivElement;
export const timeBarFillEl = document.getElementById("timebar-fill") as HTMLDivElement;
export const timeBarTextEl = document.getElementById("timebar-text") as HTMLSpanElement;
export const gameOverEl = document.getElementById("gameover") as HTMLDivElement;
export const finalScoreEl = document.getElementById("finalScore") as HTMLSpanElement;
export const scoreListEl = document.getElementById("scoreList") as HTMLOListElement;
export const restartBtn = document.getElementById("restartBtn") as HTMLButtonElement;
export const chainMilestoneEl = document.getElementById("chain-milestone") as HTMLDivElement;
export const startscreenEl = document.getElementById("startscreen") as HTMLDivElement;
export const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
export const bgmSelectEl = document.getElementById("bgm-select") as HTMLSelectElement;
export const bgmVolumeEl = document.getElementById("bgm-volume") as HTMLInputElement;
export const bgmVolumeValueEl = document.getElementById("bgm-volume-value") as HTMLSpanElement;
export const playtimeEl = document.getElementById("playtime") as HTMLDivElement;
