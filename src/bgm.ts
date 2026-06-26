// BGM 再生の管理。
// bgm/list.json (ビルド時に scripts/gen-bgm-list.mjs が生成) を読み込み、
// 選択コンボボックスを構築する。再生中の Audio はこのモジュールに閉じ込める。

const BGM_DIR = "bgm";
const LIST_URL = `${BGM_DIR}/list.json`;
const PREF_KEY = "puzzle-bgm"; // 前回選択した曲を記憶する localStorage キー
const VOLUME = 0.4;

let audio: HTMLAudioElement | null = null;

// 拡張子を除いた表示名(例: "bgm1.mp3" → "bgm1")
function labelOf(file: string): string {
  return file.replace(/\.mp3$/i, "");
}

// list.json を読み込んでコンボボックスを構築する。
// 先頭に「なし」(空 value)を入れ、前回の選択があれば復元する。
export async function populateBgmSelect(select: HTMLSelectElement): Promise<void> {
  select.innerHTML = "";

  const none = document.createElement("option");
  none.value = "";
  none.textContent = "なし";
  select.appendChild(none);

  let files: string[] = [];
  try {
    const res = await fetch(LIST_URL, { cache: "no-cache" });
    if (res.ok) {
      const data = (await res.json()) as unknown;
      if (Array.isArray(data)) files = data.filter((f): f is string => typeof f === "string");
    }
  } catch {
    /* list.json が無い場合は「なし」のみ */
  }

  for (const file of files) {
    const opt = document.createElement("option");
    opt.value = file;
    opt.textContent = labelOf(file);
    select.appendChild(opt);
  }

  const saved = localStorage.getItem(PREF_KEY);
  if (saved !== null && files.includes(saved)) select.value = saved;

  // 選択を localStorage に記憶する
  select.addEventListener("change", () => {
    try {
      localStorage.setItem(PREF_KEY, select.value);
    } catch {
      /* storage unavailable */
    }
  });
}

// 指定ファイルをループ再生する。空文字なら再生しない(=「なし」)。
export function playBgm(file: string): void {
  stopBgm();
  if (!file) return;
  audio = new Audio(`${BGM_DIR}/${file}`);
  audio.loop = true;
  audio.volume = VOLUME;
  void audio.play().catch(() => {
    /* 自動再生がブロックされた場合は無視 */
  });
}

export function stopBgm(): void {
  if (audio) {
    audio.pause();
    audio = null;
  }
}
