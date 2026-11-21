import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { buildBoard, parseSnapshot } from './lib/radar.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));

function option(name: string): string | null {
  const flag = `--${name}`;
  const args = process.argv.slice(2);
  const at = args.indexOf(flag);
  if (at === -1) return null;
  const value = args[at + 1];
  return value && !value.startsWith('--') ? value : null;
}

function absolute(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function inputFile(): string {
  const given = option('input') ?? '/input';
  const path = absolute(given);
  if (existsSync(path) && statSync(path).isDirectory()) return join(path, 'snapshot.json');
  return path;
}

function outputDir(): string {
  return absolute(option('output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
}

function copyTree(from: string, to: string, excludeName: string | null = null): void {
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  if (!existsSync(from)) return;
  for (const entry of readdirSync(from).sort()) {
    if (excludeName !== null && entry === excludeName) continue;
    const src = join(from, entry);
    const dst = join(to, entry);
    if (statSync(src).isDirectory()) copyTree(src, dst);
    else cpSync(src, dst);
  }
}

const snapshotPath = inputFile();
const out = outputDir();
const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const board = buildBoard(snapshot);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify(board, null, 2)}\n`);

copyTree(join(ROOT, 'dashboard'), join(out, 'dashboard'), 'data.js');
writeFileSync(join(out, 'dashboard', 'data.js'), `window.RADAR = ${JSON.stringify(board)};\n`);

copyTree(join(ROOT, 'screenshots'), join(out, 'screenshots'));

const dossier = buildDossier(out, {
  text_max_bytes: 65536,
  screenshots: { max: 4, max_bytes: 524288 },
  dashboard: { max_files: 400, max_bytes: 4194304 },
});
writeFileSync(join(out, 'dossier.json'), dossier);

process.stdout.write(
  `Prelaunch Radar: ${board.rows.length} rows, ${board.tokens_trading.length} trading protocols, snapshot ${board.as_of}\n`
  + `input: ${snapshotPath}\noutput: ${out}\n`,
);
