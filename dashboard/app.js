/* Prelaunch Radar. No network. Recomputes the fitted model in this page. */
(function () {
  const data = window.RADAR;
  if (!data || !Array.isArray(data.rows)) return;

  const $ = (id) => document.getElementById(id);
  const state = { tab: 'board', sort: 'rank', dir: 1, search: '', cat: '', chain: '', bucket: '', verdict: '', preset: '' };

  const money = (n) => {
    const s = n < 0 ? '-' : '';
    const a = Math.abs(n);
    if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1) + 'K';
    if (a >= 100) return s + '$' + Math.round(a);
    return s + '$' + a.toFixed(2);
  };
  const chg = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const age = (y) => y == null ? '—' : y < 1 ? Math.round(y * 365) + ' d' : y.toFixed(1) + ' yr';
  const hours = (h) => {
    const m = Math.round((h || 0) * 60);
    const hr = Math.floor(m / 60);
    const min = m % 60;
    return hr ? hr + 'h ' + min + 'm' : min + 'm';
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (x, d) => (x * 100).toFixed(d == null ? 1 : d) + '%';

  function fnv1aHex(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  function olsLogLog(tvls, mcaps) {
    const xs = tvls.map((t) => Math.log(Math.max(t, 1)));
    const ys = mcaps.map((m) => Math.log(Math.max(m, 1)));
    const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx; sxx += dx * dx; sxy += dx * (ys[i] - my); }
    return { a: my - (sxx === 0 ? 0 : sxy / sxx) * mx, b: sxx === 0 ? 0 : sxy / sxx };
  }
  function sigmoid(z) { if (z > 30) return 1; if (z < -30) return 0; return 1 / (1 + Math.exp(-z)); }
  function predLogit(w, x) { let z = w[0]; for (let j = 0; j < x.length; j++) z += w[j + 1] * x[j]; return sigmoid(z); }

  const SET_CAT = { Bridge: 1, 'Canonical Bridge': 1, 'Liquid Staking': 1, 'Liquid Restaking': 1, 'Restaked BTC': 1, CEX: 1 };
  const VERSION = /\s(?:V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
  const WRAP = /\b(?:wrapped|staked|staking)\b/i;
  const EXCH = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i;
  const isSetAside = (p) => SET_CAT[p.category] || WRAP.test(p.name) || EXCH.test(p.name) || VERSION.test(p.name);
  const isPriced = (p) => p.gecko_id && p.symbol && p.mcap_usd > 0 && p.tvl_usd > 0;
  const monthsBetween = (a, b) => {
    const [fy, fm] = a.split('-').map(Number);
    const [ty, tm] = b.split('-').map(Number);
    return Math.max(0, (ty - fy) * 12 + (tm - fm));
  };

  function checks() {
    const ev = data.evidence;
    const rows = data.rows;
    const src = rows.map((r) => r.slug + ':' + r.rank + ':' + r.implied_value_usd).join('|');
    const ranksOk = rows.every((r, i) => r.rank === i + 1);
    const mono = rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd);
    const watch = (data.watchlist || []).filter((s) => rows.some((r) => r.slug === s)).length;
    const ledgerN = Object.values(data.ledger || {}).reduce((s, n) => s + n, 0);
    const model = data.model || ev.value;
    const comps = (data.protocols || []).filter((p) => !isSetAside(p) && isPriced(p));
    const fit = comps.length ? olsLogLog(comps.map((p) => p.tvl_usd), comps.map((p) => p.mcap_usd)) : { a: 0, b: 0 };
    let recomputed = 0;
    const w = model.odds_w || ev.odds.weights;
    const med = model.med_age;
    const asOf = data.as_of;
    for (const r of rows) {
      const vif = Math.exp(model.a + model.b * Math.log(Math.max(r.tvl_usd, 1)));
      const yrs = r.listed_at ? monthsBetween(r.listed_at, asOf) / 12 : med;
      const od = predLogit(w, [yrs, Math.log(Math.max(r.tvl_usd, 1) / 1e8)]);
      const implied = Math.max(1, Math.round(vif * od * r.kinship_share));
      if (implied === r.implied_value_usd) recomputed++;
    }
    return {
      checksum: fnv1aHex(src),
      checksumOk: fnv1aHex(src) === ev.integrity.checksum,
      ranksOk, mono, watch, watchN: (data.watchlist || []).length, ledgerN,
      aOk: Math.abs(fit.a - model.a) < 1e-8, bOk: Math.abs(fit.b - model.b) < 1e-8,
      recomputed, n: rows.length,
    };
  }

  const C = checks();

  function renderHeader() {
    const ev = data.evidence;
    const h = ev.value.range_honesty;
    $('kicker').textContent = 'Snapshot — 14 Nov 2026';
    $('meta').textContent = ev.integrity.ledger_total + ' protocols in the ledger · ' + ev.integrity.n_rows + ' ranked · size curve and peer rates refit in this page';
    $('kpis').innerHTML = [
      ['Multiplicative prediction error', '×' + ev.value.typ_miss.size_wf, 'Walk-forward, versus a flat median of ×' + ev.value.typ_miss.flat_wf + '. Leave-one-out ×' + ev.value.typ_miss.size_loo + ' versus ×' + ev.value.typ_miss.flat_loo + '.'],
      ['Interval calibration', pct(h.p25, 1) + ' / ' + pct(h.p10, 1), 'Observed coverage of the stated 50% and 80% intervals on ' + h.n + ' priced comps, from ' + h.n_boot + ' held-out residual draws. Not widened to hit the nominal rates.'],
      ['Farming opportunities under assumptions', ev.farm.farm + ' of ' + ev.integrity.n_rows + ' FARM', ev.farm.thin + ' THIN · ' + ev.farm.skip + ' SKIP. Reward after fees must beat the T-bill return plus hands-on hours × $25.'],
    ].map(([k, v, n]) => '<article class="kpi"><span>' + esc(k) + '</span><strong>' + v + '</strong><em>' + esc(n) + '</em></article>').join('');

    const ticks = [
      [C.recomputed === C.n, 'All ' + C.recomputed + ' ranked rows recomputed from the bundled snapshot'],
      [C.checksumOk, 'Checksum ' + C.checksum + ' covers slug, rank and model-implied value of all ' + C.n + ' ranked rows'],
      [C.watch === C.watchN, 'Watchlist ' + C.watch + '/' + C.watchN],
      [C.ledgerN === ev.integrity.ledger_total, 'Ledger ' + C.ledgerN],
      [C.aOk && C.bOk && C.ranksOk && C.mono, 'Size curve refit; ranks 1–' + C.n + ' never rise in value'],
    ];
    $('audit').innerHTML = '<b>Audit</b>' + ticks.map(([ok, t]) => '<span' + (ok ? '' : ' class="bad"') + '>' + esc(t) + '</span>').join('');

    $('formula').innerHTML = '<b>Model-implied value</b> = (token-launch scenario value, size curve on ' + ev.comps + ' priced peers) × (peer token-record rate, logistic on ' + ev.peers + ' peers, ' + ev.peers_with_token + ' already recording a token) × (existing-token relationship adjustment of 0.5 when a name stem already has a token). This is a model scenario, not a forecast that a token will launch.';

    const ab = ev.value.ablation || [];
    const abRows = ab.map((t) => '<tr><td>' + esc(t.feature) + '</td><td>' + esc(t.used_in) + '</td><td class="num">' + (t.used_in.indexOf('Brier') >= 0 || t.used_in.indexOf('peer') >= 0 ? t.loo : '×' + t.loo) + '</td><td class="num">' + (t.used_in.indexOf('Brier') >= 0 || t.used_in.indexOf('peer') >= 0 ? t.wf : '×' + t.wf) + '</td><td class="' + (t.kept ? 'keep' : 'drop') + '">' + (t.kept ? 'kept' : 'dropped') + '</td></tr>').join('');
    const sen = ev.sensitivity || [];
    const senRows = sen.map((s) => '<tr><td>' + esc(s.name) + '</td><td class="num">' + s.farm + '</td><td class="num">' + s.thin + '</td><td class="num">' + s.skip + '</td></tr>').join('');
    $('method-row').innerHTML =
      '<article class="panel"><h3>Feature ablation</h3><table class="mini"><thead><tr><th>Feature</th><th>Used in</th><th class="num">Held-out</th><th class="num">Walk-forward</th><th>Decision</th></tr></thead><tbody>' + abRows + '</tbody></table><p class="note">A feature is kept only when it improves both tests. Years listed and ln TVL stay in the peer token-record rate, not in the size curve.</p></article>' +
      '<article class="panel"><h3>Scenario sensitivity</h3><table class="mini"><thead><tr><th>Assumption</th><th class="num">FARM</th><th class="num">THIN</th><th class="num">SKIP</th></tr></thead><tbody>' + senRows + '</tbody></table><p class="note">Counts under other assumptions are hypothetical scenarios, not additional observations.</p></article>';
  }

  function farmHeading() {
    return state.verdict === 'FARM' || state.preset === 'farm';
  }

  function rowsFiltered() {
    const q = state.search.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && !(r.chains || []).includes(state.chain)) return false;
      if (state.bucket && r.bucket !== state.bucket) return false;
      if (state.verdict && r.verdict !== state.verdict) return false;
      if (!q) return true;
      return (r.name + ' ' + (r.category || '') + ' ' + (r.chain_label || '') + ' ' + (r.chains || []).join(' ')).toLowerCase().indexOf(q) >= 0;
    });
  }

  function badge(r) {
    if (r.on_watchlist) return '<span class="badge watch">Watchlist</span>';
    if (r.bucket === 'off-list') return '<span class="badge off">Off-list</span>';
    if (r.bucket === 'early') return '<span class="badge">Early</span>';
    return '';
  }

  function renderBoard() {
    const ev = data.evidence;
    const rows = rowsFiltered().slice().sort((a, b) => {
      const k = state.sort;
      let av = a[k], bv = b[k];
      if (k === 'name') { av = a.name; bv = b.name; return state.dir * String(av).localeCompare(String(bv)); }
      if (k === 'verdict') { const o = { FARM: 0, THIN: 1, SKIP: 2 }; av = o[a.verdict]; bv = o[b.verdict]; }
      if (av == null) av = -Infinity;
      if (bv == null) bv = -Infinity;
      return state.dir * (av > bv ? 1 : av < bv ? -1 : 0);
    });
    $('board-title').textContent = farmHeading()
      ? 'FARM opportunities — sorted by opportunity-adjusted return'
      : 'Ranked board';
    $('count').textContent = rows.length + ' of ' + data.rows.length + ' shown · ' + ev.farm.farm + ' FARM under stated assumptions';
    $('board-body').innerHTML = rows.map((r) => {
      const up = r.change_7d == null ? '' : r.change_7d >= 0 ? ' up' : ' down';
      const adj = r.net_per_hour == null ? '—' : (r.net_per_hour < 0 ? '−' : '') + '$' + Math.abs(r.net_per_hour).toFixed(2);
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' + badge(r) + '<span class="sub">' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chain_label) + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num chg' + up + '">' + chg(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.years_listed) + '</td>' +
        '<td class="num">' + Math.round(r.token_odds * 100) + '%</td>' +
        '<td class="num">' + money(r.value_if_launches) + '</td>' +
        '<td class="num">' + money(r.implied_value_usd) + '</td>' +
        '<td class="verdict ' + r.verdict + '">' + r.verdict + '</td>' +
        '<td class="num">' + adj + '</td></tr>';
    }).join('');
    document.querySelectorAll('#board-body tr').forEach((tr) => tr.addEventListener('click', () => openDetail(tr.getAttribute('data-slug'))));
    document.querySelectorAll('.ghost').forEach((b) => b.classList.toggle('on', b.getAttribute('data-preset') === state.preset && state.preset !== 'reset' && state.preset !== ''));
  }

  function parseStep(text) {
    const m = text.match(/^([A-Z][A-Z /-]{1,24})\s+[—-]\s+([\s\S]*)$/);
    const body = m ? m[2] : text;
    const title = m ? m[1] : '';
    const cost = (body.match(/COST\s+(?:about\s+)?(\$[0-9][0-9,]*(?:\.[0-9]+)?)/i) || [])[1] || '';
    const time = (body.match(/TIME\s+([^.]*)/i) || [])[1] || '';
    const main = body.replace(/\s*COST\s+.*$/i, '').trim();
    return { title, main, cost, time };
  }

  function openDetail(slug) {
    const ev = data.evidence;
    const r = data.rows.find((x) => x.slug === slug);
    if (!r) return;
    const n = (r.farm_steps || []).length;
    const steps = (r.farm_steps || []).map((s, i) => {
      const p = parseStep(s);
      return '<li data-i="' + (i + 1) + '"><span class="n">' + (i + 1) + '</span><div><b>' + esc(p.title || ('Step ' + (i + 1))) + '</b> ' + esc(p.main) + (p.cost || p.time ? '<span class="meta">' + esc([p.cost, p.time].filter(Boolean).join(' · ')) + '</span>' : '') + '</div></li>';
    }).join('');
    const chainNote = r.tvl_basis === 'protocol-wide'
      ? 'Drop is computed on protocol-wide TVL because the snapshot does not split TVL by chain. The plan uses ' + r.chain_label + ', a snapshot-listed deployment.'
      : 'The plan uses ' + r.chain_label + '.';
    $('detail').innerHTML =
      '<div class="detail-head"><div><p class="kicker">' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chain_label) + badge(r) + '</p><h2>' + esc(r.name) + '</h2></div><button class="close" type="button">Close</button></div>' +
      '<div class="detail-body">' +
      '<div class="hero"><span>Model-implied value</span><strong>' + money(r.implied_value_usd) + '</strong><p class="note">Token-launch scenario ' + money(r.value_if_launches) + ' · peer token-record rate ' + Math.round(r.token_odds * 100) + '% · existing-token relationship ×' + r.kinship_share + '. P25–P75 ' + money(r.p25) + '–' + money(r.p75) + ' · P10–P90 ' + money(r.p10) + '–' + money(r.p90) + '. A model scenario from this snapshot, not a launch probability and not an airdrop claim.</p></div>' +
      '<div class="statrow"><div><span>TVL</span><b>' + money(r.tvl_usd) + '</b></div><div><span>Years listed</span><b>' + age(r.years_listed) + '</b></div><div><span>7-day</span><b>' + chg(r.change_7d) + '</b></div><div><span>Rank range</span><b>' + r.rank_lo + '–' + r.rank_hi + '</b></div></div>' +
      '<table class="math">' +
      '<tr><td>Size curve · exp(' + ev.value.a.toFixed(3) + ' + ' + ev.value.b.toFixed(3) + ' × ln TVL)</td><td>' + money(r.value_if_launches) + '</td></tr>' +
      '<tr><td>Peer token-record rate (years listed, ln TVL)</td><td>×' + r.token_odds.toFixed(3) + '</td></tr>' +
      '<tr><td>Existing-token relationship</td><td>×' + r.kinship_share + '</td></tr>' +
      '<tr><td>Model-implied value</td><td>' + money(r.implied_value_usd) + '</td></tr>' +
      '<tr><td>Modelled depositor drop at 7% over 12 weeks, $10k on protocol-wide TVL</td><td>' + money(r.drop_usd) + '</td></tr>' +
      '<tr><td>Modelled fees on ' + esc(r.chain_label) + '</td><td>' + money(r.fees_usd) + '</td></tr>' +
      '<tr><td>Reward after fees</td><td>' + money(r.net_usd) + '</td></tr>' +
      '<tr><td>T-bill alternative (4%, 12 weeks)</td><td>' + money(r.tbill_usd) + '</td></tr>' +
      '<tr><td>Hurdle = T-bill + hours × $25</td><td>' + money(r.hurdle_usd) + '</td></tr>' +
      '<tr><td>Opportunity-adjusted return / hour</td><td>' + (r.net_per_hour < 0 ? '−' : '') + '$' + Math.abs(r.net_per_hour).toFixed(2) + '</td></tr>' +
      '</table>' +
      '<div class="assess"><div class="verdict ' + r.verdict + '">' + r.verdict + '</div><p class="note">' + (r.verdict === 'FARM' ? 'Reward after fees beats the T-bill alternative plus $25 times ' + hours(r.hours) + ' of hands-on work, under the stated assumptions.' : r.verdict === 'THIN' ? 'Incremental return after the T-bill alternative is positive, but opportunity-adjusted return is at or below $25 an hour.' : 'Reward after fees does not beat the 4% T-bill alternative over 12 weeks.') + ' ' + esc(chainNote) + '</p></div>' +
      '<div class="timeline-wrap"><div class="timeline-cue" id="tl-cue">Steps 1–' + n + ' of ' + n + '</div><ul class="timeline" id="tl">' + steps + '</ul><div class="timeline-foot" id="tl-foot">' + n + ' steps · total cost ' + money(r.fees_usd) + ' · total time ' + hours(r.hours) + '</div></div>' +
      '</div>';
    $('detail').classList.add('open');
    $('scrim').classList.remove('hidden');
    $('detail').querySelector('.close').addEventListener('click', closeDetail);
    const body = $('detail').querySelector('.detail-body');
    const cue = $('tl-cue');
    const lis = [...($('tl') ? $('tl').children : [])];
    function updateCue() {
      if (!lis.length || !cue) return;
      const top = body.getBoundingClientRect().top + 48;
      const bot = body.getBoundingClientRect().bottom - 36;
      let first = 1, last = lis.length;
      const vis = lis.filter((li) => {
        const rct = li.getBoundingClientRect();
        return rct.bottom > top && rct.top < bot;
      });
      if (vis.length) {
        first = +vis[0].getAttribute('data-i');
        last = +vis[vis.length - 1].getAttribute('data-i');
      }
      const overflow = lis[0] && (lis[0].getBoundingClientRect().top < top - 2 || lis[lis.length - 1].getBoundingClientRect().bottom > bot + 2);
      cue.textContent = 'Steps ' + first + '–' + last + ' of ' + n + (overflow ? ' — scroll' : '');
    }
    body.addEventListener('scroll', updateCue);
    requestAnimationFrame(updateCue);
    history.replaceState(null, '', '#p/' + slug);
  }

  function closeDetail() {
    $('detail').classList.remove('open');
    $('scrim').classList.add('hidden');
    if (location.hash.indexOf('#p/') === 0) history.replaceState(null, '', farmHeading() ? '#filter/farm' : state.tab === 'board' ? '#board' : '#' + state.tab);
  }

  function renderComps() {
    const rows = (data.comps || []).slice();
    $('comps-body').innerHTML = rows.map((c) =>
      '<tr><td class="name">' + esc(c.name) + '</td><td>' + esc(c.category || '—') + '</td><td class="num">' + money(c.tvl_usd) + '</td><td class="num">' + money(c.mcap_usd) + '</td><td class="num">×' + c.ratio.toFixed(2) + '</td><td class="num">' + money(c.fitted) + '</td><td class="num">×' + c.residual.toFixed(2) + '</td></tr>'
    ).join('');
  }

  function renderMethod() {
    const ev = data.evidence;
    const vRows = ev.value.terms.map((t) => '<tr><td>' + esc(t.term) + '</td><td class="num">×' + t.loo + '</td><td class="num">×' + t.wf + '</td><td class="' + (t.kept ? 'keep' : 'drop') + '">' + (t.kept ? 'kept' : 'not kept') + '</td></tr>').join('');
    const oRows = ev.odds.terms_tried.map((t) => '<tr><td>' + esc(t.term) + '</td><td class="num">' + t.kfold + '</td><td class="num">' + t.wf + '</td><td class="' + (t.kept ? 'keep' : 'drop') + '">' + (t.kept ? 'kept' : 'not kept') + '</td></tr>').join('');
    const ab = ev.value.ablation || [];
    const abRows = ab.map((t) => '<tr><td>' + esc(t.feature) + '</td><td>' + esc(t.used_in) + '</td><td class="num">' + t.loo + '</td><td class="num">' + t.wf + '</td><td class="' + (t.kept ? 'keep' : 'drop') + '">' + (t.kept ? 'kept' : 'dropped') + '</td><td>' + esc(t.note) + '</td></tr>').join('');
    const sen = ev.sensitivity || [];
    const senRows = sen.map((s) => '<tr><td>' + esc(s.name) + '</td><td class="num">' + s.farm + '</td><td class="num">' + s.thin + '</td><td class="num">' + s.skip + '</td></tr>').join('');
    const h = ev.value.range_honesty;
    $('method-body').innerHTML =
      '<article class="panel"><h3>Value model · typical multiplicative miss</h3><table class="mini"><thead><tr><th>Term</th><th class="num">Leave-one-out</th><th class="num">Walk-forward</th><th>Decision</th></tr></thead><tbody>' + vRows + '</tbody></table><p class="note">Walk-forward: the ' + ev.value.wf_split.train + ' older dated comps (cut ' + ev.value.wf_split.cut + ') price the ' + ev.value.wf_split.test + ' newer. Multiple at $100M TVL is ×' + ev.value.multiple_at_100m + '.</p></article>' +
      '<article class="panel" style="margin-top:12px"><h3>Peer token-record rate · Brier score</h3><table class="mini"><thead><tr><th>Term</th><th class="num">10-fold</th><th class="num">Walk-forward</th><th>Decision</th></tr></thead><tbody>' + oRows + '</tbody></table><p class="note">This is the share of similar peers that already record a token, given years listed and size. It is not the probability that this protocol will launch one. Base rate ' + pct(ev.odds.base_rate) + '.</p></article>' +
      '<article class="panel" style="margin-top:12px"><h3>Feature ablation</h3><table class="mini"><thead><tr><th>Feature</th><th>Used in</th><th class="num">Held-out</th><th class="num">Walk-forward</th><th>Decision</th><th>Note</th></tr></thead><tbody>' + abRows + '</tbody></table></article>' +
      '<article class="panel" style="margin-top:12px"><h3>Scenario sensitivity</h3><table class="mini"><thead><tr><th>Assumption</th><th class="num">FARM</th><th class="num">THIN</th><th class="num">SKIP</th></tr></thead><tbody>' + senRows + '</tbody></table><p class="note">Farming counts under other assumptions are hypothetical scenarios, not additional observations.</p></article>' +
      '<article class="panel" style="margin-top:12px"><h3>Interval calibration</h3><p class="note">Central 50% interval: ' + pct(h.p25, 1) + ' empirical coverage (nominal 50%). Central 80% interval: ' + pct(h.p10, 1) + ' empirical coverage (nominal 80%). Measured on ' + h.n + ' priced peers with ' + h.n_boot + ' bootstrap draws and leave-one-out residuals. Coverage uses each comp’s leave-one-out fit and the other comps’ residuals only. Intervals were not widened to reach the nominal rates.</p><p class="note">' + ev.farm.rule + ' Farming uses a $10,000 deposit, a 7% depositor share and a 12-week horizon, on a snapshot-listed deployment, with drop computed on protocol-wide TVL. That is a scenario, not advice.</p></article>';
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.getAttribute('data-tab') === tab));
    $('view-board').classList.toggle('hidden', tab !== 'board');
    $('view-comps').classList.toggle('hidden', tab !== 'comps');
    $('view-method').classList.toggle('hidden', tab !== 'method');
  }

  function applyPreset(kind) {
    state.search = ''; state.cat = ''; state.chain = ''; state.bucket = '';
    $('f-search').value = '';
    $('f-cat').value = '';
    $('f-chain').value = '';
    $('f-bucket').value = '';
    if (kind === 'farm') {
      state.verdict = 'FARM'; state.preset = 'farm'; state.sort = 'net_per_hour'; state.dir = -1;
      $('f-verdict').value = 'FARM';
    } else if (kind === 'watch') {
      state.verdict = ''; state.preset = 'watch'; state.bucket = 'watchlist'; state.sort = 'rank'; state.dir = 1;
      $('f-verdict').value = '';
      $('f-bucket').value = 'watchlist';
    } else {
      state.verdict = ''; state.preset = ''; state.sort = 'rank'; state.dir = 1;
      $('f-verdict').value = '';
    }
    setTab('board');
    renderBoard();
    history.replaceState(null, '', kind === 'farm' ? '#filter/farm' : kind === 'watch' ? '#filter/watch' : '#board');
  }

  function fromHash() {
    const h = location.hash || '#board';
    if (h.indexOf('#p/') === 0 || h.indexOf('#detail/') === 0) {
      setTab('board');
      renderBoard();
      openDetail(decodeURIComponent(h.replace(/^#(?:p|detail)\//, '')));
      return;
    }
    closeDetail();
    if (h === '#filter/farm') applyPreset('farm');
    else if (h === '#filter/watch') applyPreset('watch');
    else if (h === '#comps') { setTab('comps'); }
    else if (h === '#method') { setTab('method'); }
    else { setTab('board'); renderBoard(); }
  }

  function fillFilters() {
    const cats = [...new Set(data.rows.map((r) => r.category).filter(Boolean))].sort();
    const chains = [...new Set(data.rows.flatMap((r) => r.chains || []))].sort();
    $('f-cat').innerHTML += cats.map((c) => '<option>' + esc(c) + '</option>').join('');
    $('f-chain').innerHTML += chains.map((c) => '<option>' + esc(c) + '</option>').join('');
  }

  renderHeader();
  fillFilters();
  renderComps();
  renderMethod();
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
    closeDetail();
    setTab(b.getAttribute('data-tab'));
    history.replaceState(null, '', b.getAttribute('data-tab') === 'board' ? '#board' : '#' + b.getAttribute('data-tab'));
  }));
  document.querySelectorAll('.ghost').forEach((b) => b.addEventListener('click', () => applyPreset(b.getAttribute('data-preset'))));
  $('f-search').addEventListener('input', (e) => { state.search = e.target.value; renderBoard(); });
  $('f-cat').addEventListener('change', (e) => { state.cat = e.target.value; renderBoard(); });
  $('f-chain').addEventListener('change', (e) => { state.chain = e.target.value; renderBoard(); });
  $('f-bucket').addEventListener('change', (e) => { state.bucket = e.target.value; renderBoard(); });
  $('f-verdict').addEventListener('change', (e) => {
    state.verdict = e.target.value;
    state.preset = e.target.value === 'FARM' ? 'farm' : '';
    if (state.verdict === 'FARM') { state.sort = 'net_per_hour'; state.dir = -1; }
    renderBoard();
  });
  document.querySelectorAll('#view-board th[data-sort]').forEach((th) => th.addEventListener('click', () => {
    const k = th.getAttribute('data-sort');
    if (state.sort === k) state.dir = -state.dir;
    else { state.sort = k; state.dir = k === 'rank' || k === 'name' ? 1 : -1; }
    renderBoard();
  }));
  $('scrim').addEventListener('click', closeDetail);
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
