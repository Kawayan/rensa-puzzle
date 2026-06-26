/**
 * bgm/ フォルダ内の mp3 ファイル一覧を bgm/list.json に書き出すスクリプト。
 *
 * 静的サイトのためブラウザから直接フォルダを列挙できない。ビルド時にこの
 * マニフェストを生成し、実行時に fetch して BGM 選択コンボボックスを構築する。
 *
 * 実行: npm run bgm-list  (npm run build からも自動実行される)
 */

import { readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BGM_DIR = join(__dirname, "..", "bgm");
const OUT = join(BGM_DIR, "list.json");

const files = readdirSync(BGM_DIR)
  .filter((f) => f.toLowerCase().endsWith(".mp3"))
  .sort();

writeFileSync(OUT, JSON.stringify(files, null, 2) + "\n");
console.log(`bgm/list.json を生成しました (${files.length} 件): ${files.join(", ")}`);
