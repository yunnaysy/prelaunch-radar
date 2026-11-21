import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
// Additive hurdle: net reward must beat T-bill plus hours × $25.
// Modelled depositor drop divides by protocol-wide TVL since the snapshot gives no per-chain split.
// Farm plans use a snapshot-listed deployment instead of hunting for the cheapest listed chain.
// v3: additive farm hurdle, held-out residual intervals, editorial dashboard.
// v4 keeps a name-length control out of the size curve even when a small sample flatters it.
// The integrity strip refits years listed from the snapshot day so implied values match board.json to the dollar.
// Protocol name length is a placebo covariate and is never allowed to set the valuation slope.
// The integrity strip derives ages from the snapshot date itself, preventing a calendar drift between the browser refit and board.json.
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { boardIssue, buildRadar, parseSnapshot } from './lib/model.ts';

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

function copyTree(from: string, to: string, skip: Set<string>): void {
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  if (!existsSync(from)) return;
  for (const entry of readdirSync(from).sort()) {
    if (skip.has(entry) || entry.startsWith('.')) continue;
    const src = join(from, entry);
    const dst = join(to, entry);
    if (statSync(src).isDirectory()) copyTree(src, dst, skip);
    else cpSync(src, dst);
  }
}

const snapshotPath = inputFile();
const out = outputDir();
const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, payload } = buildRadar(snapshot);
const issue = boardIssue(board.rows, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: board refused: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board.rows, as_of: board.as_of, source: board.source, floor_usd: board.floor_usd, evidence: board.evidence, ledger: board.ledger, schema: board.schema })}\n`);

copyTree(join(ROOT, 'dashboard'), join(out, 'dashboard'), new Set(['data.js', 'z-data.js']));
writeFileSync(join(out, 'dashboard', 'z-data.js'), `window.RADAR = ${JSON.stringify(payload)};\n`);

copyTree(join(ROOT, 'screenshots'), join(out, 'screenshots'), new Set());

const dossier = buildDossier(out, {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
});
writeFileSync(join(out, 'dossier.json'), dossier);

const ev = board.evidence;
process.stdout.write(
  `Prelaunch Radar: ${board.rows.length} rows, watch ${ev.integrity.watch_covered}/${snapshot.watchlist.length}, ledger ${ev.integrity.ledger_total}\n` +
  `value typ miss LOO flat ${ev.value.typ_miss.flat_loo} / size ${ev.value.typ_miss.size_loo}; WF flat ${ev.value.typ_miss.flat_wf} / size ${ev.value.typ_miss.size_wf}\n` +
  `odds Brier 10-fold ${ev.odds.brier.model_10f} (base ${ev.odds.brier.base}); WF ${ev.odds.brier.model_wf} (base ${ev.odds.brier.base_wf})\n` +
  `farm ${ev.farm.farm} thin ${ev.farm.thin} skip ${ev.farm.skip}; checksum ${ev.integrity.checksum}\n` +
  `input: ${snapshotPath}\noutput: ${out}\n`,
);
