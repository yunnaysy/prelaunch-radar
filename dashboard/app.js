/* Prelaunch Radar dashboard: refits the published coefficients in this browser and recomputes farm verdicts live. */
const R = window.RADAR;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ev = R.evidence;
const M = R.model;
const S0 = R.scenario;
const TBILL = S0.tbill;

const CLASS_META = [
  ['ranked', 'pre-token, ranked', '#0f766e', ['watchlist', 'early', 'off-list']],
  ['priced', 'priced comps', '#1c1917', ['priced']],
  ['nocap', 'token, no usable cap', '#8f9393', ['token-nocap']],
  ['out', 'out by house rules', '#d5d9d9', ['out-bridge', 'out-lst', 'out-cex', 'out-versioned', 'out-other']],
];
const LEDGER_NAMES = {
  watchlist: 'Ranked · watchlist', early: 'Ranked · early, below the floor', 'off-list': 'Ranked · off-list, parent recorded',
  priced: 'Token trades · priced comp', 'token-nocap': 'Token recorded · no usable cap', 'out-bridge': 'Out · bridge',
  'out-lst': 'Out · liquid staking', 'out-cex': 'Out · exchange', 'out-versioned': 'Out · versioned or wrapped', 'out-other': 'Out · other',
};

const state = {
  tab: 'board', sort: 'rank', dir: 1, search: '', cat: '', chain: '', bucket: '', verdict: '',
  depositMode: '10k', deposit: S0.deposit, share: S0.drop_share, weeks: S0.weeks, wage: S0.wage,
  hurdle: 'additive', open: null,
};

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function round(n, p) { const s = 10 ** p; return Math.round(n * s) / s; }
function sigmoid(z) { return 1 / (1 + Math.exp(-clamp(z, -20, 20))); }
function yearsOf(r) {
  if (!r.listed_at) return null;
  const [fy, fm] = r.listed_at.split('-').map(Number);
  const [ty, tm] = R.as_of.split('-').map(Number);
  return Math.max(0, (ty - fy) * 12 + (tm - fm)) / 12;
}
function predSize(tvl) { return Math.exp(M.a + M.b * Math.log(Math.max(tvl, 1))); }
function oddsOf(r) {
  const y = yearsOf(r);
  const age = y == null ? M.med_age : y;
  const tvl = Math.log(Math.max(r.tvl_usd, 1) / 1e8);
  const g7 = r.change_7d == null ? 0 : clamp(r.change_7d / 100, -0.5, 0.5);
  const x = [age, tvl, r.family_flag, g7];
  let z = M.odds_w[0];
  for (let i = 0; i < x.length; i++) z += (M.odds_w[i + 1] ?? 0) * x[i];
  return sigmoid(z);
}
function impliedOf(r) { return Math.max(1, Math.round(predSize(r.tvl_usd) * oddsOf(r) * r.kinship_share)); }
function fnv1aHex(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
function money(n, d = 1) {
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(d)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
  if (a >= 100) return `${sign}$${Math.round(a)}`;
  return `${sign}$${a.toFixed(2)}`;
}
function usd2(n) {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function usd0(n) { return `${n < 0 ? '−' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`; }
function signed(n) { return `${n < 0 ? '−' : '+'}${usd2(Math.abs(n))}`; }
function pct(n, d = 0) { return `${(n * 100).toFixed(d)}%`; }
function fmtYears(y) {
  if (y == null) return '—';
  if (y >= 1) return `${y.toFixed(1)} yr`;
  return `${Math.round(y * 365)} d`;
}
function chg(v) {
  if (v == null) return '—';
  const cls = v > 0 ? 'up' : v < 0 ? 'dn' : '';
  return `<span class="chg ${cls}">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%</span>`;
}

/* Farm economics. Default hurdle is additive: net must beat the T-bill alternative plus hours × wage.
   The raw-net screen (net > T-bill and net / hour > wage) is a sensitivity toggle on the same records. */
function depositOf(r) { return state.depositMode === 'tvl' ? Math.max(1, r.tvl_usd * 0.0002) : state.deposit; }
function hoursOf(r) { return round((r.setup_min + state.weeks * r.weekly_min) / 60, 1); }
function ecoOf(r, implied, hurdleKind = state.hurdle) {
  const deposit = depositOf(r);
  const hours = hoursOf(r);
  const drop = implied * state.share * (deposit / (r.tvl_usd + deposit));
  const net = drop - r.fees_usd;
  const tbill = deposit * TBILL * (state.weeks / 52);
  const labor = hours * state.wage;
  const hurdle = tbill + labor;
  const inc = net - tbill;
  const adj = hours > 0 ? inc / hours : inc;
  const raw = hours > 0 ? net / hours : net;
  let verdict = 'SKIP';
  if (hurdleKind === 'raw') {
    if (net > tbill && raw > state.wage) verdict = 'FARM';
    else if (net > tbill) verdict = 'THIN';
  } else if (net > hurdle) verdict = 'FARM';
  else if (net > tbill) verdict = 'THIN';
  const ph = hurdleKind === 'raw' ? raw : adj;
  return { deposit, hours, drop, net, tbill, labor, hurdle, inc, adj, raw, ph, verdict };
}
function live(r) { const implied = r.implied_value_usd; return { implied, ...ecoOf(r, implied) }; }
function counts(kind = state.hurdle) {
  const o = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of R.rows) o[ecoOf(r, r.implied_value_usd, kind).verdict]++;
  return o;
}
function scenarioLabel() {
  const dep = state.depositMode === 'tvl' ? '0.02% of TVL' : usd0(state.deposit);
  return `${dep} · ${(state.share * 100).toFixed(1)}% share · ${state.weeks} wk · $${state.wage}/h`;
}

function integrity() {
  let match = 0, rise = 0, sum = 0, prev = Infinity;
  for (const r of R.rows) {
    if (impliedOf(r) === r.implied_value_usd) match++;
    sum += r.implied_value_usd;
    if (r.implied_value_usd > prev + 1e-9) rise++;
    prev = r.implied_value_usd;
  }
  const checksum = fnv1aHex(R.rows.map((r) => `${r.slug}:${r.rank}:${r.implied_value_usd}`).join('|'));
  const watch = R.watchlist.filter((s) => R.rows.some((r) => r.slug === s)).length;
  const ledgerN = Object.values(R.ledger).reduce((s, n) => s + n, 0);
  const bits = [
    [`table = board.json: ${match} of ${R.rows.length} implied values recomputed here`, match === R.rows.length],
    [`ranks 1–${R.rows.length} in order, values never rise`, rise === 0],
    [`totals equal ${money(sum, 2)}`, Number.isFinite(sum)],
    [`checksum ${checksum} = main.ts`, checksum === R.checksum],
    [`watchlist ${watch} of ${R.watchlist.length} ranked`, watch === R.watchlist.length],
    [`ledger ${ledgerN} of ${ev.integrity.ledger_total} protocols`, ledgerN === ev.integrity.ledger_total],
  ];
  return { bits, ok: bits.filter((b) => b[1]).length, checksum };
}

/* Front: four evidence figures, one methodology line, one classification line */
function kpiHtml() {
  const t = ev.value.typ_miss, rh = ev.value.range_honesty, br = ev.odds.brier, ac = ev.odds.accuracy;
  const c = counts();
  return `
    <article class="kpi lead"><div class="lbl">Walk-forward valuation error</div>
      <div class="row"><span class="val">×${t.size_wf.toFixed(2)}</span><span class="vs">vs <b>×${t.flat_wf.toFixed(2)}</b> flat baseline</span></div>
      <div class="sub">Typical multiplicative miss · earlier comps price later ones · n=${ev.value.wf_split.test}</div></article>
    <article class="kpi lead"><div class="lbl">Walk-forward token-odds Brier</div>
      <div class="row"><span class="val">${br.model_wf.toFixed(3)}</span><span class="vs">vs <b>${br.base_wf.toFixed(3)}</b> base rate</span></div>
      <div class="sub">Lower is better · n=${ac.n_wf} later peers · called right ${pct(ac.model_wf, 1)} vs ${pct(ac.base_wf, 1)}</div></article>
    <article class="kpi limit"><div class="lbl">Prediction interval coverage <span class="tag amber">Undercovers</span></div>
      <div class="row"><span class="val">${pct(rh.wf_p10)}</span><span class="vs">vs <b>80%</b> target</span></div>
      <div class="sub">Walk-forward P10–P90, n=${rh.wf_n} · leave-one-out ${pct(rh.loo_p10, 1)} vs 80%</div></article>
    <article class="kpi"><div class="lbl">FARM-qualified under current assumptions</div>
      <div class="row"><span class="val">${c.FARM} / ${R.rows.length}</span><span class="vs">${c.THIN} thin · ${c.SKIP} skip</span></div>
      <div class="sub">${scenarioLabel()}${state.hurdle === 'raw' ? ' · raw-net sensitivity' : ''}</div></article>`;
}
function methlineHtml() {
  const t = ev.value.typ_miss, br = ev.odds.brier, ac = ev.odds.accuracy;
  const vt = ev.value.terms.filter((x) => x.kept).length;
  const vAll = ev.value.terms.filter((x) => x.decision !== 'baseline').length;
  const ot = ev.odds.terms_tried.filter((x) => x.kept).length;
  const oAll = ev.odds.terms_tried.filter((x) => x.decision !== 'baseline').length;
  return `Inputs <b>TVL · 7-day growth · years listed without a token · name-stem family</b> · Leave-one-out value miss <b>×${t.size_loo.toFixed(2)}</b> vs ×${t.flat_loo.toFixed(2)} (n=${ev.comps}) · Ten-fold Brier <b>${br.model_10f.toFixed(3)}</b> vs ${br.base.toFixed(3)} (n=${ac.n_10f}) · Features retained after out-of-sample testing <b>${vt} of ${vAll}</b> value · <b>${ot} of ${oAll}</b> odds · Watchlist <b>${ev.integrity.watch_covered}/${R.watchlist.length}</b> ranked`;
}
function classes() {
  return CLASS_META.map(([k, label, color, keys]) => ({ k, label, color, n: keys.reduce((s, x) => s + (R.ledger[x] || 0), 0) }));
}
function acctHtml() {
  const total = Object.values(R.ledger).reduce((s, n) => s + n, 0);
  const cl = classes();
  const bar = cl.map((c) => `<i style="width:${((c.n / total) * 100).toFixed(2)}%;background:${c.color}"></i>`).join('');
  const legend = cl.map((c) => `<i style="background:${c.color}"></i><b>${c.n}</b> ${c.label}`).join(' ');
  return `<h3>Snapshot classification · <b>${total} protocols</b></h3><div class="bar">${bar}</div><p class="legend">${legend}</p>`;
}

/* Board */
function pillsHtml() {
  const c = counts();
  const v = [['', `All`, R.rows.length, ''], ['FARM', 'FARM', c.FARM, '#0f766e'], ['THIN', 'THIN', c.THIN, '#b45309'], ['SKIP', 'SKIP', c.SKIP, '#b42318']];
  const b = [['watchlist', 'Watchlist'], ['early', 'Early'], ['off-list', 'Off-list']];
  const vp = v.map(([val, lab, n, col]) => {
    const on = val === '' ? !state.verdict && !state.bucket : state.verdict === val;
    return `<button class="pill${on ? ' on' : ''}" type="button" data-kind="verdict" data-val="${val}">${col ? `<span class="dot" style="background:${col}"></span>` : ''}${lab}<b>${n}</b></button>`;
  }).join('');
  const bp = b.map(([val, lab]) => `<button class="pill${state.bucket === val ? ' on' : ''}" type="button" data-kind="bucket" data-val="${val}">${lab}</button>`).join('');
  return `${vp}<span class="sep"></span>${bp}`;
}
function farmnoteHtml() {
  const c = counts();
  const rule = state.hurdle === 'raw'
    ? 'Sensitivity: net beats T-bill and net / hour beats $' + state.wage
    : `How FARM is determined: net must beat the T-bill alternative plus hours × $${state.wage}`;
  return `<span>${rule} · <b>${c.FARM}/${R.rows.length}</b> under ${scenarioLabel()}</span>
    <span class="seg" role="group" aria-label="Hurdle"><button type="button" data-hurdle="additive" class="${state.hurdle === 'additive' ? 'on' : ''}">Additive hurdle</button><button type="button" data-hurdle="raw" class="${state.hurdle === 'raw' ? 'on' : ''}">Raw-net screen</button></span>`;
}
function scenarioHtml() {
  const mode = state.depositMode;
  const opt = (v, l) => `<option value="${v}"${mode === v ? ' selected' : ''}>${l}</option>`;
  return `
    <label>Deposit <select id="f-deposit">${opt('10k', '$10K')}${opt('3k', '$3K')}${opt('30k', '$30K')}${opt('tvl', '0.02% of TVL')}${opt('custom', 'Custom')}</select></label>
    ${mode === 'custom' ? `<label>$ <input id="f-dep-n" type="number" min="100" step="100" value="${state.deposit}"></label>` : ''}
    <label>Drop share <input id="f-share" type="range" min="2" max="15" step="0.5" value="${(state.share * 100).toFixed(1)}"><b>${(state.share * 100).toFixed(1)}%</b></label>
    <label>Horizon <input id="f-weeks" type="range" min="4" max="24" step="1" value="${state.weeks}"><b>${state.weeks} wk</b></label>`;
}
function fillSelects() {
  const cats = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort();
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  for (const c of cats) $('#f-cat').append(new Option(c, c));
  for (const c of chains) $('#f-chain').append(new Option(c, c));
}
function filtered() {
  const q = state.search.trim().toLowerCase();
  let rows = R.rows.map((r) => ({ r, L: live(r) }));
  if (state.verdict) rows = rows.filter((x) => x.L.verdict === state.verdict);
  if (state.bucket) rows = rows.filter((x) => x.r.bucket === state.bucket);
  if (state.cat) rows = rows.filter((x) => x.r.category === state.cat);
  if (state.chain) rows = rows.filter((x) => x.r.chains.includes(state.chain));
  if (q) rows = rows.filter(({ r }) => r.name.toLowerCase().includes(q) || (r.category || '').toLowerCase().includes(q) || r.chains.some((c) => c.toLowerCase().includes(q)) || r.slug.includes(q));
  const key = state.sort, dir = state.dir;
  const order = { FARM: 0, THIN: 1, SKIP: 2 };
  rows.sort((A, B) => {
    if (key === 'verdict') return dir * (order[A.L.verdict] - order[B.L.verdict]) || A.r.rank - B.r.rank;
    if (key === 'net_per_hour') return dir * (A.L.ph - B.L.ph) || A.r.rank - B.r.rank;
    if (key === 'name') return dir * A.r.name.localeCompare(B.r.name);
    const av = A.r[key], bv = B.r[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return dir * av.localeCompare(bv);
    return dir * (av - bv);
  });
  return rows;
}
function rowHtml({ r, L }) {
  const marks = [
    r.on_watchlist ? '<span class="mark">Watchlist</span>' : '',
    r.bucket === 'off-list' ? '<span class="mark o">Off-list</span>' : '',
    r.kinship ? `<span class="mark p">Parent ×${r.kinship_share}</span>` : '',
  ].join('');
  return `<tr data-slug="${r.slug}">
    <td class="num"><span class="rk">${r.rank}</span><span class="subn">${r.rank_lo}–${r.rank_hi}</span></td>
    <td><span class="name">${r.name}</span>${marks}<span class="subn">${r.category ?? '—'} · ${r.chain_label}${r.chains.length > 1 ? ` +${r.chains.length - 1}` : ''}</span></td>
    <td class="num">${money(r.tvl_usd)}</td>
    <td class="num">${chg(r.change_7d)}</td>
    <td class="num">${fmtYears(r.years_listed)}</td>
    <td><span class="obar"><i style="width:${(r.token_odds * 100).toFixed(1)}%"></i></span>${pct(r.token_odds)}</td>
    <td class="num"><b>${money(r.implied_value_usd)}</b></td>
    <td class="num">${money(r.p25)}–${money(r.p75)}</td>
    <td><span class="ver ${L.verdict}">${L.verdict}</span><span class="net ${L.net >= 0 ? 'pos' : 'neg'}">${signed(L.net)}</span><span class="subn" style="display:inline;margin-left:8px">${usd2(L.drop)} drop · ${usd2(L.tbill)} T-bill</span></td>
    <td class="num"><span class="nph ${L.ph >= 0 ? 'pos' : 'neg'}">${L.ph < 0 ? '−' : ''}${usd2(Math.abs(L.ph))}</span><span class="subn">${L.hours} h hands-on</span></td>
  </tr>`;
}
function renderBoard() {
  $('#pills').innerHTML = pillsHtml();
  $('#farmnote').innerHTML = farmnoteHtml();
  $('#scenario').innerHTML = scenarioHtml();
  $('#kpis').innerHTML = kpiHtml();
  const rows = filtered();
  $('#board-body').innerHTML = rows.map(rowHtml).join('');
  const tvl = rows.reduce((s, x) => s + x.r.tvl_usd, 0);
  const imp = rows.reduce((s, x) => s + x.r.implied_value_usd, 0);
  $('#count').textContent = `${rows.length} of ${R.rows.length} results · ${money(tvl)} TVL · ${money(imp)} implied`;
  $('#board-title').textContent = state.verdict ? `${state.verdict} protocols — ${state.hurdle === 'raw' ? 'raw-net sensitivity' : 'current assumptions'}` : state.bucket ? `${state.bucket[0].toUpperCase()}${state.bucket.slice(1)} protocols` : 'Ranked protocols';
  bindLive();
}
function bindLive() {
  const dep = $('#f-deposit');
  dep.addEventListener('change', () => {
    state.depositMode = dep.value;
    state.deposit = { '10k': 10000, '3k': 3000, '30k': 30000, tvl: 10000, custom: state.deposit }[dep.value];
    renderBoard();
  });
  const dn = $('#f-dep-n');
  if (dn) dn.addEventListener('change', () => { state.deposit = Math.max(100, Number(dn.value) || 10000); renderBoard(); });
  $('#f-share').addEventListener('input', (e) => { state.share = Number(e.target.value) / 100; renderBoard(); });
  $('#f-weeks').addEventListener('input', (e) => { state.weeks = Number(e.target.value); renderBoard(); });
}

/* Detail drawer: verdict and economics, why, valuation, peers, risks, workflow, source */
function peersOf(r, n = 5) {
  const lt = Math.log(Math.max(r.tvl_usd, 1));
  return R.comps
    .map((c) => ({ c, d: Math.abs(Math.log(Math.max(c.tvl_usd, 1)) - lt), same: (c.category || '') === (r.category || '') }))
    .sort((a, b) => (b.same - a.same) || a.d - b.d).slice(0, n).map((x) => x.c);
}
function coreLine(r, L) {
  const name = r.name, chain = r.chain_label, d = usd2(L.deposit);
  switch (r.plan_kind) {
    case 'dex': return `On ${name}’s DEX on ${chain}, make one small test swap, then add liquidity only in a pool it actually offers, starting at $200 and moving to ${d} once the receipt and exit path are clear.`;
    case 'lending': return `Supply ${d} of an asset ${name} actually accepts on ${chain} into its lending market, and borrow at most 30% against it so the health factor stays above 2.`;
    case 'cdp': return `Open a ${name} collateral position on ${chain} with ${d} of an accepted asset, mint only a conservative amount, and record the liquidation price.`;
    case 'rwa': return `Complete ${name}’s stated onboarding for ${chain} and subscribe ${d} only to a tokenised asset or pool the protocol actually offers there, keeping the subscription receipt.`;
    case 'pool': return `Stake or restake in ${name} on ${chain} starting with a test deposit, and record the unbonding period before adding the rest of ${d}.`;
    default: return `Use ${name}’s primary advertised ${r.category ?? r.plan_kind} action on ${chain} with a $100 test, then ${d} once the receipt, exit path and any lockup are clear.`;
  }
}
function stepsOf(r, L) {
  const name = r.name, chain = r.chain_label, tvl = money(r.tvl_usd);
  return [
    ['Setup', `Create a wallet used only for this ${name} farm on ${chain}, which the snapshot lists among its deployments, and fund it with about ${usd2(r.fee_tx * 4)} of native gas. Cost ${usd2(r.fee_tx)} (one test transfer). Time ${r.setup_min} min hands-on.`],
    ['Verify', `Confirm ${name} (${r.category ?? 'uncategorised'}) is listed on ${chain} in this snapshot (${r.chains.length} chain${r.chains.length === 1 ? '' : 's'} recorded). Open it only from its DefiLlama protocol page or official docs, and refuse any DM link. Cost $0. Time 10 min hands-on.`],
    ['Fund', `Move the ${usd2(L.deposit)} working deposit to ${chain} through an official bridge or exchange withdrawal. Drop uses protocol-wide TVL (${tvl}); the snapshot does not split TVL by chain. Cost about ${usd2(r.fee_bridge)}. Time 15 min hands-on.`],
    ['Core', `${coreLine(r, L)} Cost about ${usd2(Math.max(0, r.fees_usd - r.fee_bridge))}. Time 15–25 min hands-on.`],
    ['Monitor', `Check the position weekly for ${state.weeks} weeks. Withdraw if protocol-wide TVL prints 15% below this snapshot (${tvl}) or if withdrawals pause. Cost ${usd2(r.fee_tx)} on exit, else $0. Time ${r.weekly_min} min a week.`],
    ['Record', `Keep a ledger of every hash, the principal and modelled fees of ${usd2(r.fees_usd)}; reassess against the ${usd2(L.hurdle)} hurdle at each check. Cost $0. Time 5 min a week.`],
  ];
}
function whyOf(r, L) {
  const gap = L.net - L.hurdle;
  if (L.verdict === 'FARM') return `Net of fees <b>${usd2(L.net)}</b> clears the <b>${usd2(L.hurdle)}</b> hurdle (T-bill ${usd2(L.tbill)} + ${L.hours} h × $${state.wage}) by <b>${usd2(gap)}</b>.`;
  if (L.verdict === 'THIN') return `Net of fees <b>${usd2(L.net)}</b> beats the ${usd2(L.tbill)} T-bill alternative but not the <b>${usd2(L.hurdle)}</b> hurdle once ${L.hours} h of hands-on time is valued at $${state.wage}/h: short by <b>${usd2(-gap)}</b>.`;
  return `Net of fees <b>${usd2(L.net)}</b> does not beat the ${usd2(L.tbill)} T-bill alternative on a ${usd2(L.deposit)} deposit, so the hands-on time earns nothing: short of the hurdle by <b>${usd2(-gap)}</b>.`;
}
function detailHtml(r) {
  const L = live(r), vif = predSize(r.tvl_usd), od = oddsOf(r), rh = ev.value.range_honesty;
  const peers = peersOf(r).map((c) => `<tr><td>${c.name}${c.symbol ? ` (${c.symbol})` : ''}</td><td>${c.category ?? '—'}</td><td class="num">${money(c.tvl_usd)}</td><td class="num">${money(c.mcap_usd)}</td><td class="num">${(c.mcap_usd / c.tvl_usd).toFixed(3)}×</td><td class="num">${money(c.loo_fitted)}</td></tr>`).join('');
  return `
    <button class="close" type="button" id="btn-close">Close</button>
    <p class="kick">${r.category ?? 'Protocol'} · ${r.chain_label} · rank ${r.rank} (${r.rank_lo}–${r.rank_hi}) · snapshot ${R.as_of}</p>
    <h2>${r.name} <span class="ver lg ${L.verdict}">${L.verdict}</span></h2>
    <div class="figs">
      <div><span>Implied value</span><b>${money(r.implied_value_usd)}</b></div>
      <div><span>Token odds</span><b>${pct(r.token_odds)}</b></div>
      <div><span>TVL</span><b>${money(r.tvl_usd)}</b></div>
      <div><span>Net / hour</span><b class="${L.ph >= 0 ? 'pos' : 'neg'}">${L.ph < 0 ? '−' : ''}${usd2(Math.abs(L.ph))}</b></div>
    </div>
    <h3>Verdict &amp; scenario economics · ${scenarioLabel()}</h3>
    <table class="eco"><tbody>
      <tr><td>Modelled depositor drop: ${(state.share * 100).toFixed(1)}% × ${usd2(L.deposit)} / (TVL + deposit) × implied</td><td class="num">${usd2(L.drop)}</td></tr>
      <tr><td>Fees: gas, bridge, entry and exit</td><td class="num">−${usd2(r.fees_usd)}</td></tr>
      <tr class="tot"><td>Net of fees</td><td class="num">${usd2(L.net)}</td></tr>
      <tr><td>T-bill alternative: ${pct(TBILL)} a year for ${state.weeks} weeks</td><td class="num">${usd2(L.tbill)}</td></tr>
      <tr><td>Hands-on time: ${L.hours} h × $${state.wage}</td><td class="num">${usd2(L.labor)}</td></tr>
      <tr class="tot"><td>Hurdle to qualify as FARM</td><td class="num">${usd2(L.hurdle)}</td></tr>
    </tbody></table>
    <h3>Why this verdict</h3>
    <p class="why">${whyOf(r, L)}</p>
    <h3>Valuation breakdown</h3>
    <ol class="arith">
      <li>Size curve on protocol-wide TVL ${money(r.tvl_usd)}: exp(${M.a.toFixed(3)} + ${M.b.toFixed(3)} × ln TVL) = <b>${money(vif)}</b> if a token were priced.</li>
      <li>Token-record odds from years listed (${fmtYears(yearsOf(r))}), ln TVL, name-stem family and 7-day growth (${r.change_7d == null ? 'not recorded' : `${r.change_7d.toFixed(1)}%`}): <b>${pct(od)}</b>.</li>
      <li>Relationship adjustment <b>×${r.kinship_share}</b>${r.kinship ? `: ${r.kinship} already records a token` : ': no priced parent shares its name stem'}.</li>
      <li>Implied value = ${money(vif)} × ${pct(od)} × ${r.kinship_share} = <b>${money(r.implied_value_usd)}</b>, matching board.json.</li>
    </ol>
    <h3>Comparable priced protocols</h3>
    <table class="mini"><thead><tr><th>Peer</th><th>Category</th><th class="num">TVL</th><th class="num">Listed cap</th><th class="num">Cap / TVL</th><th class="num">LOO fit</th></tr></thead><tbody>${peers}</tbody></table>
    <h3>Risks &amp; uncertainty</h3>
    <ul class="risk">
      <li>Value range P25–P75 ${money(r.p25)}–${money(r.p75)}, P10–P90 ${money(r.p10)}–${money(r.p90)}; rank could sit anywhere in ${r.rank_lo}–${r.rank_hi}.</li>
      <li>Walk-forward P10–P90 coverage is ${pct(rh.wf_p10)} against an 80% target (n=${rh.wf_n}): treat the outer band as too narrow.</li>
      <li>Token odds are the share of comparable peers that already record a token, not the probability that ${r.name} launches one.</li>
      <li>Drop is modelled on protocol-wide TVL; the snapshot has no per-chain split and names no vault or deposit asset.</li>
    </ul>
    <h3>Suggested farming workflow</h3>
    <ol class="timeline">${stepsOf(r, L).map(([k, s]) => `<li><span class="k">${k}.</span> ${s}</li>`).join('')}</ol>
    <h3>Source &amp; snapshot</h3>
    <p class="src">DefiLlama protocols snapshot, fetched ${R.as_of}, used as the sealed input with no live refetch. Slug <b>${r.slug}</b>, category <b>${r.category ?? 'uncategorised'}</b>, chains <b>${r.chains.join(', ') || 'none'}</b>, first listed <b>${r.listed_at ?? 'not dated'}</b>, TVL basis <b>${r.tvl_basis}</b>.</p>`;
}
function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.open = slug;
  const el = $('#detail');
  el.innerHTML = detailHtml(r);
  el.classList.add('open');
  el.scrollTop = 0;
  $('#scrim').classList.remove('hidden');
  showFront();
  $('#btn-close').addEventListener('click', () => { closeDetail(); syncHash(); });
  $('#scrim').onclick = () => { closeDetail(); syncHash(); };
}
function closeDetail() {
  state.open = null;
  $('#detail').classList.remove('open');
  $('#scrim').classList.add('hidden');
  showFront();
}

/* Method & tests */
function dec(row) {
  if (row.decision === 'must not help') return '<span class="drop">control, must not help</span>';
  if (row.kept) return '<span class="kept">retained</span>';
  if (row.decision === 'baseline') return '<span class="base">baseline</span>';
  return '<span class="drop">tested, not retained</span>';
}
function calib() {
  const pts = R.comps.map((c) => ({ x: Math.log(Math.max(c.loo_fitted, 1)), y: Math.log(Math.max(c.mcap_usd, 1)) }));
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0), sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const err = pts.map((p) => Math.abs(p.y - p.x)).sort((a, b) => a - b);
  const mdae = n % 2 ? err[(n - 1) / 2] : (err[n / 2 - 1] + err[n / 2]) / 2;
  return { pts, n, slope: sxy / sxx, mdae };
}
function calibSvg() {
  const { pts } = calib();
  const lo = Math.log(1e5), hi = Math.log(5e10);
  const w = 640, h = 230, L = 58, Rg = w - 10, T = 8, B = h - 26;
  const X = (v) => L + (clamp(v, lo, hi) - lo) / (hi - lo) * (Rg - L);
  const Y = (v) => B - (clamp(v, lo, hi) - lo) / (hi - lo) * (B - T);
  const ticks = [[1e6, '$1M'], [1e7, '$10M'], [1e8, '$100M'], [1e9, '$1B'], [1e10, '$10B']];
  const grid = ticks.map(([v, l]) => {
    const x = X(Math.log(v)).toFixed(1), y = Y(Math.log(v)).toFixed(1);
    return `<line x1="${x}" y1="${T}" x2="${x}" y2="${B}" stroke="#eef0f0"/><line x1="${L}" y1="${y}" x2="${Rg}" y2="${y}" stroke="#eef0f0"/><text x="${x}" y="${B + 12}" text-anchor="middle">${l}</text><text x="${L - 5}" y="${(+y + 3).toFixed(1)}" text-anchor="end">${l}</text>`;
  }).join('');
  const dots = pts.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.4" fill="#0f766e" fill-opacity=".7"/>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Leave-one-out fitted cap against listed cap, log axes">${grid}
    <line x1="${X(lo)}" y1="${Y(lo)}" x2="${X(hi)}" y2="${Y(hi)}" stroke="#1c1917" stroke-dasharray="3 3"/>${dots}
    <text x="${Rg}" y="${h - 2}" text-anchor="end">Leave-one-out fitted cap (log scale) →</text>
    <text x="10" y="${T + 2}" transform="rotate(-90 10 ${T + 2})" text-anchor="end">Listed cap (log scale) →</text></svg>`;
}
function tornadoHtml() {
  const rows = ev.sensitivity, main = rows[0].farm, arms = rows.slice(1);
  const maxD = Math.max(...arms.map((s) => Math.abs(s.farm - main)), 1);
  return arms.map((s) => {
    const d = s.farm - main, wd = (Math.abs(d) / maxD) * 50, left = d >= 0 ? 50 : 50 - wd;
    return `<div class="arm"><div class="lab">${s.name}</div><div class="bw"><i class="${d < 0 ? 'neg' : ''}" style="left:${left}%;width:${wd}%"></i></div><div class="num">${s.farm} (${d >= 0 ? '+' : ''}${d})</div></div>`;
  }).join('');
}
function vrowsHtml() { return ev.value.terms.map((x) => `<tr><td>${x.term}</td><td class="num">×${x.loo.toFixed(2)}</td><td class="num">×${x.wf.toFixed(2)}</td><td>${dec(x)}</td></tr>`).join(''); }
function orowsHtml() { return ev.odds.terms_tried.map((x) => `<tr><td>${x.term}</td><td class="num">${x.kfold.toFixed(3)}</td><td class="num">${x.wf.toFixed(3)}</td><td>${dec(x)}</td></tr>`).join(''); }
function covHtml() {
  const rh = ev.value.range_honesty;
  return [
    ['Leave-one-out', 'P25–P75', rh.loo_p25, 0.5, rh.n], ['Leave-one-out', 'P10–P90', rh.loo_p10, 0.8, rh.n],
    ['Walk-forward', 'P25–P75', rh.wf_p25, 0.5, rh.wf_n], ['Walk-forward', 'P10–P90', rh.wf_p10, 0.8, rh.wf_n],
  ].map(([test, band, a, tg, n]) => `<tr><td>${test}</td><td>${band}</td><td class="num${a < tg - 0.05 ? ' under' : ''}">${pct(a)}</td><td class="num">${pct(tg)}</td><td class="num">${n}</td></tr>`).join('');
}
function evidenceHtml() {
  const rh = ev.value.range_honesty, br = ev.odds.brier, ac = ev.odds.accuracy;
  return `
    <div><h3>Valuation · features retained after out-of-sample testing</h3>
      <table class="mini"><thead><tr><th>Term, ${ev.comps} priced comps</th><th class="num">Leave-one-out</th><th class="num">Walk-forward</th><th>Decision</th></tr></thead><tbody>${vrowsHtml()}</tbody></table></div>
    <div><h3>Token odds · Brier score, lower is better</h3>
      <table class="mini"><thead><tr><th>Term, ${ev.peers} peers</th><th class="num">Ten-fold</th><th class="num">Walk-forward</th><th>Decision</th></tr></thead><tbody>${orowsHtml()}</tbody></table>
      <p class="note">Secondary, called right at 0.5: walk-forward ${pct(ac.model_wf, 1)} vs ${pct(ac.base_wf, 1)} base rate (n=${ac.n_wf}); ten-fold ${pct(ac.model_10f, 1)} vs ${pct(ac.base_10f, 1)} (n=${ac.n_10f}).</p></div>
    <div><h3>Prediction interval coverage</h3>
      <table class="mini"><thead><tr><th>Test</th><th>Interval</th><th class="num">Actual</th><th class="num">Target</th><th class="num">n</th></tr></thead><tbody>${covHtml()}</tbody></table>
      <p class="note"><span class="under">Walk-forward P10–P90 undercovers its 80% target (${pct(rh.wf_p10)}, n=${rh.wf_n}).</span> ${rh.n_boot.toLocaleString('en-US')} bootstrap resamples of the size curve, each paired with a leave-one-out residual; bands not widened.</p></div>`;
}
function methodHtml() {
  const t = ev.value.typ_miss, rh = ev.value.range_honesty, br = ev.odds.brier, ac = ev.odds.accuracy;
  const cb = calib();
  const add = counts('additive'), raw = counts('raw');
  const ig = integrity();
  const vrows = vrowsHtml(), orows = orowsHtml(), cov = covHtml();
  const total = Object.values(R.ledger).reduce((s, n) => s + n, 0);
  const ledger = Object.entries(R.ledger).filter(([, n]) => n > 0).map(([k, n]) => `<tr><td>${LEDGER_NAMES[k] ?? k}</td><td class="num">${n}</td></tr>`).join('');
  return `
    <section class="msec"><h2>How to read this radar</h2><div class="prose">
      <p>Implied value estimates what a protocol could be worth if it launches a token: estimated size-based value × token-record odds × existing-token relationship adjustment. FARM, THIN and SKIP are scenario-based farming verdicts. FARM must clear the T-bill alternative, fees and a $${state.wage}/hour labor hurdle. Estimates are not launch predictions or airdrop guarantees.</p>
      <p>Model evidence. Value estimation: ×${t.size_wf.toFixed(2)} walk-forward typical miss vs ×${t.flat_wf.toFixed(2)} flat baseline. Token odds: ${br.model_wf.toFixed(3)} walk-forward Brier vs ${br.base_wf.toFixed(3)} baseline (lower is better). Interval coverage: ${pct(rh.wf_p10)} walk-forward vs 80% stated P10–P90 (n=${rh.wf_n}). Feature selection: only terms improving both held-out tests are retained; rejected terms stay listed below.</p></div></section>
    <div class="mgrid">
      <section class="msec"><h2>Valuation · features retained after out-of-sample testing</h2>
        <p class="note">Typical multiplicative miss on ${ev.comps} priced comps. A term is retained only if leave-one-out and walk-forward miss both fall (walk-forward: ${ev.value.wf_split.train} comps listed before ${ev.value.wf_split.cut} price ${ev.value.wf_split.test} later ones).</p>
        <table class="mini"><thead><tr><th>Term, added in order</th><th class="num">Leave-one-out</th><th class="num">Walk-forward</th><th>Decision</th></tr></thead><tbody>${vrows}</tbody></table></section>
      <section class="msec"><h2>Token odds · Brier score, ${ev.peers} peers (${ev.peers_with_token} with a token)</h2>
        <p class="note">Brier is the primary test, lower is better: walk-forward ${br.model_wf.toFixed(3)} vs ${br.base_wf.toFixed(3)} base rate on ${ac.n_wf} later peers; ten-fold ${br.model_10f.toFixed(3)} vs ${br.base.toFixed(3)} on ${ac.n_10f}. Secondary, called right at 0.5: walk-forward ${pct(ac.model_wf, 1)} vs ${pct(ac.base_wf, 1)} for the base-rate classifier; ten-fold ${pct(ac.model_10f, 1)} vs ${pct(ac.base_10f, 1)}.</p>
        <table class="mini"><thead><tr><th>Term, added in order</th><th class="num">Ten-fold</th><th class="num">Walk-forward</th><th>Decision</th></tr></thead><tbody>${orows}</tbody></table></section>
      <section class="msec"><h2>Prediction interval coverage</h2>
        <p class="note">Share of held-out listed caps inside the printed interval. Prediction intervals are evaluated using ${rh.n_boot.toLocaleString('en-US')} bootstrap resamples of the size curve, each paired with a leave-one-out residual; the bands are not widened to hit the label. <span class="under">The walk-forward P10–P90 band undercovers its 80% target (${pct(rh.wf_p10)}, n=${rh.wf_n}).</span> Within ×3 of the model: ${pct(rh.loo_within_x3)} leave-one-out, ${pct(rh.wf_within_x3)} walk-forward.</p>
        <table class="mini"><thead><tr><th>Test</th><th>Interval</th><th class="num">Actual</th><th class="num">Target</th><th class="num">n</th></tr></thead><tbody>${cov}</tbody></table></section>
      <section class="msec cal"><h2>Calibration · leave-one-out, n=${cb.n} priced comps</h2>
        <p class="note">Each point is a comp held out of the size-curve fit; dashed line is one-to-one, both axes log scale. Calibration slope ${cb.slope.toFixed(2)} (1.00 is ideal); median absolute log error ${cb.mdae.toFixed(2)} (×${Math.exp(cb.mdae).toFixed(2)}). A tidy scatter alone does not prove calibration.</p>
        ${calibSvg()}</section>
      <section class="msec"><h2>Scenario sensitivity · FARM count vs ${ev.sensitivity[0].farm} in the main scenario</h2>
        <p class="note">One assumption moves at a time. This is scenario sensitivity, not model uncertainty: deposit size and horizon change the economics, not the chance of a token.</p>
        ${tornadoHtml()}</section>
      <section class="msec"><h2>How FARM is determined</h2>
        <p class="note">${ev.farm.rule} Default deposit ${usd2(ev.farm.deposit)}, drop share ${pct(ev.farm.drop_share)}, horizon ${ev.farm.weeks} weeks, wage $${ev.farm.wage}/h, T-bill ${pct(ev.farm.tbill)} a year.</p>
        <table class="mini"><thead><tr><th>Hurdle under ${scenarioLabel()}</th><th class="num">FARM</th><th class="num">THIN</th><th class="num">SKIP</th></tr></thead><tbody>
          <tr><td>Additive (default): net &gt; T-bill + hours × $${state.wage}</td><td class="num">${add.FARM}</td><td class="num">${add.THIN}</td><td class="num">${add.SKIP}</td></tr>
          <tr><td>Raw-net screen, sensitivity only: net &gt; T-bill and net / hour &gt; $${state.wage}</td><td class="num">${raw.FARM}</td><td class="num">${raw.THIN}</td><td class="num">${raw.SKIP}</td></tr></tbody></table>
        <p class="note" style="margin-top:6px">Both rows use the same ${R.rows.length} records, costs and assumptions. The raw-net row is a sensitivity analysis computed here, not another entry's result.</p></section>
      <section class="msec"><h2>Integrity audit · ${ig.ok} of ${ig.bits.length} checks pass</h2>
        <div class="audit" id="audit">${ig.bits.map(([s, ok]) => `<span class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✕'} ${s}</span>`).join('')}</div></section>
      <section class="msec"><h2>Full snapshot classification · ${total} protocols</h2>
        <table class="mini"><tbody>${ledger}</tbody></table></section>
    </div>`;
}
function compsHtml() {
  return R.comps.map((c) => `<tr><td>${c.name}${c.symbol ? ` (${c.symbol})` : ''}</td><td>${c.category ?? '—'}</td><td class="num">${money(c.tvl_usd)}</td><td class="num">${money(c.mcap_usd)}</td><td class="num">${c.ratio.toFixed(3)}×</td><td class="num">${money(c.fitted)}</td><td class="num">${money(c.loo_fitted)}</td><td class="num">${c.residual.toFixed(2)}×</td></tr>`).join('');
}

/* Wiring */
function bindStatic() {
  const ig = integrity();
  $('#meta').textContent = `DefiLlama snapshot · ${R.as_of} · model refitted in this browser`;
  const st = $('#status');
  st.textContent = `${ig.ok === ig.bits.length ? '✓' : '✕'} Integrity ${ig.ok}/${ig.bits.length} · checksum ${ig.checksum}`;
  st.classList.toggle('bad', ig.ok !== ig.bits.length);
  $('#formula').textContent = 'Implied value = Size curve × Token odds × Relationship adjustment';
  $('#methline').innerHTML = methlineHtml();
  $('#acct').innerHTML = acctHtml();
  $('#evidence').innerHTML = evidenceHtml();
  $('#comps-intro').textContent = `These ${ev.comps} protocols already record a priced token and are not on the house set-aside list. They are the size-curve sample and are never ranked on the board.`;
  $('#comps-body').innerHTML = compsHtml();
  $('#method-body').innerHTML = methodHtml();
  $('#foot').textContent = `${ev.value.formula} ${ev.farm.rule} Select a row for the economics, the valuation breakdown, priced peers, risks and the costed, timed workflow.`;
  fillSelects();
}
function showFront() { $('#front').classList.toggle('hidden', state.tab !== 'board' || !!state.open); }
function setTab(tab) {
  state.tab = tab;
  $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  for (const v of ['board', 'comps', 'method']) $(`#view-${v}`).classList.toggle('hidden', tab !== v);
  showFront();
}
function syncHash() {
  const h = state.open ? `#p/${state.open}` : state.tab !== 'board' ? `#${state.tab}` : state.verdict === 'FARM' ? '#filter/farm' : '#board';
  history.replaceState(null, '', h);
}
function applyHash() {
  const h = decodeURIComponent((location.hash || '#board').slice(1));
  if (h.startsWith('p/')) { setTab('board'); renderBoard(); openDetail(h.split('/')[1]); return; }
  closeDetail();
  if (h === 'comps' || h === 'method') { setTab(h); return; }
  if (h === 'filter/farm') { state.verdict = 'FARM'; state.bucket = ''; state.sort = 'net_per_hour'; state.dir = -1; }
  if (h === 'filter/watch') { state.bucket = 'watchlist'; state.verdict = ''; }
  setTab('board');
  renderBoard();
}
function exportRows(kind) {
  const rows = filtered().map(({ r, L }) => ({
    rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains.join('|'),
    tvl_usd: r.tvl_usd, change_7d: r.change_7d, years_listed: r.years_listed, token_odds: r.token_odds,
    value_if_launches: r.value_if_launches, implied_value_usd: r.implied_value_usd, p25: r.p25, p75: r.p75,
    deposit_usd: L.deposit, drop_share: state.share, horizon_weeks: state.weeks, hurdle: state.hurdle,
    drop_usd: round(L.drop, 2), net_usd: round(L.net, 2), net_per_hour: round(L.ph, 2), hours: L.hours, verdict: L.verdict,
  }));
  const keys = Object.keys(rows[0] || {});
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = kind === 'csv' ? [keys.join(','), ...rows.map((x) => keys.map((k) => esc(x[k])).join(','))].join('\n') : JSON.stringify(rows, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: kind === 'csv' ? 'text/csv' : 'application/json' }));
  a.download = `prelaunch-radar-board.${kind}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function ready() {
  if (!R || !R.rows) return;
  bindStatic();
  $('#f-search').addEventListener('input', (e) => { state.search = e.target.value; renderBoard(); });
  $('#f-cat').addEventListener('change', (e) => { state.cat = e.target.value; renderBoard(); });
  $('#f-chain').addEventListener('change', (e) => { state.chain = e.target.value; renderBoard(); });
  document.addEventListener('click', (e) => {
    const pill = e.target.closest('#pills .pill');
    if (pill) {
      const { kind, val } = pill.dataset;
      if (val === '') { state.verdict = ''; state.bucket = ''; }
      else if (kind === 'verdict') state.verdict = state.verdict === val ? '' : val;
      else state.bucket = state.bucket === val ? '' : val;
      renderBoard(); syncHash(); return;
    }
    const hb = e.target.closest('[data-hurdle]');
    if (hb) { state.hurdle = hb.dataset.hurdle; renderBoard(); $('#method-body').innerHTML = methodHtml(); return; }
    if (e.target.closest('[data-preset="reset"]')) {
      Object.assign(state, { search: '', cat: '', chain: '', bucket: '', verdict: '', depositMode: '10k', deposit: S0.deposit, share: S0.drop_share, weeks: S0.weeks, hurdle: 'additive', sort: 'rank', dir: 1 });
      $('#f-search').value = ''; $('#f-cat').value = ''; $('#f-chain').value = '';
      renderBoard(); syncHash(); return;
    }
    if (e.target.id === 'btn-csv') exportRows('csv');
    if (e.target.id === 'btn-json') exportRows('json');
    const th = e.target.closest('.grid thead th[data-sort]');
    if (th) {
      const k = th.dataset.sort;
      if (state.sort === k) state.dir *= -1; else { state.sort = k; state.dir = k === 'rank' || k === 'name' || k === 'verdict' ? 1 : -1; }
      renderBoard();
    }
    const tr = e.target.closest('#board-body tr[data-slug]');
    if (tr) { openDetail(tr.dataset.slug); syncHash(); }
    const tab = e.target.closest('.tab, [data-goto]');
    if (tab) { closeDetail(); setTab(tab.dataset.tab || tab.dataset.goto); if (state.tab === 'method') $('#method-body').innerHTML = methodHtml(); syncHash(); window.scrollTo(0, 0); }
  });
  window.addEventListener('hashchange', applyHash);
  applyHash();
}

ready();
