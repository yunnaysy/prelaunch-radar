// Pure radar logic: every value below comes from the sealed snapshot alone.

export type TokenClass = 'pre-token' | 'token-trading' | 'unpriced-token';

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

export interface Factors {
  ratio: number;
  ratio_basis: 'category' | 'all-protocol';
  ratio_sample_size: number;
  growth: number;
  change_7d: number | null;
  age: number;
  months_without_token: number | null;
  chains: number;
  chain_count: number;
  tvl_base: number;
  product: number;
  implied_value_usd: number;
}

export interface FarmPlan {
  farm_steps: string[];
  farm_cost: string;
  farm_time: string;
  risk_notes: string[];
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
  months_without_token: number | null;
  on_watchlist: boolean;
  derivative_like: boolean;
  token_class: TokenClass;
  factors: Factors;
}

export interface TokenRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  mcap_tvl_ratio: number;
  change_7d: number | null;
  listed_at: string | null;
  symbol: string | null;
}

export interface Board {
  schema: string;
  as_of: string;
  source: string;
  floor_usd: number;
  value_model: {
    formula: string;
    ratio_band: [number, number];
    min_category_sample: number;
    all_protocol_median_ratio: number;
    calibration_count: number;
    category_medians: Record<string, { ratio: number; sample_size: number; basis: string }>;
  };
  counts: {
    protocols: number;
    pre_token: number;
    token_trading: number;
    watchlist: number;
    rows: number;
    tokens_trading: number;
  };
  rows: Row[];
  tokens_trading: TokenRow[];
}

export const RATIO_BAND: [number, number] = [0.02, 3];
export const MIN_CATEGORY_SAMPLE = 5;
const VERSION_MARKER = /\s(?:V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
const WRAP_WORD = /\b(?:wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i;
const DERIVATIVE_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);

const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));
const round = (n: number, places: number): number => {
  const scale = 10 ** places;
  return Math.round(n * scale) / scale;
};

export function parseSnapshot(input: string | Record<string, unknown>): Snapshot {
  const raw: Record<string, unknown> = typeof input === 'string' ? JSON.parse(input) : input;
  if (!raw || typeof raw !== 'object') throw new Error('snapshot: expected an object');
  if (typeof raw.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.as_of)) {
    throw new Error('snapshot: invalid as_of');
  }
  if (typeof raw.source !== 'string') throw new Error('snapshot: invalid source');
  if (typeof raw.floor_usd !== 'number' || !Number.isFinite(raw.floor_usd)) {
    throw new Error('snapshot: invalid floor_usd');
  }
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: invalid protocols or watchlist');
  }
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

export function isDerivativeLike(protocol: Protocol): boolean {
  const category = protocol.category ?? '';
  return DERIVATIVE_CATEGORIES.has(category)
    || WRAP_WORD.test(protocol.name)
    || EXCHANGE_PREFIX.test(protocol.name)
    || VERSION_MARKER.test(protocol.name);
}

export function classify(protocol: Protocol): TokenClass {
  if (protocol.gecko_id !== null && protocol.symbol !== null
      && protocol.mcap_usd !== null && protocol.mcap_usd > 0 && protocol.tvl_usd > 0) {
    return 'token-trading';
  }
  if (protocol.gecko_id === null && protocol.symbol === null) return 'pre-token';
  return 'unpriced-token';
}

export function monthsBetween(fromDay: string, toDay: string): number {
  const [fy, fm] = fromDay.split('-').map(Number);
  const [ty, tm] = toDay.split('-').map(Number);
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface Calibration {
  all: number;
  byCategory: Map<string, { ratio: number; n: number; basis: string }>;
  count: number;
}

export function calibrateRatios(protocols: Protocol[]): Calibration {
  const trading = protocols.filter((p) => classify(p) === 'token-trading');
  const ratios = trading.map((p) => p.mcap_usd! / p.tvl_usd);
  const all = clamp(median(ratios), RATIO_BAND[0], RATIO_BAND[1]);
  const grouped = new Map<string, number[]>();
  for (const p of trading) {
    const key = p.category ?? 'Uncategorised';
    const bucket = grouped.get(key) ?? [];
    bucket.push(p.mcap_usd! / p.tvl_usd);
    grouped.set(key, bucket);
  }
  const byCategory = new Map<string, { ratio: number; n: number; basis: string }>();
  for (const [category, bucket] of grouped) {
    const n = bucket.length;
    byCategory.set(category, {
      ratio: n >= MIN_CATEGORY_SAMPLE ? clamp(median(bucket), RATIO_BAND[0], RATIO_BAND[1]) : all,
      n,
      basis: n >= MIN_CATEGORY_SAMPLE ? 'category' : 'all-protocol',
    });
  }
  return { all, byCategory, count: trading.length };
}

export function ratioFor(protocol: Protocol, calibration: Calibration): {
  ratio: number; basis: 'category' | 'all-protocol'; n: number;
} {
  const key = protocol.category ?? 'Uncategorised';
  const entry = calibration.byCategory.get(key);
  if (!entry) return { ratio: calibration.all, basis: 'all-protocol', n: calibration.count };
  if (entry.basis === 'all-protocol') return { ratio: entry.ratio, basis: 'all-protocol', n: calibration.count };
  return { ratio: entry.ratio, basis: 'category', n: entry.n };
}

export function impliedValue(protocol: Protocol, calibration: Calibration, asOf: string): Factors {
  const { ratio, basis, n } = ratioFor(protocol, calibration);
  const growth = protocol.change_7d === null ? 1 : 1 + clamp(protocol.change_7d / 100, -0.3, 0.3);
  const months = protocol.listed_at === null ? null : monthsBetween(protocol.listed_at, asOf);
  const age = months === null ? 1 : clamp(1.2 - months / 60, 0.7, 1.2);
  const chainCount = protocol.chains.length;
  const chainsFactor = 1 + Math.min(chainCount, 8) * 0.015;
  const product = protocol.tvl_usd * ratio * growth * age * chainsFactor;
  const implied = Math.max(1, Math.round(product));
  return {
    ratio: round(ratio, 6),
    ratio_basis: basis,
    ratio_sample_size: n,
    growth: round(growth, 6),
    change_7d: protocol.change_7d,
    age: round(age, 6),
    months_without_token: months,
    chains: round(chainsFactor, 6),
    chain_count: chainCount,
    tvl_base: protocol.tvl_usd,
    product: round(product, 2),
    implied_value_usd: implied,
  };
}

export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${round(value / 1e9, 2)}B`;
  if (abs >= 1e6) return `$${round(value / 1e6, 1)}M`;
  if (abs >= 1e3) return `$${round(value / 1e3, 1)}K`;
  return `$${Math.round(value)}`;
}

const L2_CHAINS = new Set([
  'Arbitrum', 'Base', 'Optimism', 'Polygon zkEVM', 'zkSync Era', 'Linea', 'Scroll', 'Blast',
  'Starknet', 'Mantle', 'Mode', 'Taiko', 'Ink', 'Unichain', 'Morph', 'Plasma', 'Fluent',
  'Celo', 'Gnosis', 'BOB', 'Corn', 'Etherlink', 'Citrea', 'Arc', 'Tempo', 'Stable',
]);

export interface ChainProfile {
  label: string;
  txLow: number;
  txHigh: number;
  setup: string;
}

export function chainProfile(chains: string[]): ChainProfile {
  const list = chains.length > 0 ? chains : ['Ethereum'];
  const primary = list.find((c) => L2_CHAINS.has(c)) ?? list[0];
  if (primary === 'Ethereum') return { label: 'Ethereum mainnet', txLow: 5, txHigh: 25, setup: '25-40 min' };
  if (primary === 'Solana') return { label: 'Solana', txLow: 0.01, txHigh: 0.1, setup: '10-20 min' };
  if (primary === 'Bitcoin') return { label: 'Bitcoin', txLow: 2, txHigh: 10, setup: '20-35 min' };
  if (L2_CHAINS.has(primary)) return { label: primary, txLow: 0.5, txHigh: 3, setup: '15-30 min' };
  return { label: primary, txLow: 0.1, txHigh: 1.5, setup: '15-30 min' };
}

export function planKind(category: string | null, derivativeLike: boolean): string {
  if (derivativeLike) {
    const c = (category ?? '').toLowerCase();
    if (c.includes('staking') || c.includes('restaking')) return 'liquid-staking';
    if (c.includes('bridge')) return 'bridge';
    if (c.includes('cex') || c.includes('exchange')) return 'services';
  }
  switch (category) {
    case 'Dexs': case 'Liquidity Manager': case 'NFT Marketplace': case 'OTC Marketplace': return 'dex';
    case 'Lending': case 'Uncollateralized Lending': case 'Collateral Management': return 'lending';
    case 'Leveraged Farming': return 'leverage';
    case 'CDP': case 'CDP Manager': case 'Anchor BTC': case 'Decentralized BTC': case 'DOR':
    case 'Dual-Token Stablecoin': case 'Algo-Stables': case 'Stablecoin Issuer':
    case 'Reserve Currency': case 'Synthetics': return 'cdp';
    case 'Yield': case 'Farm': case 'Options Vault': case 'Stablecoin Wrapper': return 'yield';
    case 'Derivatives': case 'Perps': case 'Options': case 'Interest Rate Derivatives': return 'derivatives';
    case 'Restaking': case 'Liquid Restaking': case 'Restaked BTC': case 'Collateral Markets': return 'restaking';
    case 'Bridge': case 'Canonical Bridge': case 'Cross Chain Bridge': return 'bridge';
    case 'Liquid Staking': case 'Staking Pool': return 'liquid-staking';
    case 'Launchpad': return 'launchpad';
    case 'Yield Aggregator': case 'Indexes': return 'yield-aggregator';
    case 'Basis Trading': return 'basis';
    case 'Onchain Capital Allocator': return 'allocator';
    case 'Risk Curators': case 'CeDeFi': return 'curator';
    case 'Governance Incentives': return 'governance';
    case 'Payments': return 'payments';
    case 'Crypto Card Issuer': return 'card';
    case 'Insurance': return 'insurance';
    case 'Prediction Market': return 'prediction';
    case 'Chain': return 'chain';
    case 'RWA': return 'rwa';
    case 'CEX': case 'Services': case 'Privacy': case 'Token Locker':
    case 'AI Agents': case 'Decentralized AI': return 'services';
    default: return 'generic';
  }
}

function coreSteps(kind: string, name: string, chain: string, tvl: number): string[] {
  const size = formatUsd(tvl);
  const steps: Record<string, string[]> = {
    dex: [
      `Bridge a small test amount (about 0.05 ETH) to ${chain} using the chain's official bridge (2-15 min).`,
      `Make one swap in ${name}'s main pool and one in its deepest stable pair; keep each trade near $100 to limit slippage and impermanent loss.`,
      `Add liquidity to the largest ${name} pool for at least 30 days; record the entry date and the pool's fee APR before depositing.`,
      `Withdraw and redeposit once to test the exit path, then leave the position running while you watch weekly volume against ${size} of TVL.`,
    ],
    lending: [
      `Bridge a small test amount (about 0.05 ETH) to ${chain} using the chain's official bridge (2-15 min).`,
      `Supply at least $100 of a stablecoin in ${name}'s main market and keep it there 30 or more days.`,
      `Borrow a small amount against it once to register a borrow position; keep LTV below 40% to stay clear of liquidation.`,
      `Repay that borrow if the borrow rate rises above the supply yield; never leave an under-collateralised position open overnight.`,
    ],
    cdp: [
      `Bridge a small test amount (about 0.05 ETH) to ${chain} using the chain's official bridge (2-15 min).`,
      `Mint the smallest practical amount of ${name}'s stablecoin against about $150 of collateral; note the collateral ratio the UI shows.`,
      `Keep the minted stablecoin in the protocol's vault, or use it in one low-risk pool for 30+ days if one is offered.`,
      `Top up collateral once if the ratio nears the liquidation warning line; never let it cross the published minimum.`,
    ],
    yield: [
      `Bridge a small test amount (about 0.05 ETH) to ${chain} using the chain's official bridge (2-15 min).`,
      `Deposit $100 into ${name}'s flagship vault for a full 30-day epoch; save the receipt and the APY displayed at entry.`,
      `Turn on auto-compound if offered, or compound manually after 14 days so you have two distinct interaction dates.`,
      `Compare realised yield with the quoted APY weekly; if it stays under half the quote, treat ${size} of TVL as context, not a promise.`,
    ],
    derivatives: [
      `Bridge a small test amount (about 0.05 ETH) to ${chain} using the chain's official bridge (2-15 min).`,
      `Open the smallest listed perpetual or options position on ${name} (under $50 notional) and close it within 24 hours.`,
      `Place one limit order that does not fill, then cancel it, to register both maker and cancel activity.`,
      `Keep margin usage under 10% of your wallet; ${size} of TVL does not guarantee a deep exit for your position.`,
    ],
    perps: [
      `Bridge a small test amount (about 0.05 ETH) to ${chain} using the chain's official bridge (2-15 min).`,
      `Trade one $25-$50 perpetual position on ${name} with a tight stop; record entry, exit and the funding you paid.`,
      `Hold one low-leverage position across a weekly funding settlement so you register a real funding payment.`,
      `Avoid leverage above 3x; a ${size} TVL figure can shrink quickly in a volatile market.`,
    ],
    rwa: [
      `Complete any required KYC with ${name} before funding; allow 1-3 business days and check which jurisdictions are accepted.`,
      `Fund ${chain} with a little native gas, then subscribe the minimum allowed (often $100-$500) to the main tokenised treasury or credit vault.`,
      `Record the settlement date and the redemption window; RWA positions are often not instantly liquid.`,
      `Read the latest attestation or reserve report monthly and keep copies of every subscription confirmation.`,
    ],
    restaking: [
      `Stake a small amount of ETH (about 0.05) with ${name} on ${chain}; note the restaking contract you delegate to.`,
      `Choose one actively monitored operator set and delegate to it rather than an idle operator.`,
      `Check operator uptime weekly and re-delegate once if it drops; slashing is a real loss, not just a lower yield.`,
      `Keep an exit plan: unstaking queues can take days to weeks, so do not commit funds you may need soon.`,
    ],
    bridge: [
      `Send a small test transfer (about $50) through ${name} from ${chain} to a second chain and record the transaction hash.`,
      `Use the official UI only; bookmark it and verify the destination address character by character before sending.`,
      `Complete one return transfer to register activity in both directions; save both hashes for your records.`,
      `Check monthly volume and audit notices; ${size} of TVL does not remove bridge validator and contract risk.`,
    ],
    'liquid-staking': [
      `Stake about 0.05 ETH with ${name} on ${chain} and note the liquid token you receive and its current peg.`,
      `Use that liquid staking token in one low-risk venue, such as a stable pool or a lending market, for 30 or more days.`,
      `Check the peg and the staking APR weekly; consider exiting if the token trades more than 2% below its underlying.`,
      `Remember a liquid staking token tracks an existing asset; a token of its own, if one launches, is a separate claim.`,
    ],
    launchpad: [
      `Create a wallet used only for ${name} and fund it with a small native balance on ${chain} for fees.`,
      `Connect that wallet and complete any profile, social or sybil-resistance verification the launchpad offers.`,
      `Join the smallest available sale or queue with $50-$100, and record the allocation and refund rules first.`,
      `Read vesting terms carefully; launchpad allocations are frequently locked for months after the sale.`,
    ],
    'yield-aggregator': [
      `Deposit $100 into ${name}'s recommended low-risk strategy for at least 30 days and save the vault receipt.`,
      `Inspect the strategy's underlying allocations weekly; note if it shifts into assets you would not pick yourself.`,
      `Rebalance once manually if the interface offers it, then leave the position to compound for the rest of the month.`,
      `Compare the net APY after all fees with simply holding the underlying asset on ${chain}.`,
    ],
    basis: [
      `Fund ${chain} with $200-$300 and locate ${name}'s spot and perpetual markets for the same asset.`,
      `Open a small spot long and an equal-size perpetual short (delta-neutral, under $100 per leg) to register both sides.`,
      `Record the funding rate and the basis at entry; close the pair when funding turns against you.`,
      `Cap total notional at 10% of your wallet; basis trades can lose money when funding and liquidity shift.`,
    ],
    allocator: [
      `Deposit $100 into one ${name} vault and record which external manager receives the allocation.`,
      `Read the manager's stated strategy and fee terms; check the vault's allocation page every week.`,
      `Make one extra deposit after 14 days to register a second interaction with a different timestamp.`,
      `Withdraw a small portion once to confirm the exit path works before committing more than $100.`,
    ],
    chain: [
      `Create or import a wallet on ${chain} and keep a small native balance (about $20) for fees.`,
      `Bridge $50 of a stablecoin onto ${chain}, then make two ordinary transactions: a swap and a transfer.`,
      `Use one native application on ${chain} for 30 or more days so your address shows sustained activity.`,
      `Follow ${name}'s official announcements for testnet or incentive programmes; participation rules change often.`,
    ],
    curator: [
      `Pick ${name}'s live vault on ${chain}, the cheapest chain it lists, and record the vault address, curator name and current share price before depositing.`,
      `Bridge $100-$200 of USDC to ${chain} through the official bridge and deposit it into that vault; save the receipt and the deposit timestamp.`,
      `Hold the vault shares for 30+ days and check share price, APY and deposit caps every Monday; log any curator parameter change you notice.`,
      `Verify the stablecoin peg weekly and withdraw a small test amount once, so you know the exit works before committing more.`,
    ],
    governance: [
      `Connect a dedicated wallet to ${name} on ${chain} and check whether it has an active proposal, delegation page or incentive campaign.`,
      `Read the current proposal's summary and vote or delegate once with a small, clearly understood position; save the transaction hash.`,
      `Join one public governance call or forum thread and post a short, specific question about the protocol's roadmap.`,
      `Record the quorum and outcome of that vote, then check ${name}'s contributor or rewards page weekly if one exists.`,
    ],
    payments: [
      `Fund a dedicated wallet on ${chain} with a small native balance and $50 of a stablecoin for test transfers.`,
      `Send one small payment through ${name} to an address you control and record the fee, settlement time and transaction hash.`,
      `Repeat once with a different token or corridor to register two distinct payment activities, keeping each transfer under $50.`,
      `Check ${name}'s activity ledger or rebate page weekly; note whether usage is tracked in a way a future token, if one launches, could reward.`,
    ],
    card: [
      `Apply for ${name}'s card with only the minimum required details and complete any identity verification it asks for.`,
      `Fund the card account with $50-$100 from ${chain} and confirm how unsupported regions or spending categories are handled.`,
      `Make one small, ordinary purchase and keep the receipt; avoid cash advances and other high-fee features.`,
      `Check the rewards or transaction history page weekly and record whether spending is credited to any points programme.`,
    ],
    insurance: [
      `Read ${name}'s coverage terms and exclusions; get a quote for the smallest sensible amount of cover before paying anything.`,
      `Buy one short policy or cover note for under $50 from ${chain} and save the policy number and effective dates.`,
      `Record what is covered, what is excluded and the claims process; check the policy page weekly for changes.`,
      `File no claim unless genuinely needed; instead track whether ${name} publishes contributor or user activity metrics.`,
    ],
    prediction: [
      `Connect a dedicated wallet to ${name} on ${chain} and pick a liquid market with a clear resolution date.`,
      `Place one small wager of $10-$25 on an outcome you understand, and record the entry price and potential payout.`,
      `Follow that market to resolution, then place a second small wager in a different market to register repeat activity.`,
      `Read the resolution rules and fee schedule; prediction markets carry total-loss risk and may be restricted by region.`,
    ],
    leverage: [
      `Bridge about 0.05 ETH to ${chain} and supply $150 of a stablecoin as collateral in ${name}'s main lending market.`,
      `Borrow at most 1.5x against that collateral, keep the health factor above 2, and deposit the borrowed amount into the protocol's farm.`,
      `Check the health factor and farm APR twice a week; add collateral or repay if the position approaches liquidation.`,
      `Unwind the whole position once after 14 days to practise the exit, then decide whether to reopen at a safe size.`,
    ],
    services: [
      `Connect a dedicated wallet to ${name} on ${chain} and complete any onboarding or verification it requires.`,
      `Use one core feature with a bounded task under $100, such as a small swap, a locked token or a single subscription, and save the receipt.`,
      `Submit one support ticket or governance piece of feedback with that transaction hash, so your activity is attributable to your address.`,
      `Check ${name}'s usage ledger or contributor page weekly; any future token, if one launches, most often rewards recorded activity.`,
    ],
    generic: [
      `Connect a dedicated wallet to ${name} on ${chain} and complete any onboarding steps it offers.`,
      `Make one small, fully reversible interaction (under $100) using the protocol's main feature.`,
      `Repeat that interaction weekly for at least six weeks and keep a simple log of dates and transaction hashes.`,
      `Review ${name}'s docs and governance forum monthly for signals about a future token, if one launches.`,
    ],
  };
  return steps[kind] ?? steps.generic;
}

function riskNotes(p: Protocol, factors: Factors, derivativeLike: boolean, kind: string): string[] {
  const notes: string[] = [];
  if (kind === 'curator') {
    notes.push('Vault curators can change allocations, caps or parameters; a stablecoin depeg can block a clean exit without notice.');
  }
  if (kind === 'leverage') {
    notes.push('Borrowing amplifies losses: a modest adverse price move can trigger liquidation and take your collateral.');
  }
  if (kind === 'governance' || kind === 'prediction') {
    notes.push('Participation has no guaranteed financial return and any future token, if one launches, may not reward this activity.');
  }
  const change = p.change_7d;
  if (change !== null && change <= -10) {
    notes.push(`TVL fell ${Math.abs(change).toFixed(1)}% in 7 days; a fast outflow may signal users leaving rather than just price movement.`);
  } else if (change !== null && change >= 15) {
    notes.push(`TVL rose ${change.toFixed(1)}% in 7 days; short-term inflows can reverse quickly and inflate apparent momentum.`);
  }
  if (factors.months_without_token === null) {
    notes.push('DefiLlama reports no first-tracked date, so the age factor is neutral and the tokenless runway is unknown.');
  } else if (factors.months_without_token >= 24) {
    notes.push(`No token recorded after ${factors.months_without_token} months of tracking; a long wait is not evidence that a launch is near.`);
  }
  if (derivativeLike) {
    notes.push('The name or category looks wrapped, staked, bridged or exchange-branded; this may be a product of another asset rather than an independent protocol.');
  }
  if (p.chains.length >= 15) {
    notes.push(`Activity spans ${p.chains.length} chains; a wide deployment adds bridge and contract surface area to monitor.`);
  }
  notes.push('Implied value is a model estimate built from TVL, not a forecast and not a promise of a token or an airdrop.');
  return notes;
}

export function farmPlan(p: Protocol, factors: Factors, derivativeLike: boolean): FarmPlan {
  const chain = chainProfile(p.chains);
  const kind = planKind(p.category, derivativeLike);
  const steps = coreSteps(kind, p.name, chain.label, p.tvl_usd);
  const weekly = `Repeat the core action weekly and check ${p.name}'s points or activity page, if it has one, every Monday (2-5 min per check).`;
  const exits: Record<string, string> = {
    rwa: 'Exit criteria: stop after 8-12 weeks if no token launches, and honour the documented redemption window when you leave.',
    curator: 'Exit criteria: withdraw if the curator changes strategy or keys, if the vault reaches its deposit cap, or if the stablecoin depegs more than 2%; otherwise stop after 8-12 weeks with no token launch.',
    leverage: 'Exit criteria: unwind at once if the health factor falls below 1.5 or borrow cost exceeds farm yield, and stop after 8-12 weeks if no token launches.',
    insurance: 'Exit criteria: let the cover lapse rather than renewing blindly, and stop after 8-12 weeks if no token launches.',
  };
  const exit = exits[kind]
    ?? 'Exit criteria: stop after 8-12 weeks if no token launches, or sooner if fees and risk outweigh the value you assign to a possible future token.';
  const low = round(chain.txLow * (steps.length + 2), 2);
  const high = round(chain.txHigh * (steps.length + 2), 2);
  const money = (n: number) => n < 1 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`;
  const farm_cost = `~${money(low)}-${money(high)} in gas on ${chain.label} (${steps.length + 2} transactions at ${money(chain.txLow)}-${money(chain.txHigh)} each)`;
  const timeByKind: Record<string, string> = {
    rwa: '1-3 business days for KYC, 30-45 min setup, monthly reviews',
    chain: '30-45 min setup, 15-20 min weekly check-ins',
    restaking: '25-40 min setup, 10-15 min weekly operator checks',
    bridge: '20-30 min setup, 10-15 min weekly check-ins',
    curator: '20-35 min setup, 10-15 min weekly vault checks for 8-12 weeks',
    governance: '20-30 min setup, 10-20 min per proposal or forum check',
    payments: '15-25 min setup, 5-10 min weekly check-ins',
    card: '20-40 min including verification, 5-10 min weekly checks',
    insurance: '20-35 min quote review, 10 min weekly checks',
    prediction: '15-25 min setup, 10 min weekly market checks',
    leverage: '25-40 min setup, 10-15 min twice-weekly health checks',
  };
  return {
    farm_steps: [...steps, weekly, exit],
    farm_cost,
    farm_time: timeByKind[kind] ?? `${chain.setup} setup, 10-15 min weekly check-ins for 8-12 weeks`,
    risk_notes: riskNotes(p, factors, derivativeLike, kind),
  };
}

export function buildBoard(snapshot: Snapshot): Board {
  const calibration = calibrateRatios(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));

  const candidates = snapshot.protocols
    .filter((p) => classify(p) === 'pre-token' && !watchlist.has(p.slug) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, factors: impliedValue(p, calibration, snapshot.as_of) }))
    .sort((a, b) => b.factors.implied_value_usd - a.factors.implied_value_usd
      || a.p.slug.localeCompare(b.p.slug));

  const picked: { p: Protocol; factors: Factors; onWatchlist: boolean }[] = [];
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (!p || classify(p) !== 'pre-token') continue;
    picked.push({ p, factors: impliedValue(p, calibration, snapshot.as_of), onWatchlist: true });
  }
  for (const entry of candidates) {
    if (picked.length >= 200) break;
    picked.push({ p: entry.p, factors: entry.factors, onWatchlist: false });
  }
  picked.sort((a, b) => b.factors.implied_value_usd - a.factors.implied_value_usd
    || a.p.slug.localeCompare(b.p.slug));

  const rows: Row[] = picked.map((entry, index) => {
    const derivativeLike = isDerivativeLike(entry.p);
    return {
      slug: entry.p.slug,
      name: entry.p.name,
      rank: index + 1,
      implied_value_usd: entry.factors.implied_value_usd,
      category: entry.p.category,
      chains: entry.p.chains,
      tvl_usd: entry.p.tvl_usd,
      change_7d: entry.p.change_7d,
      listed_at: entry.p.listed_at,
      months_without_token: entry.factors.months_without_token,
      on_watchlist: entry.onWatchlist,
      derivative_like: derivativeLike,
      token_class: classify(entry.p),
      factors: entry.factors,
      ...farmPlan(entry.p, entry.factors, derivativeLike),
    };
  });

  const tokens = snapshot.protocols
    .filter((p) => classify(p) === 'token-trading')
    .slice()
    .sort((a, b) => b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug))
    .slice(0, 30)
    .map((p): TokenRow => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      mcap_tvl_ratio: round(p.mcap_usd! / p.tvl_usd, 6),
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      symbol: p.symbol,
    }));

  const categoryMedians: Record<string, { ratio: number; sample_size: number; basis: string }> = {};
  for (const [key, value] of [...calibration.byCategory].sort((a, b) => a[0].localeCompare(b[0]))) {
    categoryMedians[key] = { ratio: round(value.ratio, 6), sample_size: value.n, basis: value.basis };
  }

  return {
    schema: 'prelaunch-radar/board/v1',
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    value_model: {
      formula: 'implied = TVL x median(mcap/TVL of token-trading peers in the same category, or all peers when fewer than 5 are available, clamped to 0.02-3.0) x (1 + clamp(change_7d/100, -0.3, 0.3)) x clamp(1.2 - months_without_token/60, 0.7, 1.2) x (1 + 0.015 x min(chains, 8)); rounded to whole dollars, minimum $1',
      ratio_band: RATIO_BAND,
      min_category_sample: MIN_CATEGORY_SAMPLE,
      all_protocol_median_ratio: round(calibration.all, 6),
      calibration_count: calibration.count,
      category_medians: categoryMedians,
    },
    counts: {
      protocols: snapshot.protocols.length,
      pre_token: snapshot.protocols.filter((p) => classify(p) === 'pre-token').length,
      token_trading: snapshot.protocols.filter((p) => classify(p) === 'token-trading').length,
      watchlist: snapshot.watchlist.length,
      rows: rows.length,
      tokens_trading: tokens.length,
    },
    rows,
    tokens_trading: tokens,
  };
}
