import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync, copyFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/tmp/pw-tools/node_modules/playwright-core/index.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'out');
const DASH = join(OUT, 'dashboard');
const SHOTS = join(ROOT, 'screenshots');
const TMP = '/tmp/radar-v2-shots';
mkdirSync(TMP, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
  const path = join(DASH, name.replace(/\.\./g, ''));
  if (name === 'favicon.ico') { res.writeHead(204); res.end(); return; }
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

async function capture(file, hash, ready) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (req) => { if (!/favicon/.test(req.url())) errors.push('fail ' + req.url()); });
  page.on('console', (msg) => { if (msg.type() === 'error' && !/favicon/.test(msg.text())) errors.push(msg.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html${hash}`, { waitUntil: 'load' });
  await page.waitForFunction(ready, { timeout: 8000 });
  await page.waitForTimeout(250);
  const path = join(SHOTS, file);
  const low = 300 * 1024, high = 350 * 1024, target = 325 * 1024;
  let best = { q: 92, size: 0, score: Infinity };
  for (const q of [70, 75, 80, 84, 88, 90, 92, 94, 96, 98, 100]) {
    const tmp = join(TMP, `${q}-${file}`);
    await page.screenshot({ path: tmp, type: 'jpeg', quality: q });
    const size = statSync(tmp).size;
    const inRange = size >= low && size <= high;
    const score = inRange ? Math.abs(size - target) : (size < low ? low - size + 100000 : size - high + 100000);
    if (score < best.score) best = { q, size, score, tmp };
  }
  copyFileSync(best.tmp, path);
  const size = statSync(path).size;
  const ticks = await page.evaluate(() => ({
    hash: location.hash,
    rows: document.querySelectorAll('#board-body tr').length,
    detail: document.getElementById('detail').classList.contains('open'),
    title: document.getElementById('board-title')?.textContent,
    ticks: [...document.querySelectorAll('#audit span')].map((el) => el.textContent),
    bad: [...document.querySelectorAll('#audit span.bad')].map((el) => el.textContent),
    steps: document.querySelectorAll('.timeline li').length,
    kpis: document.querySelectorAll('.kpi').length,
  }));
  console.log(`${file}: ${size} bytes (${(size / 1024).toFixed(1)} KiB), quality ${best.q}, ${JSON.stringify(ticks)}`);
  if (errors.length) console.log(`  page errors: ${errors.join(' | ')}`);
  await page.close();
  return { size, ticks, errors };
}

const boardReady = () => window.RADAR && document.querySelectorAll('#board-body tr').length > 0 && document.querySelectorAll('#audit span').length > 0 && document.querySelectorAll('.kpi').length === 3;
const detailReady = () => window.RADAR && document.getElementById('detail').classList.contains('open') && document.querySelectorAll('.timeline li').length > 0;

const r1 = await capture('1-board.jpg', '#board', boardReady);
const slug = await (async () => {
  // Prefer a watchlist FARM, else first FARM, else first watchlist
  const { chromium: _ } = {};
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/index.html#board`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.RADAR && window.RADAR.rows.length > 0);
  const s = await page.evaluate(() => {
    const rows = window.RADAR.rows;
    const farms = rows.filter((r) => r.verdict === 'FARM').sort((a, b) => b.net_per_hour - a.net_per_hour);
    const farmWatch = farms.find((r) => r.on_watchlist);
    return (farmWatch || farms[0] || rows.find((r) => r.on_watchlist) || rows[0]).slug;
  });
  await page.close();
  return s;
})();
console.log('detail slug', slug);
const r2 = await capture('2-detail.jpg', `#p/${slug}`, detailReady);
const r3 = await capture('3-filtered.jpg', '#filter/farm', boardReady);

await browser.close();
server.close();
if (r1.errors.length || r2.errors.length || r3.errors.length || r1.ticks.bad.length || r3.ticks.bad.length) {
  process.exitCode = 1;
}
