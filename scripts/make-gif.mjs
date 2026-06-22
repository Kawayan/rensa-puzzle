/**
 * 5秒サンプルプレイGIF生成スクリプト
 *
 * 必要な準備:
 *   npm run build                    # TypeScript をコンパイル
 *   npm install                      # playwright を含む devDependencies をインストール
 *   npx playwright install chromium  # Chromium をダウンロード
 *
 * GIF変換には ffmpeg が必要です:
 *   Windows: winget install Gyan.FFmpeg
 *   Mac:     brew install ffmpeg
 *
 * 実行:
 *   npm run gif
 *   npm run gif -- --seed=0x12345678   # seed 固定で完全再現
 *
 * 出力:
 *   scripts/out/sample.webm  録画動画
 *   scripts/out/sample.gif   GIF (ffmpeg がある場合)
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, rename, copyFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT    = join(__dirname, '..');
const OUT_DIR = join(__dirname, 'out');
const OUT_WEBM = join(OUT_DIR, 'sample.webm');
const OUT_GIF  = join(OUT_DIR, 'sample.gif');

const PORT     = 3099;
const VIEWPORT = { width: 560, height: 820 };
const GIF_FPS  = 15;

// --seed=0x... 引数をパース（省略時はランダム）
const seedArg = process.argv.find(a => /^--seed[=\s]/.test(a) || a === '--seed');
const fixedSeed = (() => {
  if (!seedArg) return null;
  const raw = seedArg.includes('=')
    ? seedArg.split('=')[1]
    : process.argv[process.argv.indexOf('--seed') + 1];
  const n = parseInt(raw, 16) >>> 0;
  return isNaN(n) ? null : n;
})();

// ------ 静的ファイルサーバー ------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css',
  '.js'  : 'application/javascript; charset=utf-8',
};

async function startServer() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const urlPath  = (req.url ?? '/').split('?')[0];
      const filePath = join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
      try {
        const data = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

// ------ ユーティリティ ------

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** ボード上の (row, col) セルの中心座標を返す */
function cellXY(boardBox, row, col, cellSize, gap) {
  return {
    x: boardBox.x + gap + col * (cellSize + gap) + cellSize / 2,
    y: boardBox.y + gap + row * (cellSize + gap) + cellSize / 2,
  };
}

/**
 * セルのリストを順にたどるドラッグ操作
 * path: { r, c }[] の配列
 * stepMs: 各セル間の待機時間（ms）
 */
async function drag(page, boardBox, cellSize, gap, path, stepMs = 120) {
  const c     = (r, col) => cellXY(boardBox, r, col, cellSize, gap);
  const start = c(path[0].r, path[0].c);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i < path.length; i++) {
    await sleep(stepMs);
    const pos = c(path[i].r, path[i].c);
    await page.mouse.move(pos.x, pos.y, { steps: 4 });
  }
  await sleep(80);
  await page.mouse.up();
}

// ------ メイン ------

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('■ サーバー起動中...');
  const server = await startServer();

  console.log('■ ブラウザ起動中...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport   : VIEWPORT,
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
  });
  const page = await context.newPage();

  // seed 固定の場合、ページ読み込み前に Math.random を差し替える
  if (fixedSeed !== null) {
    console.log(`  seed: 0x${fixedSeed.toString(16).toUpperCase().padStart(8, '0')} (固定)`);
    await page.addInitScript((seed) => {
      // xorshift32 で Math.random を置き換え → ゲームの seed 生成が決定的になる
      let s = seed;
      Math.random = () => {
        s ^= s << 13; s ^= s >> 17; s ^= s << 5;
        return (s >>> 0) / 0x100000000;
      };
    }, fixedSeed);
  }

  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('#board .panel');
  await sleep(700); // 初期描画を待つ

  // ボードの位置・セルサイズを取得
  const boardBox = await page.locator('#board').boundingBox();
  const panelBox = await page.locator('#board .panel').first().boundingBox();
  const cellSize = Math.round(panelBox.width);
  const gap      = 4;
  console.log(`  board pos=(${boardBox.x.toFixed(0)}, ${boardBox.y.toFixed(0)}) cell=${cellSize}px`);

  // ================================================================
  // ゲームプレイシナリオ (合計 ≈ 5.5 秒)
  //
  // resolveMatches() はドラッグ中にも呼ばれるため、長いスイープで
  // 同色 5 個以上の連結が生まれやすく、フェードアニメが映える。
  // ================================================================

  // Move 1: row=4 を左端から右端へ横断 (≈ 1.0s)
  console.log('  move 1: row=4 横断 →');
  await drag(page, boardBox, cellSize, gap, [
    { r: 4, c: 0 }, { r: 4, c: 1 }, { r: 4, c: 2 }, { r: 4, c: 3 },
    { r: 4, c: 4 }, { r: 4, c: 5 }, { r: 4, c: 6 }, { r: 4, c: 7 },
  ]);
  await sleep(550);

  // Move 2: col=2 を上端から下端へ縦断 (≈ 1.0s)
  console.log('  move 2: col=2 縦断 ↓');
  await drag(page, boardBox, cellSize, gap, [
    { r: 0, c: 2 }, { r: 1, c: 2 }, { r: 2, c: 2 }, { r: 3, c: 2 },
    { r: 4, c: 2 }, { r: 5, c: 2 }, { r: 6, c: 2 }, { r: 7, c: 2 },
  ]);
  await sleep(500);

  // Move 3: row=1 を右端から中央へ折り返し (≈ 0.6s)
  console.log('  move 3: row=1 右→中 ←');
  await drag(page, boardBox, cellSize, gap, [
    { r: 1, c: 7 }, { r: 1, c: 6 }, { r: 1, c: 5 },
    { r: 1, c: 4 }, { r: 1, c: 3 },
  ]);

  // フェード・落下アニメーションを見せる (≈ 1.8s)
  await sleep(1800);

  // ================================================================

  const video = page.video(); // context.close() 前に参照を取得
  await context.close();      // ← ここで動画ファイルが確定する
  await browser.close();
  server.close();

  const tmpPath = video ? await video.path() : null;
  if (!tmpPath) {
    console.error('❌ 動画の保存に失敗しました');
    process.exit(1);
  }
  await rename(tmpPath, OUT_WEBM);
  console.log(`■ 動画保存: ${OUT_WEBM}`);

  // ffmpeg で GIF に変換
  // palettegen + paletteuse フィルタで高品質な GIF を生成する
  console.log('■ GIF変換中...');
  const vf = [
    `fps=${GIF_FPS}`,
    `scale=${VIEWPORT.width}:-1:flags=lanczos`,
    'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
  ].join(',');

  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', OUT_WEBM, '-vf', vf, '-loop', '0', OUT_GIF],
    { stdio: 'inherit', shell: false },
  );

  if (result.status === 0) {
    // docs/ にもコピーして README から参照できるようにする
    const docsGif = join(ROOT, 'docs', 'sample.gif');
    mkdirSync(join(ROOT, 'docs'), { recursive: true });
    await copyFile(OUT_GIF, docsGif);
    console.log(`\n✓ GIF 保存: ${OUT_GIF}`);
    console.log(`✓ docs へコピー: ${docsGif}`);
  } else {
    console.log('');
    console.log('⚠ ffmpeg が見つかりません。インストール後に再実行してください:');
    console.log('  Windows: winget install Gyan.FFmpeg');
    console.log('  Mac:     brew install ffmpeg');
    console.log(`  動画は ${OUT_WEBM} に保存済みです。`);
  }
}

main().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
