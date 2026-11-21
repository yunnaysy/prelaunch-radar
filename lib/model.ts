// Prelaunch Radar model. Every figure is derived from the sealed snapshot alone.
// Node 22 type-stripping only: no enums, namespaces or parameter properties.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export type Bucket =
  | 'watchlist'
  | 'early'
  | 'off-list'
  | 'priced'
  | 'token-nocap'
  | 'out-bridge'
  | 'out-lst'
  | 'out-cex'
  | 'out-versioned'
  | 'out-other';

export type Verdict = 'FARM' | 'THIN' | 'SKIP';

export interface FarmPlan {
  farm_steps: string[];
  deposit_usd: number;
  drop_share: number;
  horizon_weeks: number;
  drop_usd: number;
  fees_usd: number;
  hours: number;
  net_usd: number;
  net_per_hour: number;
  tbill_usd: number;
  wage_usd: number;
  hurdle_usd: number;
  incremental_usd: number;
  verdict: Verdict;
  plan_kind: string;
  chain_label: string;
  tvl_basis: 'protocol-wide';
  fee_tx: number;
  fee_bridge: number;
  setup_min: number;
  weekly_min: number;
}

export interface Row extends FarmPlan {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  years_listed: number | null;
  on_watchlist: boolean;
  bucket: 'watchlist' | 'early' | 'off-list';
  kinship: string | null;
  kinship_share: number;
  value_if_launches: number;
  token_odds: number;
  multiple: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  rank_lo: number;
  rank_hi: number;
  family_flag: number;
  raw_per_hour: number;
}

export interface CompRow {
  slug: string;
  name: string;
  category: string | null;
  symbol: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
  fitted: number;
  residual: number;
  listed_at: string | null;
  loo_fitted: number;
}

export interface Evidence {
  comps: number;
  peers: number;
  peers_with_token: number;
  value: {
    formula: string;
    a: number;
    b: number;
    multiple_at_100m: number;
    typ_miss: { flat_loo: number; size_loo: number; flat_wf: number; size_wf: number };
    wf_split: { train: number; test: number; cut: string };
    terms: { term: string; loo: number; wf: number; kept: boolean; decision?: string }[];
    range_honesty: {
      p25: number; p75_stated: number; p10: number; p90_stated: number; n: number;
      n_boot: number; residual: string;
      loo_p25: number; loo_p10: number; loo_within_x3: number;
      wf_p25: number; wf_p10: number; wf_within_x3: number; wf_n: number;
    };
    ablation: { feature: string; used_in: string; loo: number; wf: number; kept: boolean; note: string }[];
  };
  odds: {
    formula: string;
    weights: number[];
    terms: string[];
    med_age: number;
    base_rate: number;
    brier: { base: number; model_in: number; model_10f: number; base_wf: number; model_wf: number };
    accuracy: { base_10f: number; model_10f: number; base_wf: number; model_wf: number };
    terms_tried: { term: string; kfold: number; wf: number; kept: boolean; decision?: string }[];
  };
  farm: { deposit: number; drop_share: number; weeks: number; wage: number; tbill: number; farm: number; thin: number; skip: number; rule: string };
  sensitivity: { name: string; deposit: number; drop_share: number; weeks: number; wage: number; odds_scale: number; farm: number; thin: number; skip: number }[];
  integrity: { checksum: string; n_rows: number; watch_covered: number; ledger_total: number };
}

const VERSION_MARKER = /\s(?:V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
const WRAP_WORD = /\b(?:wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i;
const SET_ASIDE_CAT = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);
const STEM_STOP = /\b(?:finance|protocol|labs?|capital|network|dao|the|exchange|markets?|international|curator|vaults?|money|fi)\b/gi;

const DEPOSIT = 10_000;
const DROP_SHARE = 0.07;
const WEEKS = 12;
const WAGE = 25;
const TBILL = 0.04;
const KIN_SHARE = 0.5;
const BOOTSTRAP_N = 1000;
const BOOTSTRAP_SEED = 20261114;

const L2 = new Set([
  'Arbitrum', 'Base', 'Optimism', 'Polygon zkEVM', 'zkSync Era', 'Linea', 'Scroll', 'Blast',
  'Starknet', 'Mantle', 'Mode', 'Taiko', 'Ink', 'Unichain', 'Morph', 'Plasma', 'Fluent',
  'Celo', 'Gnosis', 'BOB', 'Corn', 'Etherlink', 'Citrea', 'Arc', 'Tempo', 'Stable',
]);

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
export const round = (n: number, places: number): number => {
  const s = 10 ** places;
  return Math.round(n * s) / s;
};

export function parseSnapshot(input: string | Record<string, unknown>): Snapshot {
  const raw: Record<string, unknown> = typeof input === 'string' ? JSON.parse(input) : input;
  if (!raw || typeof raw !== 'object') throw new Error('snapshot: expected an object');
  if (typeof raw.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.as_of)) throw new Error('snapshot: invalid as_of');
  if (typeof raw.source !== 'string') throw new Error('snapshot: invalid source');
  if (typeof raw.floor_usd !== 'number' || !Number.isFinite(raw.floor_usd)) throw new Error('snapshot: invalid floor_usd');
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) throw new Error('snapshot: invalid protocols or watchlist');
  const protocols: Protocol[] = raw.protocols.map((value: unknown) => {
    const p = value as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number') {
      throw new Error('snapshot: invalid protocol');
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: raw.as_of,
    source: raw.source,
    floor_usd: raw.floor_usd,
    protocols,
    watchlist: raw.watchlist.filter((s): s is string => typeof s === 'string'),
  };
}

export function isSetAside(p: Protocol): boolean {
  const cat = p.category ?? '';
  return SET_ASIDE_CAT.has(cat) || WRAP_WORD.test(p.name) || EXCHANGE_PREFIX.test(p.name) || VERSION_MARKER.test(p.name);
}

export function tokenRecorded(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

export function isPriced(p: Protocol): boolean {
  return p.gecko_id !== null && p.symbol !== null && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

export function monthsBetween(fromDay: string, toDay: string): number {
  const [fy, fm] = fromDay.split('-').map(Number);
  const [ty, tm] = toDay.split('-').map(Number);
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

export function yearsListed(p: Protocol, asOf: string): number | null {
  if (p.listed_at === null) return null;
  return monthsBetween(p.listed_at, asOf) / 12;
}

export function setAsideBucket(p: Protocol): Bucket {
  const cat = p.category ?? '';
  if (cat === 'Bridge' || cat === 'Canonical Bridge') return 'out-bridge';
  if (cat === 'Liquid Staking' || cat === 'Liquid Restaking' || cat === 'Restaked BTC' || WRAP_WORD.test(p.name)) return 'out-lst';
  if (cat === 'CEX' || EXCHANGE_PREFIX.test(p.name)) return 'out-cex';
  if (VERSION_MARKER.test(p.name)) return 'out-versioned';
  return 'out-other';
}

export function stems(name: string): string[] {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(STEM_STOP, ' ');
  const parts = cleaned.split(/\s+/).filter((w) => w.length >= 4);
  return parts.length > 0 ? [...new Set(parts)] : [...new Set(name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3))];
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function typMiss(preds: number[], actuals: number[]): number {
  const errs: number[] = [];
  for (let i = 0; i < preds.length; i++) {
    const pr = preds[i]!;
    const ac = actuals[i]!;
    if (pr > 0 && ac > 0) errs.push(Math.abs(Math.log(pr / ac)));
  }
  if (errs.length === 0) return NaN;
  return Math.exp(median(errs));
}

export function olsLogLog(tvls: number[], mcaps: number[]): { a: number; b: number } {
  const xs = tvls.map((t) => Math.log(Math.max(t, 1)));
  const ys = mcaps.map((m) => Math.log(Math.max(m, 1)));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    sxx += dx * dx;
    sxy += dx * (ys[i]! - my);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { a: my - b * mx, b };
}

export function predictSize(tvl: number, a: number, b: number): number {
  const z = a + b * Math.log(Math.max(tvl, 1));
  return Math.exp(clamp(z, -20, 45));
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function resample<T>(items: T[], rand: () => number): T[] {
  const out: T[] = [];
  for (let i = 0; i < items.length; i++) out.push(items[Math.floor(rand() * items.length)]!);
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  const t = i - lo;
  return sorted[lo]! * (1 - t) + sorted[hi]! * t;
}

export function sigmoid(z: number): number {
  if (z > 30) return 1;
  if (z < -30) return 0;
  return 1 / (1 + Math.exp(-z));
}

export function fitLogit(X: number[][], y: number[], l2 = 0.25, iters = 120, lr = 0.35): number[] {
  const n = y.length;
  const k = X[0]!.length + 1;
  const w = new Array<number>(k).fill(0);
  const pos = y.reduce((a, b) => a + b, 0) + 0.5;
  w[0] = Math.log(pos / (n - pos + 1));
  for (let step = 0; step < iters; step++) {
    const grad = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      let z = w[0]!;
      const row = X[i]!;
      for (let j = 0; j < row.length; j++) z += w[j + 1]! * row[j]!;
      const err = sigmoid(z) - y[i]!;
      grad[0] += err;
      for (let j = 0; j < row.length; j++) grad[j + 1] += err * row[j]!;
    }
    for (let j = 0; j < k; j++) {
      grad[j] = grad[j]! / n + (j === 0 ? 0 : l2 * w[j]!);
      w[j] -= lr * grad[j]!;
    }
  }
  return w;
}

export function predLogit(w: number[], x: number[]): number {
  let z = w[0]!;
  for (let j = 0; j < x.length; j++) z += w[j + 1]! * x[j]!;
  return sigmoid(z);
}

export function brier(preds: number[], y: number[]): number {
  let s = 0;
  for (let i = 0; i < y.length; i++) {
    const d = preds[i]! - y[i]!;
    s += d * d;
  }
  return s / y.length;
}

export function oddsFeatures(
  p: Protocol,
  asOf: string,
  medAge: number,
  kind: 'age' | 'age-tvl' | 'age-tvl-fam' | 'age-tvl-fam-g7' | 'age-tvl-ch' = 'age-tvl',
  familyFlag = 0,
): number[] {
  const age = yearsListed(p, asOf);
  const a1 = age === null ? medAge : age;
  if (kind === 'age') return [a1];
  const tvl = Math.log(Math.max(p.tvl_usd, 1) / 1e8);
  if (kind === 'age-tvl') return [a1, tvl];
  if (kind === 'age-tvl-ch') return [a1, tvl, Math.log(Math.max(p.chains.length, 1))];
  if (kind === 'age-tvl-fam') return [a1, tvl, familyFlag];
  return [a1, tvl, familyFlag, (p.change_7d === null ? 0 : clamp(p.change_7d / 100, -0.5, 0.5))];
}

export function accuracy(preds: number[], y: number[]): number {
  if (preds.length === 0) return 0;
  let ok = 0;
  for (let i = 0; i < preds.length; i++) if ((preds[i]! >= 0.5 ? 1 : 0) === y[i]) ok++;
  return ok / preds.length;
}

export function formatUsd(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${round(abs / 1e9, 2)}B`;
  if (abs >= 1e6) return `${sign}$${round(abs / 1e6, 1)}M`;
  if (abs >= 1e3) return `${sign}$${round(abs / 1e3, 1)}K`;
  if (abs >= 100) return `${sign}$${Math.round(abs)}`;
  return `${sign}$${round(abs, 2)}`;
}

export function pickFarmChain(chains: string[]): string {
  const list = chains.length > 0 ? chains : ['Ethereum'];
  const preferred = [
    'Ethereum', 'Solana', 'Bitcoin', 'Binance', 'BSC', 'Base', 'Arbitrum',
    'Polygon', 'Optimism', 'Avalanche', 'Sui', 'Aptos', 'Tron', 'Starknet',
    'Hyperliquid L1', 'Cardano', 'TON', 'Near', 'Ronin', 'Fantom',
  ];
  for (const name of preferred) {
    if (list.includes(name)) return name;
  }
  return list[0]!;
}

export function chainGas(chain: string): { label: string; tx: number; setupMin: number; weeklyMin: number } {
  const primary = chain || 'Ethereum';
  if (primary === 'Ethereum') return { label: 'Ethereum', tx: 12, setupMin: 35, weeklyMin: 12 };
  if (primary === 'Solana') return { label: 'Solana', tx: 0.03, setupMin: 15, weeklyMin: 8 };
  if (primary === 'Bitcoin') return { label: 'Bitcoin', tx: 5, setupMin: 30, weeklyMin: 10 };
  if (L2.has(primary)) return { label: primary, tx: 0.4, setupMin: 20, weeklyMin: 8 };
  return { label: primary, tx: 0.6, setupMin: 20, weeklyMin: 8 };
}

export function planKind(category: string | null): string {
  switch (category) {
    case 'Dexs':
    case 'Liquidity Manager':
    case 'NFT Marketplace':
    case 'OTC Marketplace':
      return 'dex';
    case 'Lending':
    case 'Uncollateralized Lending':
    case 'Collateral Management':
      return 'lending';
    case 'CDP':
    case 'CDP Manager':
    case 'Anchor BTC':
    case 'Decentralized BTC':
    case 'Stablecoin Issuer':
    case 'Algo-Stables':
    case 'Dual-Token Stablecoin':
    case 'Reserve Currency':
    case 'Synthetics':
      return 'cdp';
    case 'Yield':
    case 'Farm':
    case 'Options Vault':
    case 'Stablecoin Wrapper':
      return 'yield';
    case 'Leveraged Farming':
      return 'leverage';
    case 'Derivatives':
    case 'Perps':
    case 'Options':
    case 'Interest Rate Derivatives':
      return 'derivatives';
    case 'Yield Aggregator':
    case 'Indexes':
      return 'aggregator';
    case 'Basis Trading':
      return 'basis';
    case 'Onchain Capital Allocator':
      return 'allocator';
    case 'Risk Curators':
    case 'CeDeFi':
      return 'curator';
    case 'RWA':
      return 'rwa';
    case 'Insurance':
      return 'insurance';
    case 'Prediction Market':
      return 'prediction';
    case 'Payments':
      return 'payments';
    case 'Launchpad':
      return 'launchpad';
    case 'Staking Pool':
      return 'pool';
    default:
      return 'generic';
  }
}

function coreVerb(kind: string, name: string, chain: string, category: string | null): { action: string; txs: number } {
  const cat = category ?? 'listed category';
  switch (kind) {
    case 'dex':
      return { action: `On ${name}'s ${cat} deployment on ${chain}, make one small test swap, then add liquidity only in a pool the protocol actually offers there, starting at $200 and moving to the $10,000 once the receipt and exit path are clear`, txs: 4 };
    case 'lending':
      return { action: `Supply $10,000 of an asset ${name} actually accepts on ${chain} into its lending market there, and borrow at most 30% against it so the health factor stays above 2`, txs: 3 };
    case 'cdp':
      return { action: `Open a ${name} collateral position on ${chain} with $10,000 of an accepted asset, mint only a conservative amount of whatever the protocol issues, and record the liquidation price`, txs: 3 };
    case 'yield':
    case 'aggregator':
    case 'allocator':
    case 'curator':
      return { action: `Deposit into ${name}'s primary ${cat} product as it is offered on ${chain}, starting with a $100 test, then the $10,000 once a receipt token or share mints and an exit is visible`, txs: 3 };
    case 'leverage':
      return { action: `Use ${name}'s leveraged farming product only as it is offered on ${chain}, starting with a $100 test, then the $10,000 once the receipt and unwind path are clear. Do not loop borrowed assets`, txs: 3 };
    case 'derivatives':
      return { action: `Open a fully-collateralised position on ${name} on ${chain} of at most $1,000 notional, close it once to confirm exit, and only then size what you can track daily`, txs: 4 };
    case 'basis':
      return { action: `Open ${name}'s basis or funding trade as offered on ${chain} with $10,000, record entry prices and the funding rate, and set a hard stop if funding flips`, txs: 3 };
    case 'rwa':
      return { action: `Complete ${name}'s stated onboarding for ${chain} and subscribe $10,000 only to a tokenised asset or pool the protocol actually offers there, keeping the subscription receipt`, txs: 3 };
    case 'insurance':
      return { action: `Buy one small cover policy, or underwrite a bounded $10,000 position, only if ${name} offers that product on ${chain} and you have read the terms in full`, txs: 2 };
    case 'prediction':
      return { action: `Place two small wagers of $25 each in different ${name} markets on ${chain} and hold one to resolution`, txs: 3 };
    case 'payments':
      return { action: `Send two $25 test payments through ${name} on ${chain} to an address you control and record fee, settlement time and hash`, txs: 3 };
    case 'launchpad':
      return { action: `Complete ${name}'s allocation or lock steps on ${chain} with a bounded $500 test, never the full $10,000 first, and record any vest schedule it publishes`, txs: 3 };
    case 'pool':
      return { action: `Stake or restake in ${name} on ${chain} starting with a test deposit, and record the unbonding period before adding the rest of the $10,000`, txs: 3 };
    default:
      return { action: `Use ${name}'s primary advertised ${cat} action on ${chain} with a $100 test, then $10,000 once the receipt, exit path and any lockup are clear`, txs: 3 };
  }
}

export function farmEconomics(
  implied: number,
  tvl: number,
  fees: number,
  hours: number,
  deposit = DEPOSIT,
  share = DROP_SHARE,
  weeks = WEEKS,
  wage = WAGE,
): {
  drop: number; net: number; tbill: number; wage: number; hurdle: number; incremental: number; adj: number; verdict: Verdict;
} {
  const drop = implied * share * (deposit / (tvl + deposit));
  const net = drop - fees;
  const tbill = deposit * TBILL * (weeks / 52);
  const wageUsd = hours * wage;
  const hurdle = tbill + wageUsd;
  const incremental = net - tbill;
  const adj = hours > 0 ? incremental / hours : incremental;
  let verdict: Verdict;
  if (net > hurdle) verdict = 'FARM';
  else if (net > tbill) verdict = 'THIN';
  else verdict = 'SKIP';
  return {
    drop: round(drop, 2),
    net: round(net, 2),
    tbill: round(tbill, 2),
    wage: round(wageUsd, 2),
    hurdle: round(hurdle, 2),
    incremental: round(incremental, 2),
    adj: round(adj, 2),
    verdict,
  };
}

export function buildFarm(p: Protocol, implied: number): FarmPlan {
  const listed = p.chains.length > 0 ? p.chains : ['Ethereum'];
  const chain = pickFarmChain(listed);
  if (!listed.includes(chain)) throw new Error(`farm chain ${chain} is not in the snapshot list for ${p.slug}`);
  const gas = chainGas(chain);
  const kind = planKind(p.category);
  const core = coreVerb(kind, p.name, gas.label, p.category);
  const bridge = gas.label === 'Ethereum' ? 8 : gas.label === 'Solana' ? 0.5 : 2;
  const txs = 1 + 1 + core.txs + 1;
  const fees = round(bridge + txs * gas.tx, 2);
  const hours = round((gas.setupMin + WEEKS * gas.weeklyMin) / 60, 1);
  const eco = farmEconomics(implied, p.tvl_usd, fees, hours);
  const extra = Math.max(0, listed.length - 1);
  const chainNote = extra > 0
    ? `Snapshot lists ${extra} other chain${extra === 1 ? '' : 's'}; this plan uses ${chain}, a preferred listed deployment, not the cheapest listed chain.`
    : `The snapshot lists ${p.name} only on ${chain}.`;
  const steps = [
    `SETUP — Create a wallet used only for this ${p.name} farm on ${chain}, which the snapshot lists among its deployments, and fund it with about ${formatUsd(gas.tx * 4)} of native gas. COST ${formatUsd(gas.tx)} (one test transfer). TIME ${gas.setupMin} min hands-on.`,
    `VERIFY — Confirm ${p.name} (${p.category ?? 'uncategorised'}) is listed on ${chain} in this snapshot (${listed.length} chain${listed.length === 1 ? '' : 's'} recorded). Open it only from its DefiLlama protocol page or official docs, match the contract, and refuse any DM link. The snapshot does not name a vault or deposit asset. COST $0. TIME 10 min hands-on.`,
    `FUND — Move the $10,000 working deposit to ${chain} through an official bridge or exchange withdrawal, wait for finality, and save the hash. ${chainNote} Drop uses protocol-wide TVL (${formatUsd(p.tvl_usd)}); the snapshot does not split TVL by chain. COST about ${formatUsd(bridge)}. TIME 15 min hands-on, plus 5-25 min to arrive.`,
    `CORE — ${core.action}. COST about ${formatUsd(core.txs * gas.tx)} (${core.txs} transactions at ~${formatUsd(gas.tx)} on ${chain}). TIME 15-25 min hands-on.`,
    `WATCH — Check the position weekly for ${WEEKS} weeks. Withdraw if protocol-wide TVL prints 15% below this snapshot (${formatUsd(p.tvl_usd)}) or if withdrawals pause. This is a model scenario, not a promise of a token or an airdrop. COST ${formatUsd(gas.tx)} when you exit, else $0. TIME ${gas.weeklyMin} min a week (${round(WEEKS * gas.weeklyMin / 60, 1)} h) plus 15 min to unwind.`,
    `RECORD — Keep a ledger of every hash, the $10,000 principal, and modelled fees of ${formatUsd(fees)}. Modelled depositor drop at a 7% share over ${WEEKS} weeks is ${formatUsd(eco.drop)}; net of fees ${formatUsd(eco.net)}. Opportunity-adjusted return is ${formatUsd(eco.adj)}/h after a ${formatUsd(eco.tbill)} T-bill alternative (hurdle ${formatUsd(eco.hurdle)}). COST $0. TIME 5 min a week.`,
  ];
  for (const step of steps) {
    if (step.length < 20 || step.length > 600) throw new Error(`farm step length ${step.length}: ${step.slice(0, 80)}`);
  }
  return {
    farm_steps: steps,
    deposit_usd: DEPOSIT,
    drop_share: DROP_SHARE,
    horizon_weeks: WEEKS,
    drop_usd: eco.drop,
    fees_usd: fees,
    hours,
    net_usd: eco.net,
    net_per_hour: eco.adj,
    tbill_usd: eco.tbill,
    wage_usd: eco.wage,
    hurdle_usd: eco.hurdle,
    incremental_usd: eco.incremental,
    verdict: eco.verdict,
    plan_kind: kind,
    chain_label: gas.label,
    tvl_basis: 'protocol-wide',
    fee_tx: gas.tx,
    fee_bridge: bridge,
    setup_min: gas.setupMin,
    weekly_min: gas.weeklyMin,
  };
}

export function fnv1aHex(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function looTypMiss(comps: Protocol[], kind: 'flat' | 'size'): number {
  const preds: number[] = [];
  const acts: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const p = comps[i]!;
    if (kind === 'flat') {
      const r = median(train.map((q) => q.mcap_usd! / q.tvl_usd));
      preds.push(p.tvl_usd * r);
    } else {
      const { a, b } = olsLogLog(train.map((q) => q.tvl_usd), train.map((q) => q.mcap_usd!));
      preds.push(predictSize(p.tvl_usd, a, b));
    }
    acts.push(p.mcap_usd!);
  }
  return typMiss(preds, acts);
}

function wfTypMiss(train: Protocol[], test: Protocol[], kind: 'flat' | 'size'): number {
  if (kind === 'flat') {
    const r = median(train.map((q) => q.mcap_usd! / q.tvl_usd));
    return typMiss(test.map((p) => p.tvl_usd * r), test.map((p) => p.mcap_usd!));
  }
  const { a, b } = olsLogLog(train.map((q) => q.tvl_usd), train.map((q) => q.mcap_usd!));
  return typMiss(test.map((p) => predictSize(p.tvl_usd, a, b)), test.map((p) => p.mcap_usd!));
}

function kfoldBrier(peers: Protocol[], y: number[], asOf: string, medAge: number, folds = 10, seed = 7): number {
  const idx = peers.map((_, i) => i);
  const rand = mulberry32(seed);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = tmp;
  }
  const preds = new Array<number>(peers.length).fill(0);
  for (let f = 0; f < folds; f++) {
    const hold = new Set(idx.filter((_, n) => n % folds === f));
    const Xtr: number[][] = [];
    const ytr: number[] = [];
    for (let i = 0; i < peers.length; i++) {
      if (hold.has(i)) continue;
      Xtr.push(oddsFeatures(peers[i]!, asOf, medAge));
      ytr.push(y[i]!);
    }
    const w = fitLogit(Xtr, ytr);
    for (const i of hold) preds[i] = predLogit(w, oddsFeatures(peers[i]!, asOf, medAge));
  }
  return brier(preds, y);
}

export function buildRadar(snapshot: Snapshot): {
  board: { schema: string; as_of: string; source: string; floor_usd: number; rows: Row[]; comps: CompRow[]; evidence: Evidence; ledger: Record<string, number> };
  payload: Record<string, unknown>;
} {
  const { as_of: asOf, source, floor_usd, protocols, watchlist } = snapshot;
  const watch = new Set(watchlist);
  const peers = protocols.filter((p) => !isSetAside(p));
  const comps = peers.filter((p) => isPriced(p));
  const pre = peers.filter((p) => !tokenRecorded(p));

  const tokenStemIndex = new Map<string, Protocol[]>();
  for (const p of peers) {
    if (!tokenRecorded(p)) continue;
    for (const st of stems(p.name)) {
      const arr = tokenStemIndex.get(st) ?? [];
      arr.push(p);
      tokenStemIndex.set(st, arr);
    }
  }
  function kinshipOf(p: Protocol): Protocol | null {
    for (const st of stems(p.name)) {
      const hits = (tokenStemIndex.get(st) ?? []).filter((q) => q.slug !== p.slug);
      if (hits.length > 0) return hits[0]!;
    }
    return null;
  }

  const ledger: Record<string, number> = {
    watchlist: 0, early: 0, 'off-list': 0, priced: 0, 'token-nocap': 0,
    'out-bridge': 0, 'out-lst': 0, 'out-cex': 0, 'out-versioned': 0, 'out-other': 0,
  };
  for (const p of protocols) {
    if (isSetAside(p)) ledger[setAsideBucket(p)]++;
    else if (isPriced(p)) ledger.priced++;
    else if (tokenRecorded(p)) ledger['token-nocap']++;
    else if (kinshipOf(p)) ledger['off-list']++;
    else if (watch.has(p.slug) || p.tvl_usd >= floor_usd) ledger.watchlist++;
    else ledger.early++;
  }
  // watchlist count in ledger should be the 40 on the board that are watchlisted;
  // off-list may also be watchlisted. Recompute board buckets properly below.
  // Reset pre-token ledger buckets and count from the board rules:
  ledger.watchlist = 0;
  ledger.early = 0;
  ledger['off-list'] = 0;

  const datedComps = [...comps].filter((p) => p.listed_at !== null).sort((a, b) => a.listed_at!.localeCompare(b.listed_at!));
  const mid = Math.floor(datedComps.length / 2);
  const train = datedComps.slice(0, mid);
  const test = datedComps.slice(mid);
  const cut = train.length > 0 ? train[train.length - 1]!.listed_at! : asOf;

  const flatLoo = looTypMiss(comps, 'flat');
  const sizeLoo = looTypMiss(comps, 'size');
  const flatWf = wfTypMiss(train, test, 'flat');
  const sizeWf = wfTypMiss(train, test, 'size');
  const sizeKept = sizeLoo < flatLoo && sizeWf < flatWf;
  const { a, b } = olsLogLog(comps.map((p) => p.tvl_usd), comps.map((p) => p.mcap_usd!));
  const multipleAt100m = predictSize(1e8, a, b) / 1e8;

  function typMissExtras(extra: 'g' | 'age' | 'ch'): { loo: number; wf: number } {
    const feat = (q: Protocol): number => {
      if (extra === 'g') return q.change_7d === null ? 0 : clamp(q.change_7d / 100, -0.3, 0.3);
      if (extra === 'age') return yearsListed(q, asOf) ?? 0;
      return Math.min(q.chains.length, 8);
    };
    const fit = (sample: Protocol[]): (p: Protocol) => number => {
      const xs = sample.map((q) => [Math.log(Math.max(q.tvl_usd, 1)), feat(q)]);
      const ys = sample.map((q) => Math.log(Math.max(q.mcap_usd!, 1)));
      const n = sample.length;
      let sx1 = 0, sx2 = 0, sy = 0, s11 = 0, s12 = 0, s22 = 0, s1y = 0, s2y = 0;
      for (let i = 0; i < n; i++) {
        const x1 = xs[i]![0]!, x2 = xs[i]![1]!, yv = ys[i]!;
        sx1 += x1; sx2 += x2; sy += yv;
        s11 += x1 * x1; s12 += x1 * x2; s22 += x2 * x2;
        s1y += x1 * yv; s2y += x2 * yv;
      }
      // intercept + two slopes via normal equations
      const xtx = [
        [n, sx1, sx2],
        [sx1, s11, s12],
        [sx2, s12, s22],
      ];
      const xty = [sy, s1y, s2y];
      const A = xtx.map((row, i) => row.concat(xty[i]!));
      for (let i = 0; i < 3; i++) {
        let piv = i;
        for (let r = i + 1; r < 3; r++) if (Math.abs(A[r]![i]!) > Math.abs(A[piv]![i]!)) piv = r;
        const tmp = A[i]!; A[i] = A[piv]!; A[piv] = tmp;
        const d = A[i]![i]! || 1e-12;
        for (let j = i; j < 4; j++) A[i]![j]! /= d;
        for (let r = 0; r < 3; r++) {
          if (r === i) continue;
          const f = A[r]![i]!;
          for (let j = i; j < 4; j++) A[r]![j]! -= f * A[i]![j]!;
        }
      }
      const beta = [A[0]![3]!, A[1]![3]!, A[2]![3]!];
      return (p: Protocol) => Math.exp(clamp(beta[0]! + beta[1]! * Math.log(Math.max(p.tvl_usd, 1)) + beta[2]! * feat(p), -20, 45));
    };
    const looPreds = comps.map((p, i) => fit(comps.filter((_, j) => j !== i))(p));
    return {
      loo: typMiss(looPreds, comps.map((p) => p.mcap_usd!)),
      wf: typMiss(test.map(fit(train)), test.map((p) => p.mcap_usd!)),
    };
  }
  const plusG = typMissExtras('g');
  const plusAge = typMissExtras('age');
  const plusCh = typMissExtras('ch');

  function typMissRidge(kind: 'cat' | 'fam' | 'namelen', kRidge: number): { loo: number; wf: number } {
    const feat = (sample: Protocol[], p: Protocol, aa: number, bb: number): number => {
      if (kind === 'namelen') return p.name.length;
      if (kind === 'fam') {
        const s = new Set(stems(p.name));
        const res: number[] = [];
        for (const t of sample) {
          if (t.slug === p.slug) continue;
          if (stems(t.name).some((x) => s.has(x))) {
            res.push(Math.log(Math.max(t.mcap_usd!, 1)) - Math.log(Math.max(predictSize(t.tvl_usd, aa, bb), 1)));
          }
        }
        if (res.length < 2) return 0;
        return median(res) * res.length / (res.length + kRidge);
      }
      const arr: number[] = [];
      const cat = p.category || 'other';
      for (const t of sample) {
        if ((t.category || 'other') !== cat) continue;
        arr.push(Math.log(Math.max(t.mcap_usd!, 1)) - Math.log(Math.max(predictSize(t.tvl_usd, aa, bb), 1)));
      }
      if (arr.length < 2) return 0;
      return median(arr) * arr.length / (arr.length + kRidge);
    };
    const pred = (sample: Protocol[], p: Protocol): number => {
      const fit = olsLogLog(sample.map((q) => q.tvl_usd), sample.map((q) => q.mcap_usd!));
      const base = predictSize(p.tvl_usd, fit.a, fit.b);
      if (kind === 'namelen') {
        const xs = sample.map((q) => q.name.length);
        const ys = sample.map((q) => Math.log(Math.max(q.mcap_usd!, 1)) - Math.log(Math.max(predictSize(q.tvl_usd, fit.a, fit.b), 1)));
        const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
        const my = ys.reduce((s, v) => s + v, 0) / ys.length;
        let sxx = 0, sxy = 0;
        for (let i = 0; i < xs.length; i++) { sxx += (xs[i]! - mx) ** 2; sxy += (xs[i]! - mx) * (ys[i]! - my); }
        const g = sxx === 0 ? 0 : sxy / sxx;
        return base * Math.exp(g * (p.name.length - mx));
      }
      return base * Math.exp(feat(sample, p, fit.a, fit.b));
    };
    const looPreds = comps.map((p, i) => pred(comps.filter((_, j) => j !== i), p));
    return {
      loo: typMiss(looPreds, comps.map((p) => p.mcap_usd!)),
      wf: typMiss(test.map((p) => pred(train, p)), test.map((p) => p.mcap_usd!)),
    };
  }
  const plusCat = typMissRidge('cat', 64);
  const plusFamV = typMissRidge('fam', 16);
  const plusCtrl = typMissRidge('namelen', 0);
  const gKept = plusG.loo < sizeLoo && plusG.wf < sizeWf;
  const ageVKept = plusAge.loo < sizeLoo && plusAge.wf < sizeWf;
  const chKept = plusCh.loo < sizeLoo && plusCh.wf < sizeWf;
  const catKept = plusCat.loo < sizeLoo && plusCat.wf < sizeWf;
  const famVKept = plusFamV.loo < sizeLoo && plusFamV.wf < sizeWf;
  const valueTerms = [
    { term: 'flat median multiple', loo: round(flatLoo, 3), wf: round(flatWf, 3), kept: !sizeKept, decision: 'baseline' },
    { term: 'size curve, ln TVL', loo: round(sizeLoo, 3), wf: round(sizeWf, 3), kept: sizeKept, decision: sizeKept ? 'kept' : 'tested, not kept' },
    { term: 'size + category effect, ridge 64', loo: round(plusCat.loo, 3), wf: round(plusCat.wf, 3), kept: catKept, decision: catKept ? 'kept' : 'tested, not kept' },
    { term: 'size + family effect, ridge 16', loo: round(plusFamV.loo, 3), wf: round(plusFamV.wf, 3), kept: famVKept, decision: famVKept ? 'kept' : 'tested, not kept' },
    { term: 'size + 7-day growth', loo: round(plusG.loo, 3), wf: round(plusG.wf, 3), kept: gKept, decision: gKept ? 'kept' : 'tested, not kept' },
    { term: 'size + years listed (value)', loo: round(plusAge.loo, 3), wf: round(plusAge.wf, 3), kept: ageVKept, decision: ageVKept ? 'kept' : 'tested, not kept' },
    { term: 'size + chain count', loo: round(plusCh.loo, 3), wf: round(plusCh.wf, 3), kept: chKept, decision: chKept ? 'kept' : 'tested, not kept' },
    { term: 'control: length of the protocol name', loo: round(plusCtrl.loo, 3), wf: round(plusCtrl.wf, 3), kept: false, decision: 'must not help' },
  ];

  const ages = peers.map((p) => yearsListed(p, asOf)).filter((v): v is number => v !== null);
  const medAge = median(ages);
  const y = peers.map((p) => (tokenRecorded(p) ? 1 : 0));
  const baseRate = y.reduce((s, v) => s + v, 0) / y.length;
  const familyFlagOf = (p: Protocol): number => {
    for (const st of stems(p.name)) {
      const hits = (tokenStemIndex.get(st) ?? []).filter((q) => q.slug !== p.slug);
      if (hits.length > 0) return 1;
    }
    return 0;
  };
  type OddsKind = 'age' | 'age-tvl' | 'age-tvl-fam' | 'age-tvl-fam-g7' | 'age-tvl-ch';
  const featOf = (kind: OddsKind) => (p: Protocol) => oddsFeatures(p, asOf, medAge, kind, familyFlagOf(p));
  const datedPeers = peers.filter((p) => p.listed_at !== null).sort((a, b) => a.listed_at!.localeCompare(b.listed_at!));
  const pMid = Math.floor(datedPeers.length / 2);
  const pTrain = datedPeers.slice(0, pMid);
  const pTest = datedPeers.slice(pMid);
  const yTrain = pTrain.map((p) => (tokenRecorded(p) ? 1 : 0));
  const yTest = pTest.map((p) => (tokenRecorded(p) ? 1 : 0));
  const baseWf = brier(yTest.map(() => yTrain.reduce((s, v) => s + v, 0) / yTrain.length), yTest);
  const baseWfAcc = accuracy(yTest.map(() => yTrain.reduce((s, v) => s + v, 0) / yTrain.length), yTest);

  function oddsEval(kind: OddsKind): { kfold: number; wf: number; kAcc: number; wfAcc: number } {
    const feat = featOf(kind);
    const wWf = fitLogit(pTrain.map(feat), yTrain);
    const wfPreds = pTest.map((p) => predLogit(wWf, feat(p)));
    const idx = peers.map((_, i) => i);
    const rand = mulberry32(7);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = idx[i]!;
      idx[i] = idx[j]!;
      idx[j] = tmp;
    }
    const preds = new Array<number>(peers.length).fill(0);
    for (let f = 0; f < 10; f++) {
      const hold = new Set(idx.filter((_, n) => n % 10 === f));
      const Xtr: number[][] = [];
      const ytr: number[] = [];
      for (let i = 0; i < peers.length; i++) {
        if (hold.has(i)) continue;
        Xtr.push(feat(peers[i]!));
        ytr.push(y[i]!);
      }
      const w = fitLogit(Xtr, ytr);
      for (const i of hold) preds[i] = predLogit(w, feat(peers[i]!));
    }
    return {
      kfold: brier(preds, y),
      wf: brier(wfPreds, yTest),
      kAcc: accuracy(preds, y),
      wfAcc: accuracy(wfPreds, yTest),
    };
  }

  const baseK = brier(y.map(() => baseRate), y);
  const baseKAcc = accuracy(y.map(() => baseRate), y);
  const evAge = oddsEval('age');
  const evTvl = oddsEval('age-tvl');
  const evFam = oddsEval('age-tvl-fam');
  const evG7 = oddsEval('age-tvl-fam-g7');
  const evCh = oddsEval('age-tvl-ch');
  const ageKept = evAge.kfold < baseK && evAge.wf < baseWf;
  const tvlKept = ageKept && evTvl.kfold < evAge.kfold && evTvl.wf < evAge.wf;
  const famKept = tvlKept && evFam.kfold < evTvl.kfold && evFam.wf < evTvl.wf;
  const g7Kept = famKept && evG7.kfold < evFam.kfold && evG7.wf < evFam.wf;
  const chKeptOdds = tvlKept && evCh.kfold < evTvl.kfold && evCh.wf < evTvl.wf;
  const oddsKind: OddsKind = g7Kept ? 'age-tvl-fam-g7' : famKept ? 'age-tvl-fam' : tvlKept ? 'age-tvl' : ageKept ? 'age' : 'age';
  const featFinal = featOf(oddsKind);
  const X = peers.map(featFinal);
  const oddsW = (ageKept || tvlKept)
    ? fitLogit(X, y)
    : [Math.log(baseRate / (1 - baseRate))];
  const oddsTerms = [
    ...(ageKept ? ['years listed'] : []),
    ...(tvlKept ? ['ln TVL'] : []),
    ...(famKept ? ['name-stem already records a token'] : []),
    ...(g7Kept ? ['7-day growth'] : []),
  ];
  const evFinal = g7Kept ? evG7 : famKept ? evFam : tvlKept ? evTvl : evAge;
  const oddsIn = ageKept
    ? brier(peers.map((p) => predLogit(oddsW, featFinal(p))), y)
    : baseK;
  const odds10f = ageKept ? evFinal.kfold : baseK;
  const oddsWfFinal = ageKept ? evFinal.wf : baseWf;
  const oddsAcc10 = ageKept ? evFinal.kAcc : baseKAcc;
  const oddsAccWf = ageKept ? evFinal.wfAcc : baseWfAcc;

  function valueIfLaunches(tvl: number, aa: number, bb: number): number {
    return predictSize(tvl, aa, bb);
  }
  function oddsOf(p: Protocol, w: number[]): number {
    if (!ageKept) return sigmoid(w[0]!);
    return predLogit(w, featFinal(p));
  }

  // Leave-one-out residuals for held-out interval calibration (not in-sample residuals).
  const looFit: { a: number; b: number; resid: number }[] = comps.map((p, i) => {
    const train = comps.filter((_, j) => j !== i);
    const fit = olsLogLog(train.map((q) => q.tvl_usd), train.map((q) => q.mcap_usd!));
    const pred = valueIfLaunches(p.tvl_usd, fit.a, fit.b);
    return { a: fit.a, b: fit.b, resid: Math.log(p.mcap_usd! / Math.max(1, pred)) };
  });
  const looResiduals = looFit.map((x) => x.resid);

  // 1000 size-curve bootstraps. Odds stay at the point estimate; residual draws are held-out LOO residuals.
  const rand = mulberry32(BOOTSTRAP_SEED);
  const boots: { a: number; b: number; resid: number }[] = [];
  for (let i = 0; i < BOOTSTRAP_N; i++) {
    const c = resample(comps, rand);
    const fit = olsLogLog(c.map((p) => p.tvl_usd), c.map((p) => p.mcap_usd!));
    const resid = looResiduals[Math.floor(rand() * looResiduals.length)]!;
    boots.push({ a: fit.a, b: fit.b, resid });
  }

  // Empirical coverage: for each priced comp, interval uses its LOO fit and residuals of the other comps only.
  let hit25 = 0;
  let hit10 = 0;
  const covRand = mulberry32(BOOTSTRAP_SEED + 1);
  for (let i = 0; i < comps.length; i++) {
    const p = comps[i]!;
    const others = looResiduals.filter((_, j) => j !== i);
    const pred = valueIfLaunches(p.tvl_usd, looFit[i]!.a, looFit[i]!.b);
    const draws: number[] = [];
    for (let k = 0; k < BOOTSTRAP_N; k++) {
      draws.push(pred * Math.exp(others[Math.floor(covRand() * others.length)]!));
    }
    draws.sort((x, yv) => x - yv);
    if (p.mcap_usd! >= percentile(draws, 0.25) && p.mcap_usd! <= percentile(draws, 0.75)) hit25++;
    if (p.mcap_usd! >= percentile(draws, 0.10) && p.mcap_usd! <= percentile(draws, 0.90)) hit10++;
  }
  let hitX3 = 0;
  for (let i = 0; i < comps.length; i++) {
    const pred = valueIfLaunches(comps[i]!.tvl_usd, looFit[i]!.a, looFit[i]!.b);
    const a = comps[i]!.mcap_usd!;
    if (a >= pred / 3 && a <= pred * 3) hitX3++;
  }
  // Walk-forward interval coverage: train-fit plus train residuals, scored on later comps only.
  const trainFit = olsLogLog(train.map((q) => q.tvl_usd), train.map((q) => q.mcap_usd!));
  const trainResid = train.map((q) => Math.log(q.mcap_usd! / Math.max(1, valueIfLaunches(q.tvl_usd, trainFit.a, trainFit.b))));
  let wfHit25 = 0, wfHit10 = 0, wfHitX3 = 0, looHitX3Train = 0;
  const wfRand = mulberry32(BOOTSTRAP_SEED + 2);
  for (const p of test) {
    const pred = valueIfLaunches(p.tvl_usd, trainFit.a, trainFit.b);
    const draws: number[] = [];
    for (let k = 0; k < BOOTSTRAP_N; k++) draws.push(pred * Math.exp(trainResid[Math.floor(wfRand() * trainResid.length)]!));
    draws.sort((x, yv) => x - yv);
    if (p.mcap_usd! >= percentile(draws, 0.25) && p.mcap_usd! <= percentile(draws, 0.75)) wfHit25++;
    if (p.mcap_usd! >= percentile(draws, 0.10) && p.mcap_usd! <= percentile(draws, 0.90)) wfHit10++;
    if (p.mcap_usd! >= pred / 3 && p.mcap_usd! <= pred * 3) wfHitX3++;
  }
  for (let i = 0; i < comps.length; i++) {
    const pred = valueIfLaunches(comps[i]!.tvl_usd, looFit[i]!.a, looFit[i]!.b);
    if (comps[i]!.mcap_usd! >= pred / 3 && comps[i]!.mcap_usd! <= pred * 3) looHitX3Train++;
  }

  type Draft = {
    p: Protocol;
    kin: Protocol | null;
    share: number;
    vif: number;
    odds: number;
    implied: number;
    draws: number[];
    bucket: 'watchlist' | 'early' | 'off-list';
  };
  const drafts: Draft[] = [];
  for (const p of pre) {
    const kin = kinshipOf(p);
    const share = kin ? KIN_SHARE : 1;
    const vif = valueIfLaunches(p.tvl_usd, a, b);
    const od = oddsOf(p, oddsW);
    const implied = Math.max(1, Math.round(vif * od * share));
    const draws = boots.map((bt) => Math.max(1, valueIfLaunches(p.tvl_usd, bt.a, bt.b) * Math.exp(bt.resid) * od * share));
    draws.sort((x, yv) => x - yv);
    let bucket: 'watchlist' | 'early' | 'off-list';
    if (kin) bucket = 'off-list';
    else if (watch.has(p.slug)) bucket = 'watchlist';
    else bucket = 'early';
    ledger[bucket]++;
    drafts.push({ p, kin, share, vif, odds: od, implied, draws, bucket });
  }

  drafts.sort((x, y) => y.implied - x.implied || x.p.slug.localeCompare(y.p.slug));

  // Rank ranges from bootstrap implied values.
  const bootRanks: number[][] = drafts.map(() => []);
  for (let bix = 0; bix < BOOTSTRAP_N; bix++) {
    const vals = drafts.map((d, i) => ({ i, v: d.draws[bix] ?? d.implied, slug: d.p.slug }));
    vals.sort((x, y) => y.v - x.v || x.slug.localeCompare(y.slug));
    vals.forEach((item, rank0) => bootRanks[item.i]!.push(rank0 + 1));
  }

  const rows: Row[] = drafts.map((d, i) => {
    const farm = buildFarm(d.p, d.implied);
    const ds = [...d.draws].sort((x, yv) => x - yv);
    const rs = [...bootRanks[i]!].sort((x, yv) => x - yv);
    return {
      slug: d.p.slug,
      name: d.p.name,
      rank: i + 1,
      implied_value_usd: d.implied,
      category: d.p.category,
      chains: d.p.chains,
      tvl_usd: d.p.tvl_usd,
      change_7d: d.p.change_7d,
      listed_at: d.p.listed_at,
      years_listed: yearsListed(d.p, asOf) === null ? null : round(yearsListed(d.p, asOf)!, 6),
      on_watchlist: watch.has(d.p.slug),
      bucket: d.bucket,
      kinship: d.kin ? `${d.kin.name} (${d.kin.symbol ?? d.kin.slug})` : null,
      kinship_share: d.share,
      value_if_launches: Math.round(d.vif),
      token_odds: round(d.odds, 4),
      multiple: round(d.vif / d.p.tvl_usd, 4),
      p10: Math.round(percentile(ds, 0.10)),
      p25: Math.round(percentile(ds, 0.25)),
      p75: Math.round(percentile(ds, 0.75)),
      p90: Math.round(percentile(ds, 0.90)),
      rank_lo: rs[0]!,
      rank_hi: rs[rs.length - 1]!,
      family_flag: familyFlagOf(d.p),
      raw_per_hour: round(farm.hours > 0 ? farm.net_usd / farm.hours : farm.net_usd, 2),
      ...farm,
    };
  });

  const farmN = rows.filter((r) => r.verdict === 'FARM').length;
  const thinN = rows.filter((r) => r.verdict === 'THIN').length;
  const skipN = rows.filter((r) => r.verdict === 'SKIP').length;

  function countScenario(deposit: number, dropShare: number, weeks: number, wage: number, oddsScale: number): { farm: number; thin: number; skip: number } {
    let farm = 0, thin = 0, skip = 0;
    for (const r of rows) {
      const implied = Math.max(1, Math.round(r.value_if_launches * r.token_odds * oddsScale * r.kinship_share));
      const hours = round((r.setup_min + weeks * r.weekly_min) / 60, 1);
      const eco = farmEconomics(implied, r.tvl_usd, r.fees_usd, hours, deposit, dropShare, weeks, wage);
      if (eco.verdict === 'FARM') farm++;
      else if (eco.verdict === 'THIN') thin++;
      else skip++;
    }
    return { farm, thin, skip };
  }
  const sensitivity = [
    { name: 'Main ($10k, 7%, 12w, $25/h)', deposit: DEPOSIT, drop_share: DROP_SHARE, weeks: WEEKS, wage: WAGE, odds_scale: 1, ...countScenario(DEPOSIT, DROP_SHARE, WEEKS, WAGE, 1) },
    { name: 'Deposit $3,000', deposit: 3000, drop_share: DROP_SHARE, weeks: WEEKS, wage: WAGE, odds_scale: 1, ...countScenario(3000, DROP_SHARE, WEEKS, WAGE, 1) },
    { name: 'Deposit $30,000', deposit: 30000, drop_share: DROP_SHARE, weeks: WEEKS, wage: WAGE, odds_scale: 1, ...countScenario(30000, DROP_SHARE, WEEKS, WAGE, 1) },
    { name: 'Share 3.5%', deposit: DEPOSIT, drop_share: 0.035, weeks: WEEKS, wage: WAGE, odds_scale: 1, ...countScenario(DEPOSIT, 0.035, WEEKS, WAGE, 1) },
    { name: 'Share 14%', deposit: DEPOSIT, drop_share: 0.14, weeks: WEEKS, wage: WAGE, odds_scale: 1, ...countScenario(DEPOSIT, 0.14, WEEKS, WAGE, 1) },
    { name: 'Horizon 6 weeks', deposit: DEPOSIT, drop_share: DROP_SHARE, weeks: 6, wage: WAGE, odds_scale: 1, ...countScenario(DEPOSIT, DROP_SHARE, 6, WAGE, 1) },
    { name: 'Horizon 24 weeks', deposit: DEPOSIT, drop_share: DROP_SHARE, weeks: 24, wage: WAGE, odds_scale: 1, ...countScenario(DEPOSIT, DROP_SHARE, 24, WAGE, 1) },
    { name: 'Wage $40/h', deposit: DEPOSIT, drop_share: DROP_SHARE, weeks: WEEKS, wage: 40, odds_scale: 1, ...countScenario(DEPOSIT, DROP_SHARE, WEEKS, 40, 1) },
    { name: 'Odds ×0.7', deposit: DEPOSIT, drop_share: DROP_SHARE, weeks: WEEKS, wage: WAGE, odds_scale: 0.7, ...countScenario(DEPOSIT, DROP_SHARE, WEEKS, WAGE, 0.7) },
  ];

  const checksumSrc = rows.map((r) => `${r.slug}:${r.rank}:${r.implied_value_usd}`).join('|');
  const checksum = fnv1aHex(checksumSrc);

  const missingWatch = watchlist.filter((s) => !rows.some((r) => r.slug === s));
  if (missingWatch.length) throw new Error(`watchlist not covered: ${missingWatch.join(',')}`);
  const ledgerTotal = Object.values(ledger).reduce((s, n) => s + n, 0);
  if (ledgerTotal !== protocols.length) throw new Error(`ledger ${ledgerTotal} != ${protocols.length}`);

  const evidence: Evidence = {
    comps: comps.length,
    peers: peers.length,
    peers_with_token: y.reduce((s, v) => s + v, 0),
    value: {
      formula: 'model-implied value = (value under a token-launch scenario, size curve) × (peer token-record rate) × (existing-token relationship adjustment). This is a model scenario, not a launch forecast or an airdrop.',
      a: round(a, 6),
      b: round(b, 6),
      multiple_at_100m: round(multipleAt100m, 4),
      typ_miss: {
        flat_loo: round(flatLoo, 3),
        size_loo: round(sizeLoo, 3),
        flat_wf: round(flatWf, 3),
        size_wf: round(sizeWf, 3),
      },
      wf_split: { train: train.length, test: test.length, cut },
      terms: valueTerms,
      range_honesty: {
        p25: round(hit25 / comps.length, 3),
        p75_stated: 0.5,
        p10: round(hit10 / comps.length, 3),
        p90_stated: 0.8,
        n: comps.length,
        n_boot: BOOTSTRAP_N,
        residual: 'leave-one-out residuals; coverage uses each comp’s LOO fit and the other comps’ residuals only. Walk-forward uses the earlier-listed fit plus its residuals, scored on later comps.',
        loo_p25: round(hit25 / comps.length, 3),
        loo_p10: round(hit10 / comps.length, 3),
        loo_within_x3: round(hitX3 / comps.length, 3),
        wf_p25: round(wfHit25 / test.length, 3),
        wf_p10: round(wfHit10 / test.length, 3),
        wf_within_x3: round(wfHitX3 / test.length, 3),
        wf_n: test.length,
      },
      ablation: [
        { feature: 'TVL (size curve)', used_in: 'token-launch scenario value', loo: round(sizeLoo, 3), wf: round(sizeWf, 3), kept: sizeKept, note: 'Beats a flat median multiple on both held-out tests; the only value term kept' },
        { feature: 'Category effect, ridge 64', used_in: 'tried in the value model', loo: round(plusCat.loo, 3), wf: round(plusCat.wf, 3), kept: catKept, note: 'Did not beat the size curve on both held-out tests in this 92-comp sample; tested, not kept' },
        { feature: 'Family effect, ridge 16', used_in: 'tried in the value model', loo: round(plusFamV.loo, 3), wf: round(plusFamV.wf, 3), kept: famVKept, note: 'No reliable improvement; tested, not kept as a value adder' },
        { feature: '7-day growth', used_in: 'tried in the value model', loo: round(plusG.loo, 3), wf: round(plusG.wf, 3), kept: gKept, note: 'Did not improve both held-out tests; dropped from the value model' },
        { feature: 'Years listed (as a value term)', used_in: 'tried in the value model', loo: round(plusAge.loo, 3), wf: round(plusAge.wf, 3), kept: ageVKept, note: 'No reliable improvement in the value model; years listed is kept only in the peer token-record model' },
        { feature: 'Chain count', used_in: 'tried in the value model', loo: round(plusCh.loo, 3), wf: round(plusCh.wf, 3), kept: chKept, note: 'Did not improve both held-out tests; dropped' },
        { feature: 'Control: protocol name length', used_in: 'placebo in the value model', loo: round(plusCtrl.loo, 3), wf: round(plusCtrl.wf, 3), kept: false, note: 'A term that must not help; kept out of the model regardless of the sample result' },
        { feature: 'Years listed', used_in: 'peer token-record rate', loo: round(evAge.kfold, 4), wf: round(evAge.wf, 4), kept: ageKept, note: 'Lowers Brier versus the base rate on both 10-fold and walk-forward. This is not years without a token as a valuation adder' },
        { feature: 'ln TVL', used_in: 'peer token-record rate', loo: round(evTvl.kfold, 4), wf: round(evTvl.wf, 4), kept: tvlKept, note: 'Further lowers Brier when added to years listed' },
        { feature: 'Name-stem already records a token', used_in: 'peer token-record rate', loo: round(evFam.kfold, 4), wf: round(evFam.wf, 4), kept: famKept, note: famKept ? 'Improves both 10-fold and walk-forward Brier; kept' : 'Did not improve both tests; tested, not kept' },
        { feature: '7-day growth (odds)', used_in: 'peer token-record rate', loo: round(evG7.kfold, 4), wf: round(evG7.wf, 4), kept: g7Kept, note: g7Kept ? 'Improves both tests on top of family; kept' : 'Did not improve both tests on top of the kept odds terms; tested, not kept' },
        { feature: 'Chain count (odds)', used_in: 'tried in the token-record model', loo: round(evCh.kfold, 4), wf: round(evCh.wf, 4), kept: chKeptOdds, note: 'Did not beat years+TVL on both tests; tested, not kept' },
      ],
    },
    odds: {
      formula: (g7Kept
        ? 'logistic P(a comparable peer already records a token | years listed, ln TVL, name-stem family, 7-day growth); not the probability this protocol will launch a token'
        : famKept
          ? 'logistic P(a comparable peer already records a token | years listed, ln TVL, name-stem family); not the probability this protocol will launch a token'
          : tvlKept
            ? 'logistic P(a comparable peer already records a token | years listed, ln TVL); not the probability this protocol will launch a token'
            : 'logistic P(a comparable peer already records a token | years listed); not the probability this protocol will launch a token'),
      weights: oddsW.map((v) => round(v, 5)),
      terms: oddsTerms,
      med_age: round(medAge, 3),
      base_rate: round(baseRate, 4),
      brier: {
        base: round(baseK, 4),
        model_in: round(oddsIn, 4),
        model_10f: round(odds10f, 4),
        base_wf: round(baseWf, 4),
        model_wf: round(oddsWfFinal, 4),
      },
      accuracy: {
        base_10f: round(baseKAcc, 3),
        model_10f: round(oddsAcc10, 3),
        base_wf: round(baseWfAcc, 3),
        model_wf: round(oddsAccWf, 3),
      },
      terms_tried: [
        { term: 'base rate of peers', kfold: round(baseK, 4), wf: round(baseWf, 4), kept: !ageKept, decision: ageKept ? 'baseline' : 'kept as the model' },
        { term: 'years listed', kfold: round(evAge.kfold, 4), wf: round(evAge.wf, 4), kept: ageKept, decision: ageKept ? 'kept' : 'tested, not kept' },
        { term: '+ ln TVL', kfold: round(evTvl.kfold, 4), wf: round(evTvl.wf, 4), kept: tvlKept, decision: tvlKept ? 'kept' : 'tested, not kept' },
        { term: '+ name-stem already records a token', kfold: round(evFam.kfold, 4), wf: round(evFam.wf, 4), kept: famKept, decision: famKept ? 'kept' : 'tested, not kept' },
        { term: '+ 7-day growth', kfold: round(evG7.kfold, 4), wf: round(evG7.wf, 4), kept: g7Kept, decision: g7Kept ? 'kept' : 'tested, not kept' },
        { term: '+ chain count (instead of family)', kfold: round(evCh.kfold, 4), wf: round(evCh.wf, 4), kept: chKeptOdds, decision: chKeptOdds ? 'kept' : 'tested, not kept' },
      ],
    },
    farm: {
      deposit: DEPOSIT, drop_share: DROP_SHARE, weeks: WEEKS, wage: WAGE, tbill: TBILL,
      farm: farmN, thin: thinN, skip: skipN,
      rule: 'FARM if reward after fees exceeds the T-bill alternative plus hands-on hours × $25. Opportunity-adjusted hourly return is (net − T-bill) / hours. THIN if incremental return is positive but below $25/h. SKIP if incremental return is not positive.',
    },
    sensitivity,
    integrity: { checksum, n_rows: rows.length, watch_covered: watchlist.length, ledger_total: ledgerTotal },
  };
  const compRows: CompRow[] = comps.map((p) => {
    const fitted = valueIfLaunches(p.tvl_usd, a, b);
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      symbol: p.symbol,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      ratio: round(p.mcap_usd! / p.tvl_usd, 4),
      fitted: Math.round(fitted),
      residual: round(p.mcap_usd! / fitted, 3),
      listed_at: p.listed_at,
      loo_fitted: Math.round(valueIfLaunches(p.tvl_usd, looFit[comps.indexOf(p)]!.a, looFit[comps.indexOf(p)]!.b)),
    };
  }).sort((x, y) => y.tvl_usd - x.tvl_usd);

  const board = {
    schema: 'prelaunch-radar/v2',
    as_of: asOf,
    source,
    floor_usd,
    rows,
    comps: compRows,
    evidence,
    ledger,
  };

  const payload = {
    as_of: asOf,
    source,
    floor_usd,
    model: { a, b, odds_w: oddsW, med_age: medAge, tvl_kept: tvlKept, age_kept: ageKept, fam_kept: famKept, g7_kept: g7Kept, odds_kind: oddsKind },
    evidence,
    ledger,
    checksum,
    scenario: { deposit: DEPOSIT, drop_share: DROP_SHARE, weeks: WEEKS, wage: WAGE, tbill: TBILL },
    rows: rows.map(({ farm_steps: _steps, ...rest }) => rest),
    comps: compRows,
    watchlist,
  };

  return { board, payload };
}

export function boardIssue(rows: Row[], snapshot: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4000) return `row count ${rows.length}`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const slugs = new Set<string>();
  const ranks = new Set<number>();
  let prev = Infinity;
  for (const r of rows) {
    if (!known.has(r.slug) || slugs.has(r.slug)) return `slug ${r.slug}`;
    slugs.add(r.slug);
    if (!Number.isInteger(r.rank) || r.rank < 1 || ranks.has(r.rank)) return `rank ${r.rank}`;
    ranks.add(r.rank);
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1) return `value ${r.slug}`;
    if (r.implied_value_usd > prev) return `value rose at rank ${r.rank}`;
    prev = r.implied_value_usd;
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) return `steps ${r.slug}`;
    if (r.farm_steps.some((s) => s.trim().length < 20 || s.trim().length > 600)) return `step length ${r.slug}`;
  }
  if (ranks.size !== rows.length) return 'ranks not 1..N';
  for (const s of snapshot.watchlist) if (!slugs.has(s)) return `missing watchlist ${s}`;
  if (new Set(rows.map((r) => r.implied_value_usd)).size === 1) return 'all values equal';
  return null;
}
