import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/tmp/pw-tools/node_modules/playwright-core/index.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'out');
const DASH = join(OUT, 'dashboard');
const SHOTS = join(ROOT, 'screenshots');
const board = JSON.parse(readFileSync(join(OUT, 'board.json'), 'utf8'));
const watchSlug = board.rows.find((r) => r.on_watchlist).slug;

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
  const path = join(DASH, name.replace(/\.\./g, ''));
  try {
    const data = readFileSync(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

async function capture(file, hash, target = 335 * 1024) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/index.html${hash}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.RADAR && document.querySelectorAll('#board-body tr').length > 0);
  await page.waitForTimeout(180);
  const path = join(SHOTS, file);
  const low = 300 * 1024, high = 350 * 1024;
  let best = { q: 99, size: 0, score: Infinity };
  for (const q of [96, 97, 98, 99, 100]) {
    await page.screenshot({ path: `/tmp/opencode/quality-${file}`, type: 'jpeg', quality: q });
    const size = statSync(`/tmp/opencode/quality-${file}`).size;
    const inRange = size >= low && size <= high;
    const score = inRange ? Math.abs(size - (low + high) / 2) : (size < low ? low - size + 100000 : size - high + 100000);
    if (score < best.score) best = { q, size, score };
  }
  await page.screenshot({ path, type: 'jpeg', quality: best.q });
  const size = statSync(path).size;
  const state = await page.evaluate(() => ({
    hash: location.hash,
    rows: document.querySelectorAll('#board-body tr').length,
    detail: document.getElementById('detail').classList.contains('open'),
    activePreset: document.querySelector('.preset.active')?.textContent ?? null,
  }));
  console.log(`${file}: ${size} bytes (${(size / 1024).toFixed(1)} KiB), quality ${best.q}, ${JSON.stringify(state)}`);
  if (errors.length) console.log(`  page errors: ${errors.join(' | ')}`);
  await page.close();
}

await capture('1-board.jpg', '#board');
await capture('2-detail.jpg', `#detail/${watchSlug}`);
await capture('3-filtered.jpg', '#filter/watchlist-growth');
await browser.close();
server.close();
