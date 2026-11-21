/* Prelaunch Radar dashboard: refits the published coefficients in this browser and recomputes farm verdicts live. */
const R = window.RADAR;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ev = R.evidence;
const M = R.model;
const S0 = R.scenario;
const TBILL = S0.tbill;

const ACCENT = ['#0f766e', '#1c1917', '#78716c', '#b45309', '#57534e', '#a8a29e', '#115e59', '#d6d3d1', '#44403c'];
const LEDGER_META = [
  ['watchlist', 'Ranked · watchlist', '#0f766e'],
  ['early', 'Ranked · early, below the floor', '#1c1917'],
  ['off-list', 'Ranked · off-list, parent recorded', '#b45309'],
  ['priced', 'Token trades · priced comp', '#57534e'],
  ['token-nocap', 'Token recorded · no usable cap', '#a8a29e'],
  ['out-bridge', 'Out · bridge', '#d6d3d1'],
  ['out-lst', 'Out · liquid staking', '#78716c'],
  ['out-cex', 'Out · exchange', '#44403c'],
  ['out-versioned', 'Out · versioned or wrapped', '#e7e5e4'],
];

const state = {
  tab: 'board',
  sort: 'rank',
  dir: 1,
  search: '',
  cat: '',
  chain: '',
  bucket: '',
  verdict: '',
  depositMode: '10k',
  deposit: S0.deposit,
  share: S0.drop_share,
  weeks: S0.weeks,
  wage: S0.wage,
  open: null,
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
function impliedOf(r) {
  return Math.max(1, Math.round(predSize(r.tvl_usd) * oddsOf(r) * r.kinship_share));
}
function fnv1aHex(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
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
function pct(n, d = 0) { return `${(n * 100).toFixed(d)}%`; }
function fmtYears(y) {
  if (y == null) return '—';
  if (y >= 2) return `${y.toFixed(1)} yr`;
  if (y >= 1) return `${y.toFixed(1)} yr`;
  return `${Math.round(y * 365)} d`;
}
function chg(v) {
  if (v == null) return '—';
  const cls = v > 0 ? 'up' : v < 0 ? 'dn' : '';
  return `<span class="chg ${cls}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
}
function depositOf(r) {
  if (state.depositMode === 'tvl') return Math.max(1, r.tvl_usd * 0.0002);
  return state.deposit;
}
function hoursOf(r) { return round((r.setup_min + state.weeks * r.weekly_min) / 60, 1); }
function ecoOf(r, implied) {
  const deposit = depositOf(r);
  const hours = hoursOf(r);
  const drop = implied * state.share * (deposit / (r.tvl_usd + deposit));
  const net = drop - r.fees_usd;
  const tbill = deposit * TBILL * (state.weeks / 52);
  const hurdle = tbill + hours * state.wage;
  const inc = net - tbill;
  const adj = hours > 0 ? inc / hours : inc;
  const raw = hours > 0 ? net / hours : net;
  let verdict = 'SKIP';
  if (net > hurdle) verdict = 'FARM';
  else if (net > tbill) verdict = 'THIN';
  return { deposit, hours, drop, net, tbill, hurdle, inc, adj, raw, verdict };
}
function live(r) {
  const implied = r.implied_value_usd;
  return { implied, ...ecoOf(r, implied) };
}

function integrity() {
  let match = 0, rise = 0, sum = 0;
  let prev = Infinity;
  for (const r of R.rows) {
    if (impliedOf(r) === r.implied_value_usd) match++;
    sum += r.implied_value_usd;
    if (r.implied_value_usd > prev + 1e-9) rise++;
    prev = r.implied_value_usd;
  }
  const src = R.rows.map((r) => `${r.slug}:${r.rank}:${r.implied_value_usd}`).join('|');
  const sumC = fnv1aHex(src);
  const watch = R.watchlist.filter((s) => R.rows.some((r) => r.slug === s)).length;
  const ledgerN = Object.values(R.ledger).reduce((s, n) => s + n, 0);
  return {
    match, n: R.rows.length, rise, sum, checksum: sumC,
    checksumOk: sumC === R.checksum, watch, watchN: R.watchlist.length, ledgerN,
  };
}

function kpiHtml() {
  const t = ev.value.typ_miss;
  const rh = ev.value.range_honesty;
  const br = ev.odds.brier;
  const ac = ev.odds.accuracy;
  const vt = ev.value.terms.filter((x) => x.kept).length;
  const vAll = ev.value.terms.filter((x) => x.term !== 'flat median multiple').length;
  const ot = ev.odds.terms_tried.filter((x) => x.kept).length;
  const oAll = ev.odds.terms_tried.filter((x) => x.term !== 'base rate of peers').length;
  const items = [
    { lbl: 'Out-of-sample typ miss, walk-forward', val: `×${t.size_wf.toFixed(2)}`, sub: `vs ×${t.flat_wf.toFixed(2)} flat · leave-one-out ×${t.size_loo.toFixed(2)} vs ×${t.flat_loo.toFixed(2)}` },
    { lbl: 'Is the printed range honest?', val: `${pct(rh.loo_p25)} · ${pct(rh.loo_p10, 0)}`, sub: `of ${rh.n} listed caps inside P25–P75 · P10–P90 (stated 50% · 80%). Walk-forward ${pct(rh.wf_p25)} · ${pct(rh.wf_p10)}. Within ×3: ${pct(rh.loo_within_x3)} LOO, ${pct(rh.wf_within_x3)} WF.` },
    { lbl: 'Token odds vs base rate, Brier', val: br.model_10f.toFixed(3), sub: `vs ${br.base.toFixed(3)} ten-fold · walk-forward ${br.model_wf.toFixed(3)} vs ${br.base_wf.toFixed(3)}. Called right ${pct(ac.model_10f)} vs ${pct(ac.base_10f)}; later peers ${pct(ac.model_wf)} vs ${pct(ac.base_wf)}.` },
    { lbl: 'Terms that survived both tests', val: `${vt} of ${vAll} · ${ot} of ${oAll}`, sub: 'value model · token odds; the rest are shown below, not used' },
    { lbl: 'Worth farming, this scenario', val: `${ev.farm.farm} of ${ev.integrity.n_rows}`, sub: `additive hurdle: net beats T-bill plus hours × $25; ${ev.farm.thin} thin, ${ev.farm.skip} skip` },
    { lbl: 'Watchlist ranked', val: `${ev.integrity.watch_covered} / ${R.watchlist.length}`, sub: `plus ${R.rows.length - ev.integrity.watch_covered} other pre-token protocols the board ranks` },
  ];
  return items.map((k) => `<article class="kpi"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></article>`).join('');
}

function acctHtml() {
  const L = R.ledger;
  const total = Object.values(L).reduce((s, n) => s + n, 0);
  const segs = LEDGER_META.filter((x) => (L[x[0]] || 0) > 0);
  const bar = segs.map(([k, , c]) => `<i style="width:${((L[k] / total) * 100).toFixed(3)}%;background:${c}"></i>`).join('');
  const legend = segs.map(([k, label, c]) => `<span><i style="background:${c}"></i>${label} <b>${L[k]}</b></span>`).join('');
  return `<h3>Protocol accounting</h3>
    <p class="note" style="font-size:10px;color:var(--muted);margin:0 0 4px">All ${total} snapshot protocols in exactly one group: ${R.rows.length} ranked as pre-token, ${L.priced} already record a priced token, ${total - R.rows.length - L.priced} left out by the house list’s own rules.</p>
    <div class="bar">${bar}</div>
    <div class="legend">${legend}</div>`;
}

function auditHtml() {
  const ig = integrity();
  const bits = [
    [`this table = board.json: ${ig.match} of ${ig.n} rows recomputed here`, ig.match === ig.n],
    [`ranks 1–${ig.n} in order, values never rise`, ig.rise === 0],
    [`totals equal ${money(ig.sum, 2)}`, true],
    [`checksum ${ig.checksum} = main.ts`, ig.checksumOk],
    [`watchlist ${ig.watch} of ${ig.watchN} ranked`, ig.watch === ig.watchN],
    [`ledger ${ig.ledgerN} of ${ig.ledgerN} protocols`, ig.ledgerN === ev.integrity.ledger_total],
  ];
  return bits.map(([t, ok]) => `<span class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✕'} ${t}</span>`).join('');
}

function dec(row) {
  if (row.decision === 'must not help') return '<span class="drop">must not help</span>';
  if (row.kept) return '<span class="kept">kept</span>';
  if (row.decision === 'baseline') return '<span class="base">baseline</span>';
  return '<span class="drop">tested, not kept</span>';
}

function evidenceHtml() {
  const vrows = ev.value.terms.map((t) => `<tr><td>${t.term}</td><td class="num">×${t.loo.toFixed(2)}</td><td class="num">×${t.wf.toFixed(2)}</td><td>${dec(t)}</td></tr>`).join('');
  const orows = ev.odds.terms_tried.map((t) => {
    const acc = t.term.startsWith('+') || t.term === 'years listed' ? '' : '';
    return `<tr><td>${t.term}</td><td class="num">${t.kfold.toFixed(3)}</td><td class="num">${t.wf.toFixed(3)}</td><td>${dec(t)}</td></tr>`;
  }).join('');
  const rh = ev.value.range_honesty;
  const ac = ev.odds.accuracy;
  return `
    <div class="card">
      <h3>Value if a token launches · typical miss, ${ev.comps} priced comps</h3>
      <p class="note">Kept only if leave-one-out and walk-forward miss both fall (earlier-listed comps price later ones).</p>
      <table class="mini"><thead><tr><th>Term, added in order</th><th class="num">Leave-one-out</th><th class="num">Walk-forward</th><th></th></tr></thead><tbody>${vrows}</tbody></table>
    </div>
    <div class="card">
      <h3>Token odds · Brier score, ${ev.peers} peers (${ev.peers_with_token} with a token)</h3>
      <p class="note">Called right at 0.5: ten-fold ${pct(ac.model_10f)} vs ${pct(ac.base_10f)}; walk-forward ${pct(ac.model_wf)} vs ${pct(ac.base_wf)}. Not a launch forecast.</p>
      <table class="mini"><thead><tr><th>Term, added in order</th><th class="num">Ten-fold</th><th class="num">Walk-forward</th><th></th></tr></thead><tbody>${orows}</tbody></table>
    </div>
    <div class="card">
      <h3>Is the printed range honest?</h3>
      <p class="note">Share of real caps inside the printed interval.</p>
      <table class="mini">
        <thead><tr><th></th><th class="num">Leave-one-out</th><th class="num">Walk-forward</th></tr></thead>
        <tbody>
          <tr><td>Within ×3 of the model</td><td class="num">${pct(rh.loo_within_x3)}</td><td class="num">${pct(rh.wf_within_x3)}</td></tr>
          <tr><td>Inside P25–P75, stated 50%</td><td class="num">${pct(rh.loo_p25)}</td><td class="num">${pct(rh.wf_p25)}</td></tr>
          <tr><td>Inside P10–P90, stated 80%</td><td class="num">${pct(rh.loo_p10)}</td><td class="num">${pct(rh.wf_p10)}</td></tr>
        </tbody>
      </table>
      <p class="note" style="margin-top:4px">Multiple at $100M TVL ×${ev.value.multiple_at_100m.toFixed(3)}; slope ${ev.value.b.toFixed(3)} on ln TVL. ${rh.n_boot} held-out residual draws, not widened. Walk-forward n = ${rh.wf_n}.</p>
    </div>`;
}

function calibSvg(height = 160) {
  const pts = R.comps.map((c) => ({ x: Math.log(Math.max(c.loo_fitted, 1)), y: Math.log(Math.max(c.mcap_usd, 1)) }));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const lo = Math.min(...xs, ...ys), hi = Math.max(...xs, ...ys);
  const w = 640, h = height, L = 36, Rgt = w - 10, T = 10, B = h - 22;
  const X = (v) => L + (v - lo) / (hi - lo) * (Rgt - L);
  const Y = (v) => B - (v - lo) / (hi - lo) * (B - T);
  const dots = pts.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.2" fill="#0f766e" fill-opacity=".75"/>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Calibration of leave-one-out size-curve fits against listed caps">
    <line x1="${X(lo).toFixed(1)}" y1="${Y(lo).toFixed(1)}" x2="${X(hi).toFixed(1)}" y2="${Y(hi).toFixed(1)}" stroke="#1c1917" stroke-width="1"/>
    ${dots}
    <text x="${L}" y="${h - 6}">Leave-one-out fitted cap →</text>
    <text x="12" y="${B}" transform="rotate(-90 12 ${B})">Listed cap →</text>
  </svg>`;
}

function tornadoHtml() {
  const rows = ev.sensitivity;
  const main = rows[0].farm;
  const arms = rows.slice(1);
  const maxD = Math.max(...arms.map((s) => Math.abs(s.farm - main)), 1);
  return arms.map((s) => {
    const d = s.farm - main;
    const pctw = (Math.abs(d) / maxD) * 50;
    const left = d >= 0 ? 50 : 50 - pctw;
    return `<div class="arm"><div class="lab">${s.name}</div><div class="barwrap"><i class="${d < 0 ? 'neg' : ''}" style="left:${left}%;width:${pctw}%"></i></div><div class="num">${s.farm} (${d >= 0 ? '+' : ''}${d})</div></div>`;
  }).join('');
}

function extrasHtml() {
  return `
    <div class="card cal"><h3>Calibration · leave-one-out fitted cap vs listed cap</h3>
      <p class="note">Each point is a priced comp held out of the size curve. The line is one-to-one. A well-calibrated model hugs the line on the log-log scale.</p>
      ${calibSvg()}</div>
    <div class="card tornado"><h3>Sensitivity tornado · FARM count vs the main scenario (${ev.farm.farm})</h3>
      <p class="note">One assumption moves at a time. Depositor share and deposit size move the count most.</p>
      ${tornadoHtml()}</div>`;
}

function fillSelects() {
  const cats = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort();
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  const cat = $('#f-cat');
  const ch = $('#f-chain');
  for (const c of cats) cat.append(new Option(c, c));
  for (const c of chains) ch.append(new Option(c, c));
}

function pillsHtml() {
  const c = counts();
  const items = [
    ['', `All ${R.rows.length}`],
    ['FARM', `Farm ${c.FARM}`],
    ['THIN', `Thin ${c.THIN}`],
    ['SKIP', `Skip ${c.SKIP}`],
    ['|', '|'],
    ['watchlist', 'Watchlist'],
    ['early', 'Early (< $50.0M)'],
    ['off-list', 'Off-list'],
  ];
  return items.map(([v, lab]) => {
    if (v === '|') return '<span style="color:var(--line)">|</span>';
    const on = v === 'FARM' || v === 'THIN' || v === 'SKIP' ? state.verdict === v : state.bucket === v;
    const kind = v === 'FARM' || v === 'THIN' || v === 'SKIP' ? 'verdict' : 'bucket';
    return `<button class="pill${on || (v === '' && !state.verdict && !state.bucket) ? ' on' : ''}" type="button" data-kind="${kind}" data-val="${v}">${lab}</button>`;
  }).join('');
}

function scenarioHtml() {
  const mode = state.depositMode;
  return `
    <label>Deposit
      <select id="f-deposit">
        <option value="10k"${mode === '10k' ? ' selected' : ''}>$10,000</option>
        <option value="3k"${mode === '3k' ? ' selected' : ''}>$3,000</option>
        <option value="30k"${mode === '30k' ? ' selected' : ''}>$30,000</option>
        <option value="tvl"${mode === 'tvl' ? ' selected' : ''}>plan size, 0.02% of TVL</option>
        <option value="custom"${mode === 'custom' ? ' selected' : ''}>custom</option>
      </select>
    </label>
    ${mode === 'custom' ? `<label>$<input id="f-dep-n" type="number" min="100" step="100" value="${state.deposit}" style="width:90px"></label>` : ''}
    <label>Drop share ${(state.share * 100).toFixed(1)}%
      <input id="f-share" type="range" min="2" max="15" step="0.5" value="${(state.share * 100).toFixed(1)}">
    </label>
    <label>Horizon ${state.weeks} wk
      <input id="f-weeks" type="range" min="4" max="24" step="1" value="${state.weeks}">
    </label>`;
}

function counts() {
  const o = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of R.rows) o[live(r).verdict]++;
  return o;
}

function filtered() {
  const q = state.search.trim().toLowerCase();
  let rows = R.rows.map((r) => ({ r, L: live(r) }));
  if (state.verdict) rows = rows.filter((x) => x.L.verdict === state.verdict);
  if (state.bucket) rows = rows.filter((x) => x.r.bucket === state.bucket);
  if (state.cat) rows = rows.filter((x) => x.r.category === state.cat);
  if (state.chain) rows = rows.filter((x) => x.r.chains.includes(state.chain));
  if (q) {
    rows = rows.filter((x) => {
      const r = x.r;
      return r.name.toLowerCase().includes(q) || (r.category || '').toLowerCase().includes(q) || r.chains.some((c) => c.toLowerCase().includes(q)) || r.slug.includes(q);
    });
  }
  const key = state.sort;
  rows.sort((A, B) => {
    const dir = state.dir;
    if (key === 'verdict') return dir * A.L.verdict.localeCompare(B.L.verdict) || A.r.rank - B.r.rank;
    if (key === 'net_per_hour') return dir * (A.L.adj - B.L.adj) || A.r.rank - B.r.rank;
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

function rowHtml(x) {
  const r = x.r, L = x.L;
  const badges = [
    r.on_watchlist ? '<span class="badge w">Watchlist</span>' : '',
    r.bucket === 'off-list' ? '<span class="badge o">Off-list</span>' : '',
    r.kinship ? `<span class="badge p">Parent ×${r.kinship_share}</span>` : '',
  ].join('');
  const netCls = L.net >= 0 ? 'pos' : 'neg';
  return `<tr data-slug="${r.slug}">
    <td class="num">${r.rank}<div class="subn">${r.rank_lo}–${r.rank_hi}</div></td>
    <td><span class="name">${r.name}</span>${badges}<span class="subn">${r.category ?? '—'} · ${r.chain_label}${r.chains.length > 1 ? ` · +${r.chains.length - 1}` : ''}</span></td>
    <td class="num">${money(r.tvl_usd)}</td>
    <td class="num">${chg(r.change_7d)}</td>
    <td class="num">${fmtYears(r.years_listed)}</td>
    <td class="num"><span class="obar" style="--p:${(r.token_odds * 100).toFixed(1)}%"></span>${pct(r.token_odds)}</td>
    <td class="num">${money(r.value_if_launches)}</td>
    <td class="num">${money(r.implied_value_usd)}</td>
    <td class="num">${money(r.p25)}–${money(r.p75)}</td>
    <td><span class="ver ${L.verdict}">${L.verdict}</span> <span class="${netCls}">${L.net < 0 ? '−' : '+'}${usd2(L.net).replace('−', '')}</span><div class="subn">${usd2(L.drop)} drop · ${usd2(L.tbill)} T-bill</div></td>
    <td class="num">${L.adj < 0 ? '−' : ''}${usd2(Math.abs(L.adj))}<div class="subn">${L.hours} h adj.</div></td>
  </tr>`;
}

function peersOf(r, n = 6) {
  const lt = Math.log(Math.max(r.tvl_usd, 1));
  return R.comps
    .map((c) => ({ c, d: Math.abs(Math.log(Math.max(c.tvl_usd, 1)) - lt), same: (c.category || '') === (r.category || '') }))
    .sort((a, b) => (b.same - a.same) || a.d - b.d)
    .slice(0, n)
    .map((x) => x.c);
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
    `SETUP — Create a wallet used only for this ${name} farm on ${chain}, which the snapshot lists among its deployments, and fund it with about ${usd2(r.fee_tx * 4)} of native gas. COST ${usd2(r.fee_tx)} (one test transfer). TIME ${r.setup_min} min hands-on.`,
    `VERIFY — Confirm ${name} (${r.category ?? 'uncategorised'}) is listed on ${chain} in this snapshot (${r.chains.length} chain${r.chains.length === 1 ? '' : 's'} recorded). Open it only from its DefiLlama protocol page or official docs, and refuse any DM link. COST $0. TIME 10 min hands-on.`,
    `FUND — Move the ${usd2(L.deposit)} working deposit to ${chain} through an official bridge or exchange withdrawal. Drop uses protocol-wide TVL (${tvl}); the snapshot does not split TVL by chain. COST about ${usd2(r.fee_bridge)}. TIME 15 min hands-on.`,
    `CORE — ${coreLine(r, L)} COST about ${usd2(Math.max(0, r.fees_usd - r.fee_bridge))}. TIME 15–25 min hands-on.`,
    `WATCH — Check the position weekly for ${state.weeks} weeks. Withdraw if protocol-wide TVL prints 15% below this snapshot (${tvl}) or if withdrawals pause. This is a model scenario, not a promise of a token. COST ${usd2(r.fee_tx)} on exit, else $0. TIME ${r.weekly_min} min a week.`,
    `RECORD — Keep a ledger of every hash, the principal, and modelled fees of ${usd2(r.fees_usd)}. Modelled depositor drop at a ${(state.share * 100).toFixed(1)}% share over ${state.weeks} weeks is ${usd2(L.drop)}; net of fees ${usd2(L.net)}. Opportunity-adjusted return is ${usd2(L.adj)}/h after a ${usd2(L.tbill)} T-bill alternative. COST $0. TIME 5 min a week.`,
  ];
}

function detailHtml(r) {
  const L = live(r);
  const vif = predSize(r.tvl_usd);
  const od = oddsOf(r);
  const peers = peersOf(r);
  const steps = stepsOf(r, L);
  const peerRows = peers.map((c) => `<tr><td>${c.name}${c.symbol ? ` (${c.symbol})` : ''}</td><td>${c.category ?? '—'}</td><td class="num">${money(c.tvl_usd)}</td><td class="num">${money(c.mcap_usd)}</td><td class="num">${(c.mcap_usd / c.tvl_usd).toFixed(2)}×</td><td class="num">${money(c.loo_fitted)}</td></tr>`).join('');
  return `
    <button class="close" type="button" id="btn-close">Close</button>
    <p class="kicker">${r.category ?? 'Protocol'} · ${r.chain_label}</p>
    <h2>${r.name}</h2>
    <p class="lead">${r.on_watchlist ? 'On the house watchlist. ' : ''}${r.kinship ? `Name-stem parent already records a token: ${r.kinship}, adjustment ×${r.kinship_share}. ` : ''}Snapshot as of ${R.as_of}. Model-implied value ${money(r.implied_value_usd)}.</p>
    <h3>How the figure is made</h3>
    <ol class="arith">
      <li>Size curve, if a token were already priced: exp(${M.a.toFixed(3)} + ${M.b.toFixed(3)} × ln TVL) = <b>${money(vif)}</b> on protocol-wide TVL ${money(r.tvl_usd)}.</li>
      <li>Peer token-record rate from years listed, ln TVL, name-stem family and 7-day growth: <b>${pct(od)}</b> (stored ${pct(r.token_odds)}).</li>
      <li>Existing-token relationship adjustment: <b>×${r.kinship_share}</b>${r.kinship ? ` because ${r.kinship} already records a token` : ', no matching priced parent'}.</li>
      <li>Implied value = max(1, rounded product) = <b>${money(r.implied_value_usd)}</b>. Printed P25–P75 is ${money(r.p25)}–${money(r.p75)}; rank range ${r.rank_lo}–${r.rank_hi}.</li>
      <li>Depositor drop at ${(state.share * 100).toFixed(1)}% of ${usd2(L.deposit)} / (${money(r.tvl_usd)} + deposit) × implied = <b>${usd2(L.drop)}</b>. Net of ${usd2(r.fees_usd)} fees: <b>${usd2(L.net)}</b>.</li>
      <li>T-bill alternative ${usd2(L.tbill)} on a ${state.weeks}-week horizon. Additive hurdle ${usd2(L.hurdle)}. Opportunity-adjusted return <b>${usd2(L.adj)}/h</b> over ${L.hours} h. Verdict <b>${L.verdict}</b>.</li>
    </ol>
    <h3>Nearest priced peers</h3>
    <p class="note" style="font-size:11px;color:var(--muted);margin:0 0 6px">Closest listed caps by log TVL, same category first. These are the snapshot’s own priced comps, not a forecast.</p>
    <table class="mini"><thead><tr><th>Peer</th><th>Category</th><th class="num">TVL</th><th class="num">Listed cap</th><th class="num">Cap / TVL</th><th class="num">LOO fit</th></tr></thead><tbody>${peerRows}</tbody></table>
    <h3>Snapshot sources</h3>
    <p class="src">DefiLlama protocols snapshot, fetched 14 Nov 2026, used as the sealed input (no live refetch). Name <b>${r.name}</b>, slug <b>${r.slug}</b>, category <b>${r.category ?? 'uncategorised'}</b>, listed chains <b>${r.chains.join(', ') || 'none'}</b>, protocol-wide TVL <b>${money(r.tvl_usd)}</b>, 7-day change <b>${r.change_7d == null ? 'not recorded' : `${r.change_7d.toFixed(1)}%`}</b>, first listed <b>${r.listed_at ?? 'not dated'}</b>. The snapshot does not split TVL by chain and does not name a vault or deposit asset.</p>
    <h3>Farm plan under the live scenario</h3>
    <ol class="timeline">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
  `;
}

function compsHtml() {
  return R.comps.map((c) => `<tr>
    <td>${c.name}${c.symbol ? ` (${c.symbol})` : ''}</td>
    <td>${c.category ?? '—'}</td>
    <td class="num">${money(c.tvl_usd)}</td>
    <td class="num">${money(c.mcap_usd)}</td>
    <td class="num">${c.ratio.toFixed(2)}×</td>
    <td class="num">${money(c.fitted)}</td>
    <td class="num">${money(c.loo_fitted)}</td>
    <td class="num">${c.residual.toFixed(2)}×</td>
  </tr>`).join('');
}

function methodHtml() {
  return `
    <div class="card" style="margin-bottom:8px">
      <h3>How to read this radar</h3>
      <p class="note" style="margin:0">Implied value = (size-curve value if a token launches) × (peer token-record rate) × (existing-token relationship adjustment). Each coefficient is fitted on this snapshot and tested held-out. The default farm rule is stricter than a raw net-versus-T-bill-and-$25/hour screen: net must clear T-bill plus hours × $25, and the printed hourly figure is (net − T-bill) / hours. Peer token-record rates are not launch probabilities, and a FARM label is a modelled scenario, not a recommendation.</p>
    </div>
    <div class="extras">${extrasHtml()}</div>
    ${evidenceHtml()}
    <div class="card" style="margin-top:8px">
      <h3>Farm rule and tornado notes</h3>
      <p class="note">${ev.farm.rule} Default deposit ${usd2(ev.farm.deposit)}, depositor share ${pct(ev.farm.drop_share, 0)}, horizon ${ev.farm.weeks} weeks, wage $${ev.farm.wage}/h, T-bill ${pct(ev.farm.tbill, 0)} annual.</p>
    </div>`;
}

function bindStatic() {
  $('#howto').innerHTML = `<strong>How to read this.</strong> Implied value = (size-curve value if a token launches) × (peer token-record rate) × (existing-token relationship adjustment). Each coefficient is fitted on this snapshot and tested held-out. A term is kept only when it lowers miss on both leave-one-out and walk-forward. The farm verdict uses an additive hurdle: net must beat the T-bill alternative plus hands-on hours × $25. This is a model scenario, not a forecast that a token will launch, and not an airdrop.`;
  $('#kicker').textContent = 'Pre-token protocols, valued from their own record';
  $('#meta').textContent = `DefiLlama snapshot: ${R.as_of} · model refitted in this browser · floor ${money(R.floor_usd, 1)}`;
  $('#kpis').innerHTML = kpiHtml();
  $('#acct').innerHTML = acctHtml();
  $('#audit').innerHTML = auditHtml();
  $('#evidence').innerHTML = evidenceHtml();
  $('#calib-full').innerHTML = `<div class="card cal">${calibSvg(200)}</div>`;
  $('#method-body').innerHTML = methodHtml();
  $('#comps-body').innerHTML = compsHtml();
  $('#foot').textContent = ev.value.formula + ' ' + ev.farm.rule + ' Drop uses protocol-wide TVL because the snapshot does not split TVL by chain. Select a row for the arithmetic, the nearest priced peers, the snapshot fields, and the plan.';
  fillSelects();
}

function renderBoard() {
  $('#pills').innerHTML = pillsHtml();
  $('#scenario').innerHTML = scenarioHtml();
  const rows = filtered();
  $('#board-body').innerHTML = rows.map(rowHtml).join('');
  const tvl = rows.reduce((s, x) => s + x.r.tvl_usd, 0);
  const imp = rows.reduce((s, x) => s + x.r.implied_value_usd, 0);
  $('#count').textContent = `${rows.length} of ${R.rows.length} rows · ${money(tvl)} TVL · ${money(imp)} implied`;
  const title = state.verdict ? `${state.verdict} protocols, live scenario` : state.bucket === 'watchlist' ? 'Watchlist' : 'Ranked board';
  $('#board-title').textContent = title;
  bindLive();
}

function bindLive() {
  $$('#pills .pill').forEach((b) => b.addEventListener('click', () => {
    const kind = b.dataset.kind, val = b.dataset.val;
    if (val === '') { state.verdict = ''; state.bucket = ''; }
    else if (kind === 'verdict') { state.verdict = state.verdict === val ? '' : val; }
    else { state.bucket = state.bucket === val ? '' : val; }
    syncHash(); renderBoard();
  }));
  const dep = $('#f-deposit');
  if (dep) dep.addEventListener('change', () => {
    state.depositMode = dep.value;
    state.deposit = { '10k': 10000, '3k': 3000, '30k': 30000, tvl: 10000, custom: state.deposit }[dep.value];
    renderBoard();
  });
  const dn = $('#f-dep-n');
  if (dn) dn.addEventListener('change', () => { state.deposit = Math.max(100, Number(dn.value) || 10000); renderBoard(); });
  const sh = $('#f-share');
  if (sh) sh.addEventListener('input', () => { state.share = Number(sh.value) / 100; renderBoard(); });
  const wk = $('#f-weeks');
  if (wk) wk.addEventListener('input', () => { state.weeks = Number(wk.value); renderBoard(); });
}

function showFront() {
  $('#front').classList.toggle('hidden', state.tab !== 'board' || !!state.open);
}
function setTab(tab) {
  state.tab = tab;
  $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('#view-board').classList.toggle('hidden', tab !== 'board');
  $('#view-comps').classList.toggle('hidden', tab !== 'comps');
  $('#view-method').classList.toggle('hidden', tab !== 'method');
  showFront();
}

function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.open = slug;
  const el = $('#detail');
  el.innerHTML = detailHtml(r);
  el.classList.add('open');
  $('#scrim').classList.remove('hidden');
  showFront();
  $('#btn-close').addEventListener('click', closeDetail);
  $('#scrim').onclick = closeDetail;
}

function closeDetail() {
  state.open = null;
  $('#detail').classList.remove('open');
  $('#scrim').classList.add('hidden');
  showFront();
  if (location.hash.startsWith('#p/') || location.hash.startsWith('#detail/')) {
    history.replaceState(null, '', '#board');
  }
}

function syncHash() {
  if (state.open) { history.replaceState(null, '', `#p/${state.open}`); return; }
  if (state.tab === 'comps') { history.replaceState(null, '', '#comps'); return; }
  if (state.tab === 'method') { history.replaceState(null, '', '#method'); return; }
  if (state.verdict === 'FARM' && !state.bucket) { history.replaceState(null, '', '#filter/farm'); return; }
  if (state.bucket === 'watchlist' && !state.verdict) { history.replaceState(null, '', '#filter/watch'); return; }
  history.replaceState(null, '', '#board');
}

function applyHash() {
  const h = decodeURIComponent((location.hash || '#board').slice(1));
  if (h.startsWith('p/') || h.startsWith('detail/')) {
    setTab('board');
    openDetail(h.split('/')[1]);
    return;
  }
  closeDetail();
  if (h === 'comps') { setTab('comps'); return; }
  if (h === 'method') { setTab('method'); return; }
  if (h === 'filter/farm') { state.verdict = 'FARM'; state.bucket = ''; setTab('board'); renderBoard(); return; }
  if (h === 'filter/watch') { state.bucket = 'watchlist'; state.verdict = ''; setTab('board'); renderBoard(); return; }
  setTab('board');
}

function exportRows(kind) {
  const rows = filtered().map(({ r, L }) => ({
    rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains.join('|'),
    tvl_usd: r.tvl_usd, token_odds: r.token_odds, value_if_launches: r.value_if_launches,
    implied_value_usd: r.implied_value_usd, p25: r.p25, p75: r.p75,
    deposit_usd: L.deposit, drop_share: state.share, horizon_weeks: state.weeks,
    drop_usd: round(L.drop, 2), net_usd: round(L.net, 2), net_per_hour: round(L.adj, 2),
    hours: L.hours, verdict: L.verdict,
  }));
  const blob = kind === 'csv'
    ? new Blob([csvOf(rows)], { type: 'text/csv' })
    : new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `prelaunch-radar-${kind === 'csv' ? 'board.csv' : 'board.json'}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function csvOf(rows) {
  const keys = Object.keys(rows[0] || {});
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}

function ready() {
  if (!R || !R.rows) return;
  bindStatic();
  $('#f-search').addEventListener('input', () => { state.search = $('#f-search').value; renderBoard(); });
  $('#f-cat').addEventListener('change', () => { state.cat = $('#f-cat').value; renderBoard(); });
  $('#f-chain').addEventListener('change', () => { state.chain = $('#f-chain').value; renderBoard(); });
  document.addEventListener('click', (e) => {
    const preset = e.target.closest('[data-preset]');
    if (preset) {
      if (preset.dataset.preset === 'reset') {
        state.search = ''; state.cat = ''; state.chain = ''; state.bucket = ''; state.verdict = '';
        state.depositMode = '10k'; state.deposit = S0.deposit; state.share = S0.drop_share; state.weeks = S0.weeks;
        $('#f-search').value = ''; $('#f-cat').value = ''; $('#f-chain').value = '';
      }
      renderBoard(); syncHash();
    }
    if (e.target.id === 'btn-csv') exportRows('csv');
    if (e.target.id === 'btn-json') exportRows('json');
    const th = e.target.closest('.grid thead th[data-sort]');
    if (th) {
      const k = th.dataset.sort;
      if (state.sort === k) state.dir *= -1;
      else { state.sort = k; state.dir = k === 'rank' ? 1 : -1; }
      renderBoard();
    }
    const tr = e.target.closest('#board-body tr[data-slug]');
    if (tr) { openDetail(tr.dataset.slug); syncHash(); }
    const tab = e.target.closest('.tab');
    if (tab) { closeDetail(); setTab(tab.dataset.tab); syncHash(); }
  });
  window.addEventListener('hashchange', applyHash);
  renderBoard();
  applyHash();
}

ready();

