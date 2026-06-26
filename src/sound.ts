// Web Audio API による効果音。
// AudioContext はこのモジュールに閉じ込め、必要なパラメータは引数で受け取る。

import {
  MILESTONE_CHAIN_INTERVAL,
  SOUND_MATCH_GAIN,
  SOUND_MATCH_ATTACK_S,
  SOUND_MATCH_DECAY_S,
  SOUND_MATCH_DUR_S,
  SOUND_MATCH_NOTE_DELAY_S,
  SOUND_MATCH_PITCH_RISE,
  SOUND_VANISH_FREQ_HI,
  SOUND_VANISH_FREQ_LO,
  SOUND_VANISH_SWEEP_S,
  SOUND_VANISH_GAIN,
  SOUND_VANISH_DUR_S,
} from "./constants.js";

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

// 5個以上つながった時: 明るいアルペジオ。
// MILESTONE_CHAIN_INTERVAL チェーンごとに和音と音色を切り替え、tier内は最大30%の音程上昇に抑える。
export function playMatchSound(chain: number): void {
  const ctx = getAudioCtx();
  const t = ctx.currentTime;

  const tier = Math.floor(chain / MILESTONE_CHAIN_INTERVAL);
  const withinTier = chain % MILESTONE_CHAIN_INTERVAL;
  const pitchMult = 1 + (withinTier / MILESTONE_CHAIN_INTERVAL) * SOUND_MATCH_PITCH_RISE;

  const tiers: { freqs: [number, number, number]; type: OscillatorType }[] = [
    { freqs: [523, 659, 784], type: "triangle" }, // C major  (やわらかい)
    { freqs: [349, 440, 523], type: "sine" },     // F major  (まろやか・低め)
    { freqs: [392, 494, 587], type: "triangle" }, // G major  (明るい)
    { freqs: [440, 554, 659], type: "sine" },     // A major  (きらびやか)
  ];
  const { freqs, type } = tiers[tier % tiers.length]!;

  freqs.forEach((hz, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = hz * pitchMult;
    const nd = i * SOUND_MATCH_NOTE_DELAY_S;
    gain.gain.setValueAtTime(0, t + nd);
    gain.gain.linearRampToValueAtTime(SOUND_MATCH_GAIN, t + nd + SOUND_MATCH_ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(0.001, t + nd + SOUND_MATCH_DECAY_S);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + nd);
    osc.stop(t + nd + SOUND_MATCH_DUR_S);
  });
}

// ゲームオーバー時: sounds/gameover.mp3 を再生する
export function playGameOverSound(): void {
  const audio = new Audio("sounds/gameover.mp3");
  void audio.play().catch(() => { /* 再生できない場合は無視 */ });
}

// パネル消失時: 高音から低音へのすっきりしたスウィープ
export function playVanishSound(): void {
  const ctx = getAudioCtx();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(SOUND_VANISH_FREQ_HI, t);
  osc.frequency.exponentialRampToValueAtTime(SOUND_VANISH_FREQ_LO, t + SOUND_VANISH_SWEEP_S);
  gain.gain.setValueAtTime(SOUND_VANISH_GAIN, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + SOUND_VANISH_SWEEP_S);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + SOUND_VANISH_DUR_S);
}
