(function () {
  'use strict';
  var B = window.RADAR;
  var rows = B.rows;
  var trading = B.tokens_trading;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  var state = {
    tab: 'board',
    q: '', category: '', chain: '', minTvl: 0, watchlist: false, growth: false, multi: false,
    preset: 'all', detail: null,
    sortBoard: { key: 'rank', dir: 1 },
    sortTrading: { key: 'rank', dir: 1 }
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function exact(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function fixed(n, d) { return Number(n).toFixed(d); }
  function changeHtml(v) {
    if (v === null || v === undefined) return '<span class="zero">—</span>';
    var cls = v > 0 ? 'pos' : (v < 0 ? 'neg' : 'zero');
    return '<span class="' + cls + '">' + (v > 0 ? '+' : '') + fixed(v, 2) + '%</span>';
  }
  function chainText(chains) {
    if (!chains || !chains.length) return '—';
    return esc(chains.slice(0, 3).join(', ') + (chains.length > 3 ? ' +' + (chains.length - 3) : ''));
  }
  function chainFull(chains) { return esc(chains.length ? chains.join(', ') : 'Not reported'); }

  function fillHeader() {
    $('h-date').textContent = B.as_of;
    $('h-pre').textContent = B.counts.pre_token.toLocaleString('en-US');
    $('h-watch').textContent = B.counts.watchlist + '/' + B.counts.watchlist;
    $('h-launch').textContent = B.counts.token_trading.toLocaleString('en-US');
    var max = rows[0].implied_value_usd;
    var sortedVals = rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
    var mid = Math.floor(sortedVals.length / 2);
    var med = sortedVals.length % 2 ? sortedVals[mid] : (sortedVals[mid - 1] + sortedVals[mid]) / 2;
    var cats = {};
    rows.forEach(function (r) {
      var k = r.category || 'Uncategorised';
      cats[k] = (cats[k] || 0) + r.implied_value_usd;
    });
    var top = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; })[0];
    var total = rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    $('cards').innerHTML =
      '<div class="card"><span>Total implied value</span><strong>' + money(total) + '</strong>'
      + '<small>sum across all ' + rows.length + ' ranked protocols</small></div>'
      + '<div class="card"><span>Median implied value</span><strong>' + money(med) + '</strong>'
      + '<small>midpoint of the ' + rows.length + ' estimates</small></div>'
      + '<div class="card"><span>Top category by value</span><strong>' + esc(top) + '</strong>'
      + '<small>' + money(cats[top]) + ' · largest row ' + money(max) + '</small></div>';
    $('method-formula').textContent = B.value_model.formula;
    $('method-constants').innerHTML =
      '<span class="chip">all-protocol median <b>' + fixed(B.value_model.all_protocol_median_ratio, 6) + '</b></span>'
      + '<span class="chip">calibration set <b>' + B.value_model.calibration_count + '</b> tokens</span>'
      + '<span class="chip">ratio band <b>' + B.value_model.ratio_band[0] + ' – ' + B.value_model.ratio_band[1] + '</b></span>'
      + '<span class="chip">min category sample <b>' + B.value_model.min_category_sample + '</b></span>';
    var keys = Object.keys(B.value_model.category_medians).sort();
    $('method-body').innerHTML = keys.map(function (k) {
      var v = B.value_model.category_medians[k];
      return '<tr><td>' + esc(k) + '</td><td class="num">' + fixed(v.ratio, 6) + '</td>'
        + '<td class="num">' + v.sample_size + '</td><td class="muted">' + esc(v.basis)
        + (v.basis === 'all-protocol' ? ' *' : '') + '</td></tr>';
    }).join('');
  }

  function fillFilterOptions() {
    var cats = {};
    var chains = {};
    rows.forEach(function (r) {
      cats[r.category || 'Uncategorised'] = 1;
      r.chains.forEach(function (c) { chains[c] = 1; });
    });
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; $('f-category').appendChild(o);
    });
    Object.keys(chains).sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; $('f-chain').appendChild(o);
    });
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.watchlist && !r.on_watchlist) return false;
      if (state.growth && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (state.multi && r.chains.length < 4) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (state.category && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sortList(list, sort, accessor) {
    var key = sort.key, dir = sort.dir;
    return list.slice().sort(function (a, b) {
      var av = accessor(a, key), bv = accessor(b, key);
      var c;
      if (typeof av === 'string' || typeof bv === 'string') c = String(av).localeCompare(String(bv));
      else c = av - bv;
      if (c === 0) c = a.slug.localeCompare(b.slug);
      return c * dir;
    });
  }
  function rowValue(r, key) {
    if (key === 'chains') return r.chains.length;
    if (key === 'on_watchlist') return r.on_watchlist ? 1 : 0;
    return r[key];
  }
  function tokenValue(r, key) { return r[key]; }

  function renderBoard() {
    var list = sortList(filtered(), state.sortBoard, rowValue);
    var max = rows[0].implied_value_usd;
    $('result-count').textContent = list.length + ' of ' + rows.length + ' rows';
    var active = [];
    if (state.watchlist) active.push('Watchlist only');
    if (state.growth) active.push('7d growth > 0');
    if (state.multi) active.push('4+ chains');
    if (state.minTvl) active.push('TVL >= ' + money(state.minTvl));
    if (state.category) active.push(state.category);
    if (state.chain) active.push(state.chain);
    if (state.q) active.push('search: ' + state.q);
    $('active-note').textContent = 'ACTIVE · ' + active.join(' · ');
    $('active-note').classList.toggle('hidden', active.length === 0);
    $('board-body').innerHTML = list.map(function (r) {
      var pct = Math.max(2, Math.round(100 * r.implied_value_usd / max));
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.detail === r.slug ? ' class="selected"' : '') + '>'
        + '<td class="rank-cell">' + r.rank + '</td>'
        + '<td class="name-cell">' + esc(r.name) + '<small>' + esc(r.slug) + '</small></td>'
        + '<td class="cat-cell">' + esc(r.category || 'Uncategorised') + '</td>'
        + '<td class="chains-cell">' + chainText(r.chains) + '</td>'
        + '<td class="num">' + money(r.tvl_usd) + '</td>'
        + '<td class="num">' + changeHtml(r.change_7d) + '</td>'
        + '<td class="num">' + (r.months_without_token === null ? '—' : r.months_without_token + ' mo') + '</td>'
        + '<td class="imp-cell"><div class="imp-value"><span>' + money(r.implied_value_usd) + '</span><span>#' + r.rank + '</span></div>'
        + '<div class="bar"><i style="width:' + pct + '%"></i></div></td>'
        + '<td>' + (r.on_watchlist ? '<span class="badge">WATCH</span>' : '<span class="badge badge-off">—</span>') + '</td>'
        + '</tr>';
    }).join('') || '<tr><td colspan="9" class="muted">No protocol matches these filters.</td></tr>';
    document.querySelectorAll('#view-board thead th').forEach(function (th) {
      th.classList.toggle('sorted', th.dataset.sort === state.sortBoard.key);
      th.textContent = th.textContent.replace(/ [\u25B2\u25BC]$/, '') + (th.dataset.sort === state.sortBoard.key ? (state.sortBoard.dir === 1 ? ' \u25B2' : ' \u25BC') : '');
    });
  }

  function renderTrading() {
    var list = sortList(trading, state.sortTrading, tokenValue);
    $('trading-body').innerHTML = list.map(function (r, i) {
      return '<tr><td class="rank-cell">' + (i + 1) + '</td>'
        + '<td class="name-cell">' + esc(r.name) + '<small>' + esc(r.slug) + '</small></td>'
        + '<td>' + esc(r.symbol || '—') + '</td>'
        + '<td class="cat-cell">' + esc(r.category || 'Uncategorised') + '</td>'
        + '<td class="num">' + money(r.tvl_usd) + '</td>'
        + '<td class="num">' + money(r.mcap_usd) + '</td>'
        + '<td class="num">' + fixed(r.mcap_tvl_ratio, 3) + 'x</td>'
        + '<td class="num">' + changeHtml(r.change_7d) + '</td></tr>';
    }).join('');
    document.querySelectorAll('#view-trading thead th').forEach(function (th) {
      th.classList.toggle('sorted', th.dataset.sort === state.sortTrading.key);
      th.textContent = th.textContent.replace(/ [\u25B2\u25BC]$/, '') + (th.dataset.sort === state.sortTrading.key ? (state.sortTrading.dir === 1 ? ' \u25B2' : ' \u25BC') : '');
    });
  }

  function mathLines(r) {
    var f = r.factors;
    var basis = f.ratio_basis === 'category'
      ? 'category median of ' + f.ratio_sample_size + ' token-trading peers'
      : 'FALLBACK to the all-protocol median of ' + f.ratio_sample_size + ' token-trading peers ('
        + esc(r.category || 'Uncategorised') + ' has fewer than 5 peers with a token)';
    var growthExpr = f.change_7d === null
      ? 'no 7d change reported, so a neutral 1 is used'
      : '1 + clamp(' + fixed(f.change_7d, 4) + '/100, -0.3, +0.3) = <b>' + fixed(f.growth, 6) + '</b>';
    var ageExpr = f.months_without_token === null
      ? 'no first-tracked date, so a neutral 1 is used'
      : 'clamp(1.2 - ' + f.months_without_token + '/60, 0.7, 1.2) = <b>' + fixed(f.age, 6) + '</b>';
    var chainExpr = '1 + 0.015 x min(' + f.chain_count + ', 8) = <b>' + fixed(f.chains, 6) + '</b>';
    var product = exact(f.tvl_base) + ' x ' + fixed(f.ratio, 6) + ' x ' + fixed(f.growth, 6)
      + ' x ' + fixed(f.age, 6) + ' x ' + fixed(f.chains, 6);
    return [
      '<li>Base: TVL in the sealed snapshot = <b>' + exact(f.tvl_base) + '</b></li>',
      '<li>Category ratio = <b>' + fixed(f.ratio, 6) + '</b> &nbsp;·&nbsp; ' + esc(basis) + '</li>',
      '<li>Growth factor: ' + growthExpr + '</li>',
      '<li>Age factor (' + (f.months_without_token === null ? 'unknown' : f.months_without_token + ' months without token') + '): ' + ageExpr + '</li>',
      '<li>Chain factor (' + f.chain_count + ' chains): ' + chainExpr + '</li>',
      '<li>Product: ' + product + ' = ' + exact(f.product) + '</li>',
      '<li class="final">Rounded to whole dollars &rarr; implied value <b>' + exact(r.implied_value_usd) + '</b></li>'
    ].join('');
  }

  function renderDetail() {
    var panel = $('detail');
    var r = bySlug[state.detail];
    if (!r) {
      panel.classList.remove('open');
      $('scrim').classList.add('hidden');
      return;
    }
    panel.innerHTML =
      '<div class="detail-head"><div class="detail-top"><div><h2>' + esc(r.name) + '</h2>'
      + '<div class="detail-slug">' + esc(r.slug) + ' · rank #' + r.rank + '</div></div>'
      + '<button class="close" id="close-detail" type="button">Close</button></div>'
      + '<div class="detail-badges"><span class="badge">' + esc(r.category || 'Uncategorised') + '</span>'
      + (r.on_watchlist ? '<span class="badge">Watchlist</span>' : '')
      + (r.derivative_like ? '<span class="badge badge-off">Wrapped / staked-like</span>' : '')
      + '<span class="badge badge-off">Records no token</span></div></div>'
      + '<h3>Value derivation · step by step</h3><ol class="math">' + mathLines(r) + '</ol>'
      + '<h3>Farm plan · ' + r.farm_steps.length + ' steps</h3>'
      + '<div class="costline"><span>Estimated cost <b>' + esc(r.farm_cost) + '</b></span>'
      + '<span>Time <b>' + esc(r.farm_time) + '</b></span></div>'
      + '<ol class="plan">'
      + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('')
      + '</ol>'
      + '<h3>Risk notes</h3><ul class="risks">'
      + r.risk_notes.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>'
      + '<h3>Snapshot facts</h3><div class="facts">'
      + '<div class="fact"><span>TVL</span><b>' + exact(r.tvl_usd) + '</b></div>'
      + '<div class="fact"><span>7d TVL change</span><b>' + changeHtml(r.change_7d) + '</b></div>'
      + '<div class="fact"><span>First tracked</span><b>' + esc(r.listed_at || 'Not reported') + '</b></div>'
      + '<div class="fact"><span>Months without token</span><b>' + (r.months_without_token === null ? 'Unknown' : r.months_without_token) + '</b></div>'
      + '<div class="fact"><span>Chains (' + r.chains.length + ')</span><b>' + chainFull(r.chains) + '</b></div>'
      + '<div class="fact"><span>Implied value</span><b>' + exact(r.implied_value_usd) + '</b></div>'
      + '</div>';
    panel.classList.add('open');
    $('scrim').classList.remove('hidden');
    $('close-detail').addEventListener('click', closeDetail);
    panel.scrollTop = 0;
  }

  function openDetail(slug) {
    if (!bySlug[slug]) return;
    state.detail = slug;
    renderDetail();
    renderBoard();
    setHash('#detail/' + slug);
  }
  function closeDetail() {
    state.detail = null;
    renderDetail();
    renderBoard();
    setHash('#board');
  }

  function setTab(tab) {
    state.tab = tab;
    ['board', 'trading', 'method'].forEach(function (name) {
      $('view-' + name).classList.toggle('hidden', name !== tab);
    });
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    if (tab !== 'board' && state.detail) closeDetail();
    if (tab === 'board') renderBoard();
    if (tab === 'trading') renderTrading();
  }

  function setHash(hash) {
    var next = hash || '#board';
    if (window.location.hash !== next) history.replaceState(null, '', next);
  }

  var PRESETS = {
    'watchlist-growth': { watchlist: true, growth: true, minTvl: 0, multi: false, category: '', chain: '', q: '' },
    'large-tvl': { watchlist: false, growth: false, minTvl: 250e6, multi: false, category: '', chain: '', q: '' },
    'multi-chain': { watchlist: false, growth: false, minTvl: 0, multi: true, category: '', chain: '', q: '' },
    'all': { watchlist: false, growth: false, minTvl: 0, multi: false, category: '', chain: '', q: '' }
  };
  function applyPreset(name) {
    var p = PRESETS[name] || PRESETS.all;
    state.watchlist = p.watchlist; state.growth = p.growth; state.minTvl = p.minTvl;
    state.multi = p.multi; state.category = p.category; state.chain = p.chain; state.q = p.q;
    state.preset = PRESETS[name] ? name : 'all';
    $('f-watchlist').checked = state.watchlist;
    $('f-growth').checked = state.growth;
    $('f-tvl').value = Math.round(state.minTvl / 1e6);
    $('f-tvl-label').textContent = money(state.minTvl);
    $('f-category').value = state.category;
    $('f-chain').value = state.chain;
    $('f-search').value = state.q;
    document.querySelectorAll('.preset').forEach(function (b) { b.classList.toggle('active', b.dataset.preset === state.preset); });
    if (state.tab !== 'board') setTab('board'); else renderBoard();
    setHash('#filter/' + state.preset);
  }
  function markCustom() {
    state.preset = 'all';
    document.querySelectorAll('.preset').forEach(function (b) { b.classList.remove('active'); });
  }

  function readHash() {
    var h = window.location.hash || '#board';
    if (h.indexOf('#detail/') === 0) {
      setTab('board');
      openDetail(decodeURIComponent(h.slice(8)));
      return;
    }
    if (h.indexOf('#filter/') === 0) {
      state.detail = null; renderDetail();
      applyPreset(h.slice(8));
      return;
    }
    if (h === '#trading' || h === '#method') {
      state.detail = null; renderDetail(); setTab(h.slice(1)); setHash(h); return;
    }
    state.detail = null; renderDetail(); setTab('board'); setHash('#board');
  }

  function bind() {
    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () { setTab(b.dataset.tab); });
    });
    document.querySelectorAll('.preset').forEach(function (b) {
      b.addEventListener('click', function () { applyPreset(b.dataset.preset); });
    });
    $('f-search').addEventListener('input', function (e) { state.q = e.target.value; markCustom(); renderBoard(); });
    $('f-category').addEventListener('change', function (e) { state.category = e.target.value; markCustom(); renderBoard(); });
    $('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; markCustom(); renderBoard(); });
    $('f-tvl').addEventListener('input', function (e) {
      state.minTvl = Number(e.target.value) * 1e6;
      $('f-tvl-label').textContent = money(state.minTvl);
      markCustom(); renderBoard();
    });
    $('f-watchlist').addEventListener('change', function (e) { state.watchlist = e.target.checked; markCustom(); renderBoard(); });
    $('f-growth').addEventListener('change', function (e) { state.growth = e.target.checked; markCustom(); renderBoard(); });
    $('scrim').addEventListener('click', closeDetail);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.detail) closeDetail(); });
    $('board-body').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-slug]');
      if (tr) openDetail(tr.dataset.slug);
    });
    document.querySelectorAll('#view-board thead th').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.dataset.sort;
        var s = state.sortBoard;
        if (s.key === key) s.dir = -s.dir; else { s.key = key; s.dir = key === 'rank' ? 1 : -1; }
        renderBoard();
      });
    });
    document.querySelectorAll('#view-trading thead th').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.dataset.sort;
        var s = state.sortTrading;
        if (s.key === key) s.dir = -s.dir; else { s.key = key; s.dir = key === 'rank' ? 1 : -1; }
        renderTrading();
      });
    });
    window.addEventListener('hashchange', readHash);
  }

  fillHeader();
  fillFilterOptions();
  bind();
  readHash();
  if (!window.location.hash) setHash('#board');
})();
