import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from '../vendor/makefun-board.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'out');
const inputAt = process.argv.indexOf('--input');
const SNAPSHOT = inputAt !== -1 && process.argv[inputAt + 1]
  ? process.argv[inputAt + 1]
  : '/workspace/makefun/kits/radar-x/token-radar-01-kit/input/snapshot.json';

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}\n`);
}
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }

const snapshot = readJson(SNAPSHOT);
const board = readJson(join(OUT, 'board.json'));
const rows = board.rows;

check('board rows between 100 and 4000', rows.length >= 100 && rows.length <= 4000, `${rows.length} rows`);
const known = new Set(snapshot.protocols.map((p) => p.slug));
const slugs = rows.map((r) => r.slug);
check('slugs exist in snapshot', slugs.every((s) => known.has(s)));
check('slugs unique', new Set(slugs).size === slugs.length);
check('ranks are exactly 1..N', rows.every((r, i) => r.rank === i + 1));
const values = rows.map((r) => r.implied_value_usd);
check('implied values non-increasing', values.every((v, i) => i === 0 || v <= values[i - 1]));
check('implied values not all equal', new Set(values).size > 1, `${new Set(values).size} distinct`);
const watch = new Set(snapshot.watchlist);
check('all watchlist slugs covered', snapshot.watchlist.every((s) => slugs.includes(s)), `${snapshot.watchlist.length} expected`);
check('farm_steps shape', rows.every((r) => Array.isArray(r.farm_steps)
  && r.farm_steps.length >= 3 && r.farm_steps.length <= 12
  && r.farm_steps.every((s) => typeof s === 'string' && s.length >= 20 && s.length <= 600)));
check('tokens_trading has 30 ranked protocols', Array.isArray(board.tokens_trading) && board.tokens_trading.length === 30);

const dash = join(OUT, 'dashboard');
const dashFiles = readdirSync(dash);
check('dashboard has index.html, app.css, app.js', ['index.html', 'app.css', 'app.js'].every((f) => dashFiles.includes(f)));
const html = readFileSync(join(dash, 'index.html'), 'utf8');
const css = readFileSync(join(dash, 'app.css'), 'utf8');
const js = readFileSync(join(dash, 'app.js'), 'utf8');
const attrs = [...html.matchAll(/\s[\w:-]+\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
  .map((m) => m[1] ?? m[2]).join('\n');
const imports = [...js.matchAll(/\b(?:import|export)\b[^;\n]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)]
  .map((m) => m[1] ?? m[2]).join('\n');
const url = /(?:https?:)?\/\//i;
check('no http(s) URL in HTML attributes', !url.test(attrs));
check('no http(s) URL in CSS', !/https?:\/\//i.test(css));
check('no http(s) URL in JS imports', !url.test(imports));

function jpegSize(path) {
  const b = readFileSync(path);
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = b.readUInt16BE(i + 2);
    if (len < 2) break;
    i += 2 + len;
  }
  return { width: 0, height: 0 };
}
const shots = readdirSync(join(OUT, 'screenshots')).filter((f) => /\.(?:jpg|jpeg|png)$/i.test(f)).sort();
check('3-4 screenshots', shots.length >= 3 && shots.length <= 4, shots.join(', '));
const sizes = shots.map((f) => {
  const p = join(OUT, 'screenshots', f);
  const bytes = statSync(p).size;
  const dim = jpegSize(p);
  return { f, bytes, ...dim };
});
for (const s of sizes) {
  check(`${s.f}: 300-350 KB`, s.bytes >= 300 * 1024 && s.bytes <= 350 * 1024, `${s.bytes} bytes`);
  check(`${s.f}: 800-1440 px sides`, s.width >= 800 && s.width <= 1440 && s.height >= 800 && s.height <= 1440, `${s.width}x${s.height}`);
}

const fresh = buildDossier(OUT, {
  text_max_bytes: 65536,
  screenshots: { max: 4, max_bytes: 524288 },
  dashboard: { max_files: 400, max_bytes: 4194304 },
});
const stored = readFileSync(join(OUT, 'dossier.json'));
check('dossier.json equals fresh buildDossier bytes', Buffer.from(fresh).equals(stored), `${stored.length} bytes`);

const failed = checks.filter((c) => !c.ok);
process.stdout.write(`\n${checks.length - failed.length}/${checks.length} checks passed\n`);
if (failed.length) process.exitCode = 1;
