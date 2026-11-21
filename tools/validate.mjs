import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from '../vendor/makefun-board.ts';
import { boardIssue, parseSnapshot } from '../lib/model.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'out');
const inputAt = process.argv.indexOf('--input');
const SNAPSHOT = inputAt !== -1 && process.argv[inputAt + 1]
  ? process.argv[inputAt + 1]
  : '/workspace/makefun/kits/token-radar-01/token-radar-01-kit/input/snapshot.json';

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}\n`);
}
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }

const snapshot = parseSnapshot(readFileSync(SNAPSHOT, 'utf8'));
const board = readJson(join(OUT, 'board.json'));
const rows = board.rows;
const issue = boardIssue(rows, snapshot);

check('board gate shape', issue === null, issue ?? `${rows.length} rows`);
check('all 758 protocols in the ledger', Object.values(board.ledger).reduce((s, n) => s + n, 0) === snapshot.protocols.length, JSON.stringify(board.ledger));
check('watchlist 40/40', snapshot.watchlist.every((s) => rows.some((r) => r.slug === s)), `${snapshot.watchlist.length}`);
check('farm_steps 3-12 of 20-600 chars', rows.every((r) => r.farm_steps.length >= 3 && r.farm_steps.length <= 12 && r.farm_steps.every((s) => s.trim().length >= 20 && s.trim().length <= 600)));
check('every row has a verdict and net', rows.every((r) => ['FARM', 'THIN', 'SKIP'].includes(r.verdict) && Number.isFinite(r.net_usd)));

const dash = join(OUT, 'dashboard');
const dashFiles = readdirSync(dash);
check('dashboard has index.html, app.css, app.js, z-data.js', ['index.html', 'app.css', 'app.js', 'z-data.js'].every((f) => dashFiles.includes(f)), dashFiles.join(', '));
const html = readFileSync(join(dash, 'index.html'), 'utf8');
const css = readFileSync(join(dash, 'app.css'), 'utf8');
const js = readFileSync(join(dash, 'app.js'), 'utf8');
const attrs = [...html.matchAll(/\s[\w:-]+\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => m[1] ?? m[2]).join('\n');
const imports = [...js.matchAll(/\b(?:import|export)\b[^;\n]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]).join('\n');
const url = /(?:https?:)?\/\//i;
check('no http(s) URL in HTML attributes', !url.test(attrs));
check('no http(s) URL in CSS', !/https?:\/\//i.test(css));
check('no http(s) URL in JS imports', !url.test(imports));
const srcBytes = [html, css, js].reduce((s, t) => s + Buffer.byteLength(t), 0);
check('dashboard source (html+css+js) under 64 KB', srcBytes <= 65536, `${srcBytes} bytes`);
check('no cream palette tokens', !/cream/i.test(css + html) && !/#(?:[fF][5-9A-Fa-f][eE][dD]|[fF][aA][fF][0-7]|[fF][5-9][eE][8-9dD])/i.test(css));

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
for (const f of shots) {
  const p = join(OUT, 'screenshots', f);
  const bytes = statSync(p).size;
  const dim = jpegSize(p);
  const long = Math.max(dim.width, dim.height);
  const short = Math.min(dim.width, dim.height);
  check(`${f}: at most 512 KiB (official cap)`, bytes <= 524288, `${bytes} bytes`);
  check(`${f}: lean for the size tie-break (under 220 KiB)`, bytes <= 220 * 1024, `${bytes} bytes`);
  check(`${f}: long side <= 1440, short side >= 800`, long <= 1440 && short >= 800, `${dim.width}x${dim.height}`);
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

