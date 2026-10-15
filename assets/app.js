(() => {
'use strict';
/* ---------------------------------------------------------------
   charts.js  -  small SVG chart kit + the seven finding charts.
   Everything is drawn from the data embedded in the page (free.json).
   Colours follow the report's figures: grey = noise floor, amber = location / cookware,
   bordeaux = language / neighbours, forest = B2B / Swiss, ink = both sectors.
---------------------------------------------------------------- */

const NS = 'http://www.w3.org/2000/svg';
const NB = ' ';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const LANG = document.documentElement.lang.slice(0, 2);
const I = JSON.parse($('#i18n').textContent);
const F = JSON.parse($('#data-free').textContent);
const CFG = JSON.parse($('#cfg').textContent);

function T(key, vars) {
  let o = I;
  for (const k of key.split('.')) { o = o == null ? undefined : o[k]; }
  if (typeof o !== 'string') { console.warn('missing i18n key', key); return key; }
  return vars ? o.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : '')) : o;
}
function nf(x, d = 0) {
  if (x == null || Number.isNaN(x)) return '–';
  const neg = x < 0 && Math.abs(x) >= Math.pow(10, -d) / 2;
  let [a, b] = Math.abs(x).toFixed(d).split('.');
  a = a.replace(/\B(?=(\d{3})+(?!\d))/g, LANG === 'fr' ? NB : LANG === 'de' ? '.' : ',');
  return (neg ? '−' : '') + a + (b ? (LANG === 'fr' || LANG === 'de' ? ',' : '.') + b : '');
}
const PSP = LANG === 'fr' || LANG === 'de' ? NB : '';
const pf = (x, d = 1) => (x == null ? '–' : nf(x, d) + PSP + '%');
const sg = (x, d = 1) => (x > 0 ? '+' : '') + nf(x, d);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function S(tag, attrs, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const k in (attrs || {})) { if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]); }
  for (const c of kids.flat()) { if (c != null) e.append(c.nodeType ? c : document.createTextNode(c)); }
  return e;
}
function H(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); }
  return e;
}

/* ---- tooltip ---- */
const tipEl = H('div', { id: 'tip', role: 'tooltip' });
document.body.append(tipEl);
function placeTip(e) {
  const r = tipEl.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 16;
  if (x + r.width > innerWidth - 8) x = Math.max(8, e.clientX - r.width - 14);
  if (y + r.height > innerHeight - 8) y = Math.max(8, e.clientY - r.height - 14);
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
}
function hideTip() { tipEl.classList.remove('on'); }
function tipOn(node, html) {
  node.addEventListener('pointerenter', e => { tipEl.innerHTML = html(); tipEl.classList.add('on'); placeTip(e); });
  node.addEventListener('pointermove', placeTip);
  node.addEventListener('pointerleave', hideTip);
  node.addEventListener('focus', () => {
    const r = node.getBoundingClientRect();
    tipEl.innerHTML = html(); tipEl.classList.add('on'); placeTip({ clientX: r.left + r.width / 2, clientY: r.top });
  });
  node.addEventListener('blur', hideTip);
  node.setAttribute('tabindex', '0');
}

/* ---- responsive redraw ---- */
function responsive(mount, draw) {
  let w = 0;
  const run = (force) => {
    const nw = Math.round(mount.clientWidth);
    if (nw && (force || nw !== w)) { w = nw; mount.replaceChildren(draw(nw)); }
  };
  if ('ResizeObserver' in window) new ResizeObserver(() => run(false)).observe(mount);
  window.addEventListener('resize', () => run(false));
  run(true);
  return () => run(true);
}

function legend(items) {
  return H('div', { class: 'legend' }, items.map(([cls, label, ring]) =>
    H('span', {}, H('i', { class: ring ? 'ring' : '', style: ring ? '' : `background:var(--${cls})` }), label)));
}
function segmented(options, value, onChange, label) {
  const wrap = H('div', { class: 'seg', role: 'group', 'aria-label': label || '' });
  options.forEach(([v, text]) => {
    const b = H('button', { type: 'button', 'aria-pressed': String(v === value) }, text);
    b.addEventListener('click', () => {
      $$('button', wrap).forEach(x => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true'); onChange(v);
    });
    wrap.append(b);
  });
  return wrap;
}
const TOOLS = ['AIO', 'CHATGPT', 'PPLX'];
const COUNTRIES = ['FR', 'DE', 'CH'];
const LANGS = ['fr', 'de', 'en'];
const CELLS = LANGS.flatMap(l => COUNTRIES.map(c => [c, l]));
const toolName = t => T('tools.' + t);
const vertName = v => T('verts.' + v);

function axisTop(W, x0, x1, ticks, fmt, y0, h) {
  const g = S('g');
  ticks.forEach(t => {
    const x = x0 + (x1 - x0) * t[0];
    g.append(S('line', { class: 'grid', x1: x, x2: x, y1: y0 + 14, y2: y0 + h }));
    g.append(S('text', { class: 'nl', x, y: y0 + 8, 'text-anchor': 'middle' }, fmt(t[1])));
  });
  return g;
}

/* ================================================================
   Finding 1: source overlap (Figure 2 of the report)
================================================================ */
function chartOverlap(mount, ctl) {
  const draw = W => {
    const v = ctl.v, small = W < 520;
    const padR = small ? 50 : 132, x1 = W - padR, sx = u => x1 * u;
    const rows = [['rep', 'grey', 'f1_rep'], ['loc', 'amber', 'f1_loc'], ['lang', 'bordeaux', 'f1_lang']];
    const bh = 17, gap = 5, top = 26, gh = 24, gg = 20;
    const groupH = gh + rows.length * (bh + gap);
    const H_ = top + TOOLS.length * (groupH + gg);
    const svg = S('svg', { viewBox: `0 0 ${W} ${H_}`, width: W, height: H_, role: 'img', 'aria-label': T('ui.f1_aria') });
    svg.append(axisTop(W, 0, x1, [[0, 0], [.25, .25], [.5, .5], [.75, .75], [1, 1]], x => nf(x, 2), 0, H_ - 8));
    TOOLS.forEach((t, ti) => {
      const y0 = top + ti * (groupH + gg);
      svg.append(S('text', { class: 'gl', x: 0, y: y0 + 14 }, toolName(t)));
      const d = F.f1[t][v];
      rows.forEach(([k, col, lab], ri) => {
        const y = y0 + gh + ri * (bh + gap), val = d[k], ci = d[k + '_ci'], n = d[k + '_n'];
        const g = S('g', { class: 'mark' });
        g.append(S('rect', { x: 0, y, width: Math.max(2, sx(val)), height: bh, rx: 2, class: 'f' + col[0] }));
        if (ci) {
          const a = sx(ci[0]), b = sx(ci[1]), cy = y + bh / 2;
          g.append(S('path', { class: 'wh', d: `M${a} ${cy}H${b}M${a} ${cy - 4}V${cy + 4}M${b} ${cy - 4}V${cy + 4}` }));
        }
        const lx = (ci ? sx(ci[1]) : sx(val)) + 8;
        g.append(S('text', { class: 'vl', x: lx, y: y + bh - 4 }, nf(val, 2)));
        if (!small) g.append(S('text', { class: 'nl', x: lx + 34, y: y + bh - 4 }, 'n = ' + nf(n)));
        tipOn(g, () => `<b>${esc(toolName(t))}</b>${esc(T('ui.' + lab))}<span class="tm">${nf(val, 3)}${ci ? ' (' + esc(T('ui.ci95')) + ' ' + nf(ci[0], 2) + ' ' + esc(T('ui.to')) + ' ' + nf(ci[1], 2) + ')' : ''}<br>n = ${nf(n)} ${esc(T('ui.pairs'))}</span>`);
        g.setAttribute('aria-label', `${toolName(t)}, ${T('ui.' + lab)}: ${nf(val, 2)}, n = ${n}`);
        svg.append(g);
      });
    });
    return H('div', {}, legend([['grey', T('ui.f1_rep')], ['amber', T('ui.f1_loc')], ['bordeaux', T('ui.f1_lang')]]), svg);
  };
  return responsive(mount, draw);
}

/* ================================================================
   Finding 2: local-country share, English-only share, country assumed
================================================================ */
function chartLocal(mount) {
  const draw = W => {
    const small = W < 520, padR = small ? 60 : 130, x1 = W - padR, max = 50, sx = u => x1 * u / max;
    const bh = 16, gap = 5, gh = 24, gg = 16;
    const vs = [['all', 'ink'], ['CW', 'amber'], ['EA', 'forest']];
    const blockA = 26 + TOOLS.length * (gh + vs.length * (bh + gap) + gg);
    const blockB = 54 + TOOLS.length * (bh + 10);
    const blockC = 54 + TOOLS.length * (bh + 10);
    const Ht = blockA + blockB + blockC;
    const svg = S('svg', { viewBox: `0 0 ${W} ${Ht}`, width: W, height: Ht, role: 'img', 'aria-label': T('ui.f2_aria') });
    // block A
    svg.append(S('text', { class: 'fig-t gl', x: 0, y: 12 }, T('ui.f2_a')));
    svg.append(axisTop(W, 0, x1, [0, 10, 20, 30, 40, 50].map(v => [v / max, v]), v => v + PSP + '%', 8, blockA - 12));
    TOOLS.forEach((t, ti) => {
      const y0 = 30 + ti * (gh + vs.length * (bh + gap) + gg);
      svg.append(S('text', { class: 'gl', x: 0, y: y0 + 12 }, toolName(t)));
      vs.forEach(([v, col], vi) => {
        const d = F.f2.local[t][v], y = y0 + gh - 4 + vi * (bh + gap);
        const g = S('g', { class: 'mark' });
        g.append(S('rect', { x: 0, y, width: Math.max(2, sx(d.pct)), height: bh, rx: 2, class: 'f' + col[0] }));
        const a = sx(d.ci[0]), b = sx(d.ci[1]), cy = y + bh / 2;
        g.append(S('path', { class: 'wh', d: `M${a} ${cy}H${b}M${a} ${cy - 4}V${cy + 4}M${b} ${cy - 4}V${cy + 4}` }));
        g.append(S('text', { class: 'vl', x: sx(d.ci[1]) + 8, y: y + bh - 4 }, pf(d.pct)));
        if (!small) g.append(S('text', { class: 'nl', x: sx(d.ci[1]) + 58, y: y + bh - 4 }, 'n = ' + nf(d.n)));
        tipOn(g, () => `<b>${esc(toolName(t))}</b>${esc(vertName(v))}<span class="tm">${pf(d.pct)} (${esc(T('ui.ci95'))} ${nf(d.ci[0])} ${esc(T('ui.to'))} ${nf(d.ci[1])})<br>n = ${nf(d.n)} ${esc(T('ui.citations'))}</span>`);
        g.setAttribute('aria-label', `${toolName(t)}, ${vertName(v)}: ${pf(d.pct)}, n = ${d.n}`);
        svg.append(g);
      });
    });
    // block B: English answers only
    const yB = blockA;
    svg.append(S('text', { class: 'gl', x: 0, y: yB + 12 }, T('ui.f2_b')));
    TOOLS.forEach((t, ti) => {
      const d = F.f2.english_local[t], y = yB + 26 + ti * (bh + 10);
      const g = S('g', { class: 'mark' });
      g.append(S('text', { class: 'lb', x: 0, y: y + bh - 3 }, toolName(t)));
      const x0 = small ? 96 : 132, sxx = u => (x1 - x0) * u / max;
      g.append(S('rect', { x: x0, y, width: Math.max(2, sxx(d.pct)), height: bh, rx: 2, class: 'fi' }));
      g.append(S('text', { class: 'vl', x: x0 + sxx(d.pct) + 8, y: y + bh - 4 }, pf(d.pct)));
      if (!small) g.append(S('text', { class: 'nl', x: x0 + sxx(d.pct) + 58, y: y + bh - 4 }, 'n = ' + nf(d.n)));
      tipOn(g, () => `<b>${esc(toolName(t))}</b>${esc(T('ui.f2_b'))}<span class="tm">${pf(d.pct)}<br>n = ${nf(d.n)} ${esc(T('ui.citations'))}</span>`);
      svg.append(g);
    });
    // block C: country assumed
    const yC = blockA + blockB;
    svg.append(S('text', { class: 'gl', x: 0, y: yC + 12 }, T('ui.f2_c')));
    TOOLS.forEach((t, ti) => {
      const d = F.f2.assumed[t], k = d.location + d.both, y = yC + 26 + ti * (bh + 10);
      const g = S('g', { class: 'mark' });
      g.append(S('text', { class: 'lb', x: 0, y: y + bh - 3 }, toolName(t)));
      const x0 = small ? 96 : 132, sxx = u => (x1 - x0 + padR - 70) * u;
      g.append(S('rect', { x: x0, y, width: sxx(1), height: bh, rx: 2, class: 'fl' }));
      g.append(S('rect', { x: x0, y, width: Math.max(2, sxx(k / d.answers)), height: bh, rx: 2, class: 'fi' }));
      g.append(S('text', { class: 'vl', x: x0 + sxx(1) + 8, y: y + bh - 4 }, `${k} ${T('ui.of')} ${d.answers}`));
      tipOn(g, () => `<b>${esc(toolName(t))}</b>${esc(T('ui.f2_c_tip', { k, n: d.answers }))}<span class="tm">${pf(100 * k / d.answers)}</span>`);
      svg.append(g);
    });
    return H('div', {}, legend([['ink', vertName('all')], ['amber', vertName('CW')], ['forest', vertName('EA')]]), svg);
  };
  return responsive(mount, draw);
}

/* ================================================================
   Finding 3: from Zurich, neighbour vs Swiss domains
================================================================ */
function chartZurich(mount, ctl) {
  const draw = W => {
    const small = W < 520, labW = small ? 0 : 150, padR = small ? 44 : 70;
    const x0 = labW, x1 = W - padR, max = 100, sx = u => (x1 - x0) * u / max;
    const bh = 14, gap = 3, rowH = 2 * bh + gap + 10, gh = 26;
    const Ht = 26 + TOOLS.length * (gh + 2 * rowH + 10);
    const svg = S('svg', { viewBox: `0 0 ${W} ${Ht}`, width: W, height: Ht, role: 'img', 'aria-label': T('ui.f3_aria') });
    svg.append(axisTop(W, x0, x1, [0, 25, 50, 75, 100].map(v => [v / 100, v]), v => v + PSP + '%', 0, Ht - 6));
    TOOLS.forEach((t, ti) => {
      const y0 = 26 + ti * (gh + 2 * rowH + 10);
      svg.append(S('text', { class: 'gl', x: 0, y: y0 + 14 }, toolName(t)));
      ['fr', 'de'].forEach((lg, li) => {
        const d = F.f3[t][ctl.v][lg], y = y0 + gh + li * rowH;
        const thin = d.n < 30;
        const g = S('g', { class: 'mark' });
        if (small) g.append(S('text', { class: 'nl', x: 0, y: y - 1 }, T('ui.f3_ans_' + lg)));
        else g.append(S('text', { class: 'lb', x: 0, y: y + bh + 1 }, T('ui.f3_ans_' + lg)));
        const yy = small ? y + 4 : y;
        g.append(S('rect', { x: x0, y: yy, width: Math.max(2, sx(d.neighbour)), height: bh, rx: 2, class: 'fb', opacity: thin ? .55 : 1 }));
        g.append(S('rect', { x: x0, y: yy + bh + gap, width: Math.max(2, sx(d.swiss)), height: bh, rx: 2, class: 'ff', opacity: thin ? .55 : 1 }));
        g.append(S('text', { class: 'vl', x: x0 + sx(d.neighbour) + 6, y: yy + bh - 3 }, pf(d.neighbour)));
        g.append(S('text', { class: 'vl', x: x0 + sx(d.swiss) + 6, y: yy + 2 * bh + gap - 3 }, pf(d.swiss)));
        g.append(S('text', { class: 'nl', x: W, y: yy + bh + 1, 'text-anchor': 'end' }, 'n = ' + nf(d.n) + (thin ? ' *' : '')));
        tipOn(g, () => `<b>${esc(toolName(t))}, ${esc(T('ui.f3_ans_' + lg))}</b>${esc(T('ui.f3_nb_' + lg))}: ${pf(d.neighbour)}<br>${esc(T('ui.f3_swiss'))}: ${pf(d.swiss)}<span class="tm">n = ${nf(d.n)} ${esc(T('ui.citations'))}${thin ? ' · ' + esc(T('ui.thin')) : ''}</span>`);
        svg.append(g);
      });
    });
    return H('div', {}, legend([['bordeaux', T('ui.f3_nb')], ['forest', T('ui.f3_swiss')]]), svg);
  };
  return responsive(mount, draw);
}

/* ================================================================
   Finding 4: site types (Figure 5)
================================================================ */
const GROUP_ORDER = ['brand', 'third', 'trade', 'ugc', 'other'];
const GROUP_CLS = { brand: 'fa', third: 'ff', trade: 'fb', ugc: 'fg', other: 'fl' };
const GROUP_VAR = { brand: 'amber', third: 'forest', trade: 'bordeaux', ugc: 'grey', other: 'light' };
const GROUPS = {
  brand: ['brand'], third: ['media', 'testing_body', 'consumer_advice', 'affiliate'],
  trade: ['retailer', 'distributor', 'b2b_platform'], ugc: ['forum_ugc', 'video', 'social'],
  other: ['encyclopedia', 'public_body', 'association', 'other'],
};
function chartTypes(mount) {
  const draw = W => {
    const small = W < 520, labW = small ? 0 : 138, padR = small ? 0 : 70, x0 = labW, x1 = W - padR, bh = 26;
    const panels = [['CW', 'Cw'], ['EA', 'Ea']];
    const rowH = bh + (small ? 24 : 10), top0 = small ? 46 : 34, panH = top0 + 10 + TOOLS.length * rowH;
    const Ht = panels.length * panH + 6;
    const svg = S('svg', { viewBox: `0 0 ${W} ${Ht}`, width: W, height: Ht, role: 'img', 'aria-label': T('ui.f4_aria') });
    panels.forEach(([v], pi) => {
      const y0 = pi * panH;
      svg.append(S('text', { class: 'gl', x: 0, y: y0 + 14 }, vertName(v)));
      svg.append(S('line', { class: 'ax', x1: 0, x2: W, y1: y0 + 22, y2: y0 + 22, style: `stroke:var(--${v === 'CW' ? 'amber' : 'forest'})` }));
      TOOLS.forEach((t, ti) => {
        const d = F.f4.types[t][v], y = y0 + top0 + ti * rowH;
        const tot = GROUP_ORDER.reduce((a, g) => a + d.groups[g], 0);
        if (small) svg.append(S('text', { class: 'lb', x: 0, y: y - 4 }, toolName(t) + '  ·  n = ' + nf(d.n)));
        else svg.append(S('text', { class: 'lb', x: 0, y: y + bh / 2 + 4, 'font-weight': 600 }, toolName(t)));
        let cx = x0;
        const by = small ? y : y;
        GROUP_ORDER.forEach(gk => {
          const w = (x1 - x0) * d.groups[gk] / tot;
          if (w < .5) return;
          const g = S('g', { class: 'mark' });
          g.append(S('rect', { x: cx + 1, y: by, width: Math.max(1, w - 2), height: bh, rx: 2, class: GROUP_CLS[gk] }));
          if (d.groups[gk] >= 4) g.append(S('text', { x: cx + w / 2, y: by + bh / 2 + 4, 'text-anchor': 'middle', style: `font-size:12px;font-weight:600;fill:${gk === 'other' ? 'var(--ink)' : 'var(--on-seg)'}` }, Math.round(d.groups[gk])));
          tipOn(g, () => {
            const parts = GROUPS[gk].filter(s => d.pct[s] > 0).map(s => `${esc(T('types.' + s))} ${pf(d.pct[s])}`).join('<br>');
            return `<b>${esc(toolName(t))}, ${esc(vertName(v))}</b>${esc(T('groups.' + gk))}: ${pf(d.groups[gk])}<span class="tm">${parts}<br>n = ${nf(d.n)} ${esc(T('ui.citations'))}</span>`;
          });
          g.setAttribute('aria-label', `${toolName(t)}, ${vertName(v)}, ${T('groups.' + gk)}: ${pf(d.groups[gk])}`);
          svg.append(g);
          cx += w;
        });
        if (!small) svg.append(S('text', { class: 'nl', x: W, y: y + bh / 2 + 4, 'text-anchor': 'end' }, 'n = ' + nf(d.n)));
      });
    });
    return H('div', {}, legend(GROUP_ORDER.map(g => [GROUP_VAR[g], T('groups.' + g)])), svg);
  };
  return responsive(mount, draw);
}

/* ================================================================
   Finding 5: AI Overview by buying stage + named manufacturers linked
================================================================ */
function lineChart(W, Ht, series, opts) {
  const small = W < 520, padL = 34, padR = 18, padT = 18, padB = small ? 48 : 34, w = W - padL - padR, h = Ht - padT - padB, inset = Math.min(26, w / 12);
  const stages = ['problem', 'learn', 'shortlist', 'evaluate', 'buy'];
  const sx = i => padL + inset + (w - 2 * inset) * i / (stages.length - 1), sy = v => padT + h * (1 - v / 100);
  const svg = S('svg', { viewBox: `0 0 ${W} ${Ht}`, width: W, height: Ht, role: 'img', 'aria-label': opts.aria });
  [0, 25, 50, 75, 100].forEach(v => {
    svg.append(S('line', { class: 'grid', x1: padL, x2: W - padR, y1: sy(v), y2: sy(v) }));
    svg.append(S('text', { class: 'nl', x: padL - 6, y: sy(v) + 4, 'text-anchor': 'end' }, v));
  });
  stages.forEach((s, i) => svg.append(S('text', { class: 'nl', x: sx(i), y: Ht - 8 - (small && i % 2 ? 14 : 0), 'text-anchor': 'middle' }, T('stages.' + s))));
  series.forEach(se => {
    let path = '', pen = false;
    se.pts.forEach(p => {
      if (p.v == null) { pen = false; return; }
      path += (pen ? 'L' : 'M') + sx(p.i) + ' ' + sy(p.v); pen = true;
    });
    svg.append(S('path', { d: path, fill: 'none', style: `stroke:var(--${se.col});stroke-width:2.2`, 'stroke-dasharray': se.dash || null, 'stroke-linejoin': 'round' }));
    se.pts.forEach(p => {
      if (p.v == null) return;
      const g = S('g', { class: 'mark' });
      g.append(S('circle', { cx: sx(p.i), cy: sy(p.v), r: 11, fill: 'transparent' }));
      g.append(S('circle', { cx: sx(p.i), cy: sy(p.v), r: 4.5, style: `fill:var(--${se.col});stroke:var(--bg);stroke-width:2` }));
      const above = p.i === 0 ? !se.labelAbove : se.labelAbove, lab = above ? sy(p.v) - 10 : sy(p.v) + 17;
      if (se.showLabels !== false) g.append(S('text', { class: 'vl', x: sx(p.i), y: lab, 'text-anchor': 'middle' }, nf(p.v)));
      tipOn(g, () => `<b>${esc(se.name)}</b>${esc(T('stages.' + stages[p.i]))}: ${pf(p.v)}<span class="tm">${esc(p.base)}</span>`);
      svg.append(g);
    });
  });
  if (opts.note) {
    const maxCh = Math.floor((W - padL - padR - 12) / 5.6);
    let lines = [opts.note];
    if (opts.note.length > maxCh) {
      const mid = opts.note.lastIndexOf(' ', Math.ceil(opts.note.length / 2) + 6);
      lines = [opts.note.slice(0, mid), opts.note.slice(mid + 1)];
    }
    lines.forEach((ln, k) => svg.append(S('text', { class: 'nl', x: padL + 6, y: sy(small ? 93 : 58) + k * 13 }, ln)));
  }
  return svg;
}
function chartFunnel(mount) {
  const stages = ['problem', 'learn', 'shortlist', 'evaluate', 'buy'];
  const draw = W => {
    const Ht = W < 520 ? 190 : 210;
    const wrap = H('div');
    wrap.append(H('p', { class: 'fig-t' }, T('ui.f5_a')));
    const mk = (v, col, nameKey, above) => ({
      name: T(nameKey), col, labelAbove: above,
      pts: stages.map((s, i) => ({ i, v: F.f5.stages[s][v].aio_pct, base: T('ui.searches', { n: nf(F.f5.stages[s][v].searches) }) })),
    });
    wrap.append(lineChart(W, Ht, [mk('CW', 'amber', 'verts.CW', false), mk('EA', 'forest', 'verts.EA', true), mk('all', 'ink', 'verts.all', true)].map((s, i) => { if (i === 2) s.showLabels = false; return s; }), { aria: T('ui.f5_aria_a') }));
    wrap.append(legend([['amber', vertName('CW')], ['forest', vertName('EA')], ['ink', vertName('all')]]));
    wrap.append(H('p', { class: 'fig-t', style: 'margin-top:18px' }, T('ui.f5_b')));
    const linked = {
      name: vertName('all'), col: 'ink', labelAbove: true,
      pts: stages.map((s, i) => {
        const d = F.f5.stages[s].all;
        const ok = d.named_per_answer >= 0.1 && d.linked_pct != null;
        return { i, v: ok ? d.linked_pct : null, base: T('ui.named_per_answer', { x: nf(d.named_per_answer, 2) }) };
      }),
    };
    // dotted bridge across the stage with too few named manufacturers
    const bridge = { name: '', col: 'ink', dash: '3 4', showLabels: false, pts: [linked.pts[0], { ...linked.pts[2], v: linked.pts[2].v }].map((p, j) => j === 0 ? p : p) };
    bridge.pts = [linked.pts[0], linked.pts[2]];
    const svgL = lineChart(W, Ht, [bridge, linked], { aria: T('ui.f5_aria_b'), note: T('ui.f5_note', { x: nf(F.f5.stages.learn.all.named_per_answer, 2) }) });
    wrap.append(svgL);
    return wrap;
  };
  return responsive(mount, draw);
}

/* ================================================================
   Finding 6: URL structure of brand sites
================================================================ */
function chartUrl(mount) {
  const draw = W => {
    const small = W < 520, labW = small ? 0 : 142, padR = small ? 44 : 60, x0 = labW, x1 = W - padR, max = 80, sx = u => (x1 - x0) * u / max;
    const bh = 14, gap = 3, gh = 22, gg = 12, blocks = [['subfolder', 'f6_sub'], ['cctld', 'f6_cc']];
    const stride = 2 * bh + gap + gg + (small ? 18 : 0), top0 = small ? 46 : 34, blockH = top0 - 6 + TOOLS.length * stride + 6;
    const Ht = blocks.length * blockH + 6;
    const svg = S('svg', { viewBox: `0 0 ${W} ${Ht}`, width: W, height: Ht, role: 'img', 'aria-label': T('ui.f6_aria') });
    blocks.forEach(([key, lab], bi) => {
      const y0 = bi * blockH;
      svg.append(S('text', { class: 'gl', x: 0, y: y0 + 14 }, T('ui.' + lab)));
      svg.append(S('line', { class: 'ax', x1: 0, x2: W, y1: y0 + 22, y2: y0 + 22 }));
      [0, 20, 40, 60, 80].forEach(v => {
        svg.append(S('line', { class: 'grid', x1: x0 + sx(v), x2: x0 + sx(v), y1: y0 + 26, y2: y0 + blockH - 12 }));
      });
      TOOLS.forEach((t, ti) => {
        const d = F.f6[t][key], y = y0 + top0 + ti * stride;
        const g = S('g', { class: 'mark' });
        g.append(S('text', { class: 'lb', x: 0, y: small ? y : y + bh + 1, 'font-weight': 600 }, toolName(t)));
        const yy = small ? y + 7 : y;
        g.append(S('rect', { x: x0, y: yy, width: Math.max(2, sx(d.cited)), height: bh, rx: 2, class: 'fi' }));
        g.append(S('rect', { x: x0, y: yy + bh + gap, width: Math.max(2, sx(d.top10)), height: bh, rx: 2, class: 'fl' }));
        g.append(S('text', { class: 'vl', x: x0 + sx(d.cited) + 6, y: yy + bh - 3 }, pf(d.cited)));
        g.append(S('text', { class: 'vl m', x: x0 + sx(d.top10) + 6, y: yy + 2 * bh + gap - 3 }, pf(d.top10)));
        tipOn(g, () => `<b>${esc(toolName(t))}</b>${esc(T('ui.' + lab))}<br>${esc(T('ui.f6_cited'))}: ${pf(d.cited)} (${nf(d.cited_links)})<br>${esc(T('ui.f6_top10'))}: ${pf(d.top10)} (${nf(d.top10_links)})<span class="tm">${esc(T('ui.links'))}</span>`);
        svg.append(g);
      });
    });
    return H('div', {}, legend([['ink', T('ui.f6_cited')], ['light', T('ui.f6_top10')]]), svg);
  };
  return responsive(mount, draw);
}

/* ================================================================
   Finding 7: home brands, language vs location gaps
================================================================ */
function chartBrands(mount, ctl) {
  const draw = W => {
    const small = W < 520, labW = small ? 0 : 150, x0 = labW + 10, x1 = W - 70, lo = -10, hi = 45;
    const sx = v => x0 + (x1 - x0) * (v - lo) / (hi - lo);
    const rows = [
      ['FR', 'lang'], ['FR', 'loc'], ['DE', 'lang'], ['DE', 'loc'], ['CH', 'loc'],
    ];
    const rh = 36, gg = 24, top = 30, Ht = top + rows.length * rh + 2 * gg + 40;
    const svg = S('svg', { viewBox: `0 0 ${W} ${Ht}`, width: W, height: Ht, role: 'img', 'aria-label': T('ui.f7_aria') });
    [-10, 0, 10, 20, 30, 40].forEach(v => {
      svg.append(S('line', { class: v === 0 ? 'ax' : 'grid', x1: sx(v), x2: sx(v), y1: top - 8, y2: top + rows.length * rh + 2 * gg }));
      svg.append(S('text', { class: 'nl', x: sx(v), y: top - 14, 'text-anchor': 'middle' }, (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v)));
    });
    let lastOrigin = null, off = -gg;
    rows.forEach(([o, kind], i) => {
      if (o !== lastOrigin) off += gg;
      const y = top + i * rh + rh / 2 + off, d = F.f7[ctl.v][o];
      if (o !== lastOrigin) { svg.append(S('text', { class: 'gl', x: 0, y: y - 19 }, T('ui.f7_brands_' + o))); lastOrigin = o; }
      const gap = kind === 'lang' ? d.in_lang - d.other_lang : d.from_there - d.from_elsewhere;
      const ci = kind === 'lang' ? d.lang_ci : d.loc_ci;
      if (gap == null || Number.isNaN(gap) || !ci) return;
      const incl0 = ci[0] <= 0 && ci[1] >= 0, col = kind === 'lang' ? 'amber' : 'forest';
      const g = S('g', { class: 'mark' });
      svg.append(S('text', { class: 'lb m', x: labW - 8, y: y + 4, 'text-anchor': 'end' }, small ? '' : T('ui.f7_' + kind)));
      g.append(S('path', { class: 'wh', style: `stroke:var(--${col})`, d: `M${sx(ci[0])} ${y}H${sx(ci[1])}M${sx(ci[0])} ${y - 4}V${y + 4}M${sx(ci[1])} ${y - 4}V${y + 4}` }));
      g.append(S('circle', { cx: sx(gap), cy: y, r: 6, style: incl0 ? `fill:var(--bg);stroke:var(--${col});stroke-width:2.4` : `fill:var(--${col})` }));
      g.append(S('text', { class: 'vl', x: sx(ci[1]) + 8, y: y + 4 }, sg(gap, 1) + NB + T('ui.pts')));
      const n1 = kind === 'lang' ? d.n_lang : d.n_there, n2 = kind === 'lang' ? d.n_other : d.n_else;
      tipOn(g, () => `<b>${esc(T('ui.f7_brands_' + o))}</b>${esc(T('ui.f7_' + kind + '_long'))}<br>${sg(gap, 1)} ${esc(T('ui.pts'))} (${esc(T('ui.ci95'))} ${nf(ci[0], 1)} ${esc(T('ui.to'))} ${nf(ci[1], 1)})${incl0 ? '<br>' + esc(T('ui.incl0')) : ''}<span class="tm">${kind === 'lang' ? pf(d.in_lang) + ' ' + esc(T('ui.vs')) + ' ' + pf(d.other_lang) : pf(d.from_there) + ' ' + esc(T('ui.vs')) + ' ' + pf(d.from_elsewhere)}<br>n = ${nf(n1)} ${esc(T('ui.vs'))} ${nf(n2)} ${esc(T('ui.mentions'))}</span>`);
      svg.append(g);
    });
    return small ? H('div', {}, legend([['amber', T('ui.f7_lang')], ['forest', T('ui.f7_loc')]]), svg) : svg;
  };
  return responsive(mount, draw);
}

/* ---------------------------------------------------------------
   app.js  -  hero matrix, situation step, explorer (the bowl), gate, navigation.
   Depends on charts.js (concatenated before this file by build.py).
---------------------------------------------------------------- */

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window: ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
let G = null;                       // gated data, loaded after unlock
const isUnlocked = () => document.body.classList.contains('is-unlocked');
const cellKey = (c, l) => `${c}|${l}`;
const cellLabel = k => { const [c, l] = k.split('|'); return `${T('countries.' + c)}, ${T('langs_in.' + l)}`; };
const rel = (a, b) => {
  const [c1, l1] = a.split('|'), [c2, l2] = b.split('|');
  if (a === b) return 'same';
  if (l1 === l2) return 'loc';
  if (c1 === c2) return 'lang';
  return 'both';
};
function ovPair(tool, v, a, b) {
  const M = F.overlap[tool][v], d = M[a + '~' + b] || M[b + '~' + a];
  return d && d[1] ? { mean: d[0] / d[1], n: d[1] } : { mean: null, n: 0 };
}
const sumPct = (a, b) => (b ? 100 * a / b : null);

/* ================================================================
   Hero matrix
================================================================ */
function initHero() {
  const root = $('#mx'); if (!root) return;
  const st = { tool: 'AIO', ref: 'FR|fr' };
  const grid = $('.mx-grid', root), read = $('.mx-read', root), segMount = $('#mx-seg');
  segMount.replaceChildren(segmented(TOOLS.map(t => [t, toolName(t)]), st.tool, v => { st.tool = v; paint(); }, T('ui.tool')));
  function build() {
    grid.replaceChildren(H('div', { class: 'h' }));
    COUNTRIES.forEach(c => grid.append(H('div', { class: 'h' }, T('countries_from.' + c), H('small', {}, T('vpn.' + c)))));
    LANGS.forEach(l => {
      grid.append(H('div', { class: 'r' }, T('lang_rows.' + l)));
      COUNTRIES.forEach(c => {
        const k = cellKey(c, l);
        const b = H('button', { type: 'button', class: 'cell', 'data-k': k, 'aria-pressed': String(k === st.ref) });
        b.addEventListener('click', () => { st.ref = k; paint(); });
        grid.append(b);
      });
    });
  }
  function paint() {
    $$('.seg button', segMount).forEach(b => b.setAttribute('aria-pressed', String(b.textContent === toolName(st.tool))));
    $$('.cell', grid).forEach(b => {
      const k = b.dataset.k, r = rel(st.ref, k), o = ovPair(st.tool, 'all', st.ref, k);
      const inten = Math.min(1, (o.mean || 0) / 0.8), a = 10 + 80 * inten;
      const col = { same: 'var(--bg)', loc: 'var(--amber)', lang: 'var(--bordeaux)', both: 'var(--grey)' }[r];
      b.style.background = r === 'same' ? 'var(--bg)' : `color-mix(in srgb, ${col} ${a}%, var(--bg))`;
      b.style.color = inten > .5 && r !== 'same' ? 'var(--on-seg)' : 'var(--ink)';
      b.setAttribute('aria-pressed', String(k === st.ref));
      const thin = o.n < 30;
      b.replaceChildren(H('b', { style: thin ? 'opacity:.6;font-style:italic' : '' }, nf(o.mean, 2)), H('small', {}, r === 'same' ? T('ui.mx_same') : 'n = ' + nf(o.n)));
      b.setAttribute('aria-label', r === 'same'
        ? T('ui.mx_aria_same', { cell: cellLabel(k), v: nf(o.mean, 2) })
        : T('ui.mx_aria', { a: cellLabel(st.ref), b: cellLabel(k), v: nf(o.mean, 2), rel: T('ui.mx_rel_' + r), n: o.n }));
    });
    const d = F.f1[st.tool].all;
    read.innerHTML = T('ui.mx_read_' + st.tool, { loc: nf(d.loc, 2), lang: nf(d.lang, 2), nloc: nf(d.loc_n), nlang: nf(d.lang_n), rep: nf(d.rep, 2) });
  }
  build(); paint();
}

/* ================================================================
   Situation step (rules only; nothing leaves the browser)
================================================================ */
const FINDING_IDS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'];
const REC_IDS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'];
const BAND_ORDER = { a: 3, b: 9 };          // bands sit between findings (finding order = 2 x position)
let lastSit = null;                          // { sel, titles } once the visitor has answered at least one question
function situationScores(sel) {
  const m = sel.markets.length, lg = sel.langs.length, b2b = sel.kind.includes('b2b'), b2c = sel.kind.includes('b2c');
  const f = {}, why = {};
  f.f1 = lg >= 2 ? 3 : lg === 1 && m >= 2 ? 1.5 : 1; why.f1 = lg >= 2 ? 'f1_multi' : 'f1_single';
  f.f2 = m >= 2 ? 3 : 1; why.f2 = m >= 2 ? 'f2_multi' : 'f2_single';
  f.f3 = sel.markets.includes('CH') ? 4 : 0.2; why.f3 = sel.markets.includes('CH') ? 'f3_ch' : 'f3_other';
  f.f4 = 2.5; why.f4 = b2b && !b2c ? 'f4_b2b' : b2c && !b2b ? 'f4_b2c' : 'f4_both';
  f.f5 = b2c ? 3 : b2b ? 1.2 : 1.5; why.f5 = b2c ? 'f5_b2c' : 'f5_b2b';
  f.f6 = lg >= 2 || m >= 2 ? 2.6 : 1; why.f6 = lg >= 2 || m >= 2 ? 'f6_multi' : 'f6_single';
  f.f7 = (lg >= 2 ? 2 : 1) + (b2b ? 1 : 0.3); why.f7 = b2b ? 'f7_b2b' : 'f7_b2c';
  const r = {};
  r.r1 = lg >= 2 ? 3 : 1;
  r.r2 = b2b ? 3 : 0.5;
  r.r3 = b2c ? 3 : 0.5;
  r.r4 = sel.markets.includes('CH') ? 4 : 0;
  r.r5 = b2c ? 2.2 : 1.2;
  r.r6 = m >= 2 ? 2.4 : 1.4;
  r.r7 = 1.6;
  return { f, r, why };
}
const sectorOf = sel => (sel.kind.includes('b2b') && sel.kind.includes('b2c') ? 'B2B + B2C' : sel.kind.includes('b2b') ? 'B2B' : sel.kind.includes('b2c') ? 'B2C' : '');
function placeStem(order, rorder) {
  (order || FINDING_IDS).forEach((id, i) => { const e = $('#' + id); if (e) e.style.order = 2 * i; });
  $$('.band').forEach(b => { b.style.order = BAND_ORDER[b.dataset.band]; });
  (rorder || REC_IDS).forEach((id, i) => { const e = $('#' + id); if (e) e.style.order = i; });
}
function initSituation() {
  const root = $('#situation'); if (!root) return;
  const out = $('.sit-out', root), list = $('ol', out), msg = $('.sit-empty', out), mail = $('.sit-mail', out), go = $('.sit-go', out);
  const read = () => ({
    markets: $$('input[name=mk]:checked', root).map(x => x.value),
    langs: $$('input[name=lg]:checked', root).map(x => x.value),
    kind: $$('input[name=kd]:checked', root).map(x => x.value),
  });
  const apply = () => {
    const sel = read(), any = sel.markets.length + sel.langs.length + sel.kind.length > 0;
    document.body.classList.toggle('has-situation', any);
    FINDING_IDS.forEach(id => { const e = $('#' + id); if (e) e.classList.remove('is-hot'); });
    REC_IDS.forEach(id => { const e = $('#' + id); if (e) e.classList.remove('is-hot'); });
    $$('.rail .sub a, .chap-m .sub a').forEach(x => { x.classList.remove('hot'); const d = $('.dot-sr', x); if (d) d.remove(); });
    if (!any) {
      placeStem();
      list.replaceChildren(); msg.hidden = false; $('.sit-note', out).hidden = true; mail.hidden = true; go.hidden = true;
      lastSit = null; store.del('cbai_sit'); window.dispatchEvent(new CustomEvent('cbai:situation')); return;
    }
    store.set('cbai_sit', JSON.stringify(sel));
    const { f, r, why } = situationScores(sel);
    const order = FINDING_IDS.slice().sort((a, b) => f[b] - f[a] || FINDING_IDS.indexOf(a) - FINDING_IDS.indexOf(b));
    const rorder = REC_IDS.slice().sort((a, b) => r[b] - r[a] || REC_IDS.indexOf(a) - REC_IDS.indexOf(b));
    placeStem(order, rorder);
    order.forEach((id, i) => { const hot = i < 3 && f[id] >= 2.5; $('#' + id).classList.toggle('is-hot', hot); if (hot) $$('.rail .sub a[data-ch=' + id + '], .chap-m .sub a[data-ch=' + id + ']').forEach(x => { x.classList.add('hot'); x.append(H('span', { class: 'sr dot-sr' }, ' (' + T('ui.for_you').replace(/:$/, '') + ')')); }); });
    rorder.forEach(id => { $('#' + id).classList.toggle('is-hot', r[id] >= 3); });
    FINDING_IDS.forEach(id => { const e = $('#' + id + ' .for-you'); if (e) e.innerHTML = '<b>' + esc(T('ui.for_you')) + '</b> ' + T('situation.why.' + why[id]); });
    list.replaceChildren(...order.slice(0, 3).map((id, i) => H('li', {},
      H('b', {}, String(i + 1)),
      H('div', {}, H('a', { href: '#' + id }, T('situation.titles.' + id)), H('div', { class: 'why', html: T('situation.why.' + why[id]) })))));
    msg.hidden = true; $('.sit-note', out).hidden = false; mail.hidden = false; go.hidden = false;
    lastSit = { sel, titles: order.slice(0, 3).map(id => T('situation.titles.' + id)) };
    window.dispatchEvent(new CustomEvent('cbai:situation'));
  };
  $$('input', root).forEach(x => x.addEventListener('change', apply));
  const saved = store.get('cbai_sit');
  if (saved) {
    try {
      const s = JSON.parse(saved);
      $$('input[name=mk]', root).forEach(x => { x.checked = (s.markets || []).includes(x.value); });
      $$('input[name=lg]', root).forEach(x => { x.checked = (s.langs || []).includes(x.value); });
      $$('input[name=kd]', root).forEach(x => { x.checked = (s.kind || []).includes(x.value); });
    } catch (e) { /* ignore */ }
  }
  $('.sit-reset', root).addEventListener('click', () => { $$('input', root).forEach(x => { x.checked = false; }); apply(); });
  apply();
  initMiniMail(root);
}

/* "Get my priorities by email": a short form under the diagnostic */
function initMiniMail(root) {
  const open = $('.sit-mail-open', root), form = $('.mailf', root), ok = $('.mail-ok', root), wrap = $('.sit-mail', root);
  if (!open || !form) return;
  open.addEventListener('click', () => { const show = form.hidden; form.hidden = !show; open.setAttribute('aria-expanded', String(show)); if (show) $('input[name=name]', form).focus(); });
  const msg = $('.msg', form), btn = $('button[type=submit]', form);
  form.addEventListener('submit', async e => {
    e.preventDefault(); msg.className = 'msg'; msg.textContent = '';
    if ($('.hp input', form).value) return;
    const name = form.elements.name.value.trim(), email = form.elements.email.value.trim();
    if (!name) { msg.className = 'msg err'; msg.textContent = T('ui.g_err_name'); form.elements.name.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.className = 'msg err'; msg.textContent = T('ui.g_err_email'); form.elements.email.focus(); return; }
    if (!form.elements.consent.checked) { msg.className = 'msg err'; msg.textContent = T('ui.g_err_consent'); return; }
    btn.disabled = true; btn.textContent = T('ui.g_sending');
    const r = await submitLead(Object.assign({ name, email }, sitFields()));
    btn.disabled = false; btn.textContent = btn.dataset.label;
    if (r.ok) { form.hidden = true; open.hidden = true; ok.hidden = false; wrap.classList.add('sent'); unlock('mini'); }
    else { msg.className = 'msg err'; msg.textContent = r.reason === 'unconfigured' ? T('ui.g_err_unconfigured') : T('ui.g_err_send'); }
  });
}
/* what the diagnostic knows, in the shape the lead form wants */
function sitFields() {
  if (!lastSit) return {};
  const s = lastSit.sel;
  return { markets: s.markets.join(', '), langs: s.langs.join(', '), sector: sectorOf(s), priorities: lastSit.titles };
}

/* ================================================================
   Explorer
================================================================ */
const MEASURES = {
  local: c => sumPct(c.pl.local, c.n),
  neighbour: c => sumPct(c.pl.neighbour, c.n),
  global: c => sumPct(c.pl.global, c.n),
  langmatch: c => sumPct(c.lm[0], c.lm[1]),
  brand: c => sumPct(c.st.brand, c.n),
  third: c => sumPct(GROUPS.third.reduce((a, s) => a + c.st[s], 0), c.n),
  trade: c => sumPct(GROUPS.trade.reduce((a, s) => a + c.st[s], 0), c.n),
  ugc: c => sumPct(GROUPS.ugc.reduce((a, s) => a + c.st[s], 0), c.n),
  n: c => c.n,
};
const MEASURE_ORDER = ['local', 'neighbour', 'global', 'langmatch', 'brand', 'third', 'trade', 'ugc', 'aio', 'n'];

function topDomains(tool, v, key, limit) {
  if (!G) return null;
  const dm = G.domains[tool][key] || {}, rows = [];
  for (const d in dm) { const c = v === 'all' ? dm[d][0] + dm[d][1] : v === 'CW' ? dm[d][0] : dm[d][1]; if (c > 0) rows.push([d, c]); }
  rows.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return rows.slice(0, limit);
}
const domMeta = d => (G && G.domain_meta[d]) || ['other', ''];

function stackBar(parts, total, labelMin = 6) {
  const bar = H('div', { class: 'stack', role: 'img', 'aria-label': parts.map(p => `${p.label} ${pf(p.pct)}`).join(', ') });
  parts.forEach(p => {
    if (p.pct <= 0) return;
    const seg = H('div', { class: p.light ? 'l' : '', style: `width:${p.pct}%;background:var(--${p.col})` }, p.pct >= labelMin ? String(Math.round(p.pct)) : '');
    tipOn(seg, () => `<b>${esc(p.label)}</b>${pf(p.pct)}<span class="tm">n = ${nf(total)} ${esc(T('ui.citations'))}</span>`);
    bar.append(seg);
  });
  return bar;
}
function stackLegend(parts) {
  return H('div', { class: 'stk-leg' }, parts.map(p => H('span', {}, H('i', { style: `background:var(--${p.col})` }), p.label)));
}
function lockCta(textKey) {
  return H('div', { class: 'peek-cta' }, H('a', { class: 'btn amber sm', href: '#acces' }, T(textKey || 'ui.unlock_cta')));
}

function initExplorer() {
  const root = $('#explorer'); if (!root) return;
  const tabs = $$('[role=tab]', root), panels = $$('.panel', root);
  function showTab(id) {
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
    panels.forEach(p => { p.hidden = p.dataset.tab !== id; });
    store.set('cbai_tab', id);
  }
  tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  tabs.forEach((t, i) => t.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; n.focus(); showTab(n.dataset.tab);
    }
  }));
  showTab('cases');
  renderCases(); renderCompare(); renderQuestions(); renderBrands(); renderMeasures();
  window.addEventListener('cbai:unlocked', () => { renderCases(); renderCompare(); renderBrands(); renderMeasures(); });
}

/* ---- tab 1: the nine set-ups ---- */
const exState = { tool: 'AIO', v: 'all', m: 'local', cell: 'DE|de' };
function renderCases() {
  const host = $('#tab-cases'); if (!host) return;
  host.replaceChildren();
  const ctl = H('div', { class: 'ex-ctl' });
  const sel = (id, label, options, val, on) => {
    const s = H('select', { id, 'aria-label': label }, options.map(([v, t]) => H('option', { value: v, selected: v === val }, t)));
    s.addEventListener('change', () => on(s.value));
    return H('div', {}, H('label', { class: 'l', for: id }, label), s);
  };
  ctl.append(
    H('div', {}, H('span', { class: 'l', style: 'display:block;font-size:12.5px;color:var(--muted);margin:0 0 5px' }, T('ui.tool')), segmented(TOOLS.map(t => [t, toolName(t)]), exState.tool, v => { exState.tool = v; if (v !== 'AIO' && exState.m === 'aio') exState.m = 'local'; draw(); }, T('ui.tool'))),
    H('div', {}, H('span', { style: 'display:block;font-size:12.5px;color:var(--muted);margin:0 0 5px' }, T('ui.sector')), segmented([['all', vertName('all')], ['CW', vertName('CW')], ['EA', vertName('EA')]], exState.v, v => { exState.v = v; draw(); }, T('ui.sector'))),
  );
  const mSel = H('div', {});
  ctl.append(mSel);
  const split = H('div', { class: 'ex-split' });
  const gridHost = H('div', {}), detail = H('div', { class: 'xdetail', 'aria-live': 'polite' });
  split.append(gridHost, detail);
  host.append(ctl, split);

  function measureValue(k) {
    if (exState.m === 'aio') {
      const t = F.trigger[exState.v][k]; return t ? { v: 100 * t[0] / t[1], n: t[1], text: pf(100 * t[0] / t[1], 0) } : { v: null, n: 0, text: '–' };
    }
    const c = F.cells[exState.tool][exState.v][k], v = MEASURES[exState.m](c);
    return { v, n: c.n, text: exState.m === 'n' ? nf(v) : pf(v, 0) };
  }
  function draw() {
    // measure picker
    const opts = MEASURE_ORDER.filter(m => m !== 'aio' || exState.tool === 'AIO').map(m => [m, T('measures.' + m)]);
    const s = H('select', { id: 'ex-m', 'aria-label': T('ui.measure') }, opts.map(([v, t]) => H('option', { value: v, selected: v === exState.m }, t)));
    s.addEventListener('change', () => { exState.m = s.value; draw(); });
    mSel.replaceChildren(H('label', { class: 'l', for: 'ex-m' }, T('ui.measure')), s);
    // grid
    const vals = CELLS.map(([c, l]) => measureValue(cellKey(c, l)).v).filter(x => x != null);
    const max = exState.m === 'n' ? Math.max(...vals) : 100, g = H('div', { class: 'xgrid', role: 'group', 'aria-label': T('ui.nine') });
    g.append(H('div', { class: 'h' }));
    COUNTRIES.forEach(c => g.append(H('div', { class: 'h' }, T('countries_from.' + c))));
    LANGS.forEach(l => {
      g.append(H('div', { class: 'r' }, T('lang_rows.' + l)));
      COUNTRIES.forEach(c => {
        const k = cellKey(c, l), mv = measureValue(k), inten = mv.v == null ? 0 : mv.v / max;
        const thin = mv.n < 30;
        const b = H('button', { type: 'button', class: 'xcell' + (thin ? ' thin' : ''), 'aria-pressed': String(k === exState.cell), 'aria-label': `${cellLabel(k)}: ${mv.text}, n = ${mv.n}` },
          H('b', {}, mv.text), H('small', {}, 'n = ' + nf(mv.n) + (thin ? ' *' : '')));
        b.style.background = `color-mix(in srgb, var(--ink) ${Math.round(6 + 60 * inten)}%, var(--bg))`;
        b.style.color = inten > .55 ? 'var(--bg)' : 'var(--ink)';
        b.addEventListener('click', () => { exState.cell = k; draw(); });
        g.append(b);
      });
    });
    gridHost.replaceChildren(g, H('p', { class: 'note', style: 'margin-top:10px' }, T('ui.thin_note')), H('p', { class: 'note' }, T('measure_help.' + exState.m)));
    // detail
    const k = exState.cell, tool = exState.tool, v = exState.v, c = F.cells[tool][v][k];
    const head = H('h3', {}, `${toolName(tool)}, ${cellLabel(k)}`);
    const sub = H('p', { class: 'sub' }, `${vertName(v)}. ${T('ui.base')}: ${nf(c.n)} ${T('ui.citations')} (${T('basis.' + (tool === 'PPLX' ? 'all' : 'stable'))}).`);
    const groupParts = GROUP_ORDER.map(gk => ({ label: T('groups.' + gk), col: GROUP_VAR[gk], pct: sumPct(GROUPS[gk].reduce((a, s) => a + c.st[s], 0), c.n) || 0, light: gk === 'other' }));
    const plParts = [['local', 'amber'], ['neighbour', 'bordeaux'], ['global', 'ink']].map(([p, col]) => ({ label: T('places.' + p), col, pct: sumPct(c.pl[p], c.n) || 0 }));
    const rest = 100 - plParts.reduce((a, p) => a + p.pct, 0);
    if (rest > .05) plParts.push({ label: T('places.other'), col: 'light', pct: rest, light: true });
    const body = H('div', {}, head, sub);
    if (c.n === 0) { body.append(H('p', {}, T('ui.no_citations'))); }
    else {
      body.append(H('h4', {}, T('ui.what_kinds')), stackBar(groupParts, c.n), stackLegend(groupParts),
        H('h4', {}, T('ui.where_from')), stackBar(plParts, c.n), stackLegend(plParts));
      if (c.lm[1]) body.append(H('p', { class: 'note', style: 'margin-top:10px' }, T('ui.lang_match_line', { p: pf(sumPct(c.lm[0], c.lm[1]), 0), n: nf(c.lm[1]) })));
      if (tool === 'AIO') { const t = F.trigger[v][k]; body.append(H('p', { class: 'note' }, T('ui.aio_line', { a: nf(t[0]), b: nf(t[1]), p: pf(100 * t[0] / t[1], 0) }))); }
    }
    if (c.n < 30 && c.n > 0) body.append(H('p', { class: 'warn' }, T('ui.thin_warn', { n: c.n })));
    // top domains: three free, the rest after unlock
    const dwrap = H('div', { class: 'peek' + (isUnlocked() ? '' : ' is-locked') });
    const top = isUnlocked() ? topDomains(tool, v, k, 10) : (F.top3[tool][v][k] || []).map(x => [x[0], x[1]]);
    const metaOf = d => isUnlocked() ? domMeta(d) : [(F.top3[tool][v][k].find(x => x[0] === d) || [0, 0, 'other', ''])[2], (F.top3[tool][v][k].find(x => x[0] === d) || [0, 0, 'other', ''])[3]];
    const denom = v === 'all' ? 24 : 12;
    const tb = H('table', { class: 'top-d' });
    const maxc = top.length ? top[0][1] : 1;
    top.forEach(([d, n]) => {
      const m = metaOf(d);
      tb.append(H('tr', {}, H('td', {}, H('span', { class: 'dm' }, d), H('span', { class: 'ty' }, ' ' + T('types.' + m[0]) + (m[1] ? ', ' + m[1] : '')), H('span', { class: 'bar', style: `width:${Math.max(3, 100 * n / maxc)}%` })), H('td', { class: 'n' }, `${n}/${denom}`)));
    });
    dwrap.append(H('div', { class: 'peek-body' }, tb), lockCta('ui.unlock_domains'));
    body.append(H('h4', {}, T('ui.top_domains')), H('p', { class: 'note', style: 'margin:0 0 6px' }, T('ui.top_domains_help', { d: denom })), dwrap);
    detail.replaceChildren(body);
  }
  draw();
}

/* ---- tab 2: compare two set-ups ---- */
const cmpState = { tool: 'AIO', v: 'all', a: 'FR|fr', b: 'DE|fr' };
function renderCompare() {
  const host = $('#tab-compare'); if (!host) return;
  host.replaceChildren();
  const cellOpts = CELLS.map(([c, l]) => [cellKey(c, l), cellLabel(cellKey(c, l))]);
  const mkSel = (id, label, opts, key) => {
    const s = H('select', { id, 'aria-label': label }, opts.map(([v, t]) => H('option', { value: v, selected: v === cmpState[key] }, t)));
    s.addEventListener('change', () => { cmpState[key] = s.value; draw(); });
    return H('div', {}, H('label', { class: 'l', for: id }, label), s);
  };
  const sel = H('div', { class: 'cmp-sel' },
    mkSel('cmp-a', T('ui.setup_a'), cellOpts, 'a'), mkSel('cmp-b', T('ui.setup_b'), cellOpts, 'b'),
    mkSel('cmp-t', T('ui.tool'), TOOLS.map(t => [t, toolName(t)]), 'tool'),
    mkSel('cmp-v', T('ui.sector'), ['all', 'CW', 'EA'].map(v => [v, vertName(v)]), 'v'));
  const out = H('div', { 'aria-live': 'polite' });
  host.append(sel, out);
  function draw() {
    const { tool, v, a, b } = cmpState, r = rel(a, b), o = ovPair(tool, v, a, b);
    const ref = (ovPair(tool, v, a, a).mean + ovPair(tool, v, b, b).mean) / 2;
    const counts = (F.pairs[tool][v][a + '~' + b] || F.pairs[tool][v][b + '~' + a] || [0, 0, 0]);
    const swapped = !F.pairs[tool][v][a + '~' + b];
    const both = counts[0], onlyA = swapped ? counts[2] : counts[1], onlyB = swapped ? counts[1] : counts[2];
    out.replaceChildren();
    if (a === b) { out.append(H('p', {}, T('ui.cmp_same'))); return; }
    const big = H('div', {}, H('h4', {}, T('ui.cmp_overlap')), H('p', { class: 'cmp-big' }, nf(o.mean, 2)),
      H('p', { class: 'note' }, T('ui.cmp_overlap_help', { rel: T('ui.mx_rel_' + r), n: nf(o.n), ref: nf(ref, 2) })));
    const cnt = H('div', {}, H('h4', {}, T('ui.cmp_counts')),
      H('p', { style: 'margin:0 0 4px' }, T('ui.cmp_both', { n: nf(both) })),
      H('p', { style: 'margin:0 0 4px' }, T('ui.cmp_only', { cell: cellLabel(a), n: nf(onlyA) })),
      H('p', { style: 'margin:0' }, T('ui.cmp_only', { cell: cellLabel(b), n: nf(onlyB) })),
      H('p', { class: 'note', style: 'margin-top:8px' }, T('ui.cmp_counts_help')));
    const lists = H('div', {});
    if (isUnlocked() && G) {
      const da = G.domains[tool][a] || {}, db = G.domains[tool][b] || {};
      const cnt_ = (m, d) => v === 'all' ? m[d][0] + m[d][1] : v === 'CW' ? m[d][0] : m[d][1];
      const keys = new Set([...Object.keys(da), ...Object.keys(db)]);
      const A = [], B = [], X = [];
      keys.forEach(d => {
        const ca = da[d] ? cnt_(da, d) : 0, cb = db[d] ? cnt_(db, d) : 0;
        if (ca && cb) X.push([d, ca, cb]); else if (ca) A.push([d, ca]); else if (cb) B.push([d, cb]);
      });
      X.sort((p, q) => (q[1] + q[2]) - (p[1] + p[2])); A.sort((p, q) => q[1] - p[1]); B.sort((p, q) => q[1] - p[1]);
      const pills = (rows, f) => H('div', { class: 'chips-s' }, rows.slice(0, 12).map(r => H('span', { class: 'pill' }, f(r))));
      lists.append(H('h4', {}, T('ui.cmp_shared_list')), pills(X, r => `${r[0]} (${r[1]}/${r[2]})`),
        H('h4', { style: 'margin-top:16px' }, T('ui.cmp_only_list', { cell: cellLabel(a) })), pills(A, r => `${r[0]} (${r[1]})`),
        H('h4', { style: 'margin-top:16px' }, T('ui.cmp_only_list', { cell: cellLabel(b) })), pills(B, r => `${r[0]} (${r[1]})`),
        H('p', { class: 'note', style: 'margin-top:12px' }, T('ui.cmp_list_help')));
    } else {
      lists.append(H('div', { class: 'lockbox' }, H('p', {}, T('ui.cmp_locked')), H('a', { class: 'btn amber sm', href: '#acces' }, T('ui.unlock_cta'))));
    }
    out.append(H('div', { class: 'cmp-out' }, big, cnt), H('div', { style: 'margin-top:26px' }, lists));
  }
  draw();
}

/* ---- tab 3: brands (gated) ---- */
const brState = { origin: 'all', scale: 'all', q: '', sel: null, tool: 'all' };
function renderBrands() {
  const host = $('#tab-brands'); if (!host) return;
  host.replaceChildren();
  const sm = F.brand_summary;
  const summary = H('div', { class: 'note', style: 'max-width:46rem;margin-bottom:18px' },
    T('ui.br_summary', { n: nf(sm.total), g: nf(sm.giant), c: nf(sm.champion), fr: nf(sm.origin.FR || 0), de: nf(sm.origin.DE || 0), ch: nf(sm.origin.CH || 0), other: nf(sm.total - (sm.origin.FR || 0) - (sm.origin.DE || 0) - (sm.origin.CH || 0)) }));
  host.append(summary);
  if (!isUnlocked() || !G) {
    host.append(H('div', { class: 'lockbox' }, H('p', {}, T('ui.br_locked')), H('a', { class: 'btn amber sm', href: '#acces' }, T('ui.unlock_cta'))));
    return;
  }
  const ctl = H('div', { class: 'ex-ctl' });
  const mk = (id, label, opts, key) => {
    const s = H('select', { id, 'aria-label': label }, opts.map(([v, t]) => H('option', { value: v, selected: v === brState[key] }, t)));
    s.addEventListener('change', () => { brState[key] = s.value; draw(); });
    return H('div', {}, H('label', { class: 'l', for: id }, label), s);
  };
  const q = H('input', { type: 'search', id: 'br-q', placeholder: T('ui.br_search'), 'aria-label': T('ui.br_search'), style: 'font:400 15px var(--sans);padding:9px 12px;border:1px solid var(--line);border-radius:3px;background:var(--bg);color:var(--ink);min-height:40px' });
  q.addEventListener('input', () => { brState.q = q.value.toLowerCase(); draw(); });
  ctl.append(mk('br-o', T('ui.br_origin'), [['all', T('ui.all')], ['FR', 'FR'], ['DE', 'DE'], ['CH', 'CH'], ['other', T('ui.other_origin')]], 'origin'),
    mk('br-s', T('ui.br_scale'), [['all', T('ui.all')], ['giant', T('ui.giant')], ['champion', T('ui.champion')]], 'scale'),
    mk('br-t', T('ui.tool'), [['all', T('ui.all_tools')], ...TOOLS.map(t => [t, toolName(t)])], 'tool'),
    H('div', {}, H('label', { class: 'l', for: 'br-q' }, T('ui.br_search')), q));
  const split = H('div', { class: 'ex-split br' }), tblHost = H('div', { style: 'overflow-x:auto' }), det = H('div', { class: 'xdetail', 'aria-live': 'polite' });
  split.append(tblHost, det); host.append(ctl, split, H('p', { class: 'note', style: 'margin-top:14px' }, T('ui.br_note')));
  function draw() {
    const rows = G.brands.filter(b => (brState.origin === 'all' || (brState.origin === 'other' ? !['FR', 'DE', 'CH'].includes(b.origin) : b.origin === brState.origin))
      && (brState.scale === 'all' || b.scale === brState.scale) && (!brState.q || b.brand.toLowerCase().includes(brState.q)));
    const tbl = H('table', { class: 'brand-tbl' }, H('thead', {}, H('tr', {}, ...['ui.br_brand', 'ui.br_origin_s', 'ui.br_size', 'ui.br_sector', 'ui.br_named', 'ui.br_linked'].map((k, i) => H('th', { class: i > 3 ? 'n' : '', style: i > 3 ? 'text-align:right' : '' }, T(k))))));
    const tb = H('tbody');
    rows.forEach(b => tb.append(H('tr', {}, H('td', {}, H('button', { type: 'button', onclick: () => { brState.sel = b.brand; drawDetail(); } }, b.brand)), H('td', {}, b.origin), H('td', {}, T('ui.' + b.scale)), H('td', {}, vertName(b.vertical)), H('td', { class: 'n' }, nf(b.answers)), H('td', { class: 'n' }, pf(b.linked, 0)))));
    if (!rows.length) tb.append(H('tr', {}, H('td', { colspan: 6 }, T('ui.br_none'))));
    tbl.append(tb); tblHost.replaceChildren(tbl);
    if (!brState.sel && rows.length) brState.sel = rows[0].brand;
    drawDetail();
  }
  function drawDetail() {
    const b = G.brands.find(x => x.brand === brState.sel); if (!b) { det.replaceChildren(); return; }
    const ti = brState.tool === 'all' ? [0, 1, 2] : [TOOLS.indexOf(brState.tool)];
    const den = G.brand_den[b.vertical];
    const wrap = H('div', {});
    wrap.append(H('h3', {}, b.brand), H('p', { class: 'sub' }, T('ui.br_meta', { o: b.origin, s: T('ui.' + b.scale), v: vertName(b.vertical), a: nf(b.answers), l: pf(b.linked, 0), t: brState.tool === 'all' ? T('ui.all_tools') : toolName(brState.tool) })));
    const mg = H('div', { class: 'mini-grid', role: 'group', 'aria-label': T('ui.br_grid') });
    mg.append(H('div', { class: 'h' }));
    COUNTRIES.forEach(c => mg.append(H('div', { class: 'h' }, c)));
    let thin = false;
    LANGS.forEach(l => {
      mg.append(H('div', { class: 'r' }, l.toUpperCase()));
      COUNTRIES.forEach(c => {
        const k = cellKey(c, l), a = ti.reduce((s, i) => s + b.grid[k][i], 0), d = ti.reduce((s, i) => s + den[k][i], 0);
        const share = d ? a / d : 0;
        if (d < 30) thin = true;
        const cell = H('div', { class: 'c', style: `background:color-mix(in srgb, var(--${b.vertical === 'CW' ? 'amber' : 'forest'}) ${Math.round(share * 100 * 1.4)}%, var(--bg))` }, `${a}/${d}`);
        tipOn(cell, () => `<b>${esc(b.brand)}</b>${esc(cellLabel(k))}<span class="tm">${esc(T('ui.br_cell_tip', { a, d, p: nf(share * 100, 0) }))}</span>`);
        mg.append(cell);
      });
    });
    wrap.append(H('h4', {}, T('ui.br_grid_title')), mg, H('p', { class: 'note', style: 'margin-top:10px' }, T('ui.br_grid_help')));
    if (thin) wrap.append(H('p', { class: 'warn' }, T('ui.br_thin')));
    det.replaceChildren(wrap);
  }
  draw();
}

/* ---- tab 4: other measures (gated) ---- */
function renderMeasures() {
  const host = $('#tab-measures'); if (!host) return;
  host.replaceChildren();
  if (!isUnlocked() || !G) {
    host.append(H('div', { class: 'lockbox' }, H('p', {}, T('ui.me_locked')), H('a', { class: 'btn amber sm', href: '#acces' }, T('ui.unlock_cta'))));
    return;
  }
  const O = G.others;
  const table = (title, help, head, rows) => H('div', { style: 'margin-bottom:30px' }, H('h4', { style: 'font:600 15px var(--sans);margin:0 0 4px' }, title), H('p', { class: 'note', style: 'margin:0 0 8px' }, help),
    H('div', { class: 'tscroll' }, H('table', { class: 'dt' }, H('thead', {}, H('tr', {}, head.map(h => H('th', {}, h)))), H('tbody', {}, rows.map(r => H('tr', {}, r.map(c => H('td', {}, c))))))));
  host.append(
    table(T('ui.me_rank'), T('ui.me_rank_help'), [T('ui.tool'), vertName('all'), vertName('CW'), vertName('EA')],
      TOOLS.map(t => [toolName(t), ...['all', 'CW', 'EA'].map(v => `${pf(O.ranking[t][v].pct, 0)} (n = ${nf(O.ranking[t][v].n)})`)])),
    table(T('ui.me_stab'), T('ui.me_stab_help'), [T('ui.tool'), vertName('all'), vertName('CW'), vertName('EA'), T('ui.me_twice')],
      TOOLS.map(t => [toolName(t), ...['all', 'CW', 'EA'].map(v => `${nf(O.stability[t][v].overlap, 2)} (n = ${nf(O.stability[t][v].pairs)})`), pf(O.stability[t].all.twice_pct, 0)])),
    table(T('ui.me_conc'), T('ui.me_conc_help'), [T('ui.tool'), T('ui.me_min'), T('ui.me_max')],
      TOOLS.map(t => { const v = O.concentration[t].map(x => x.top10); const lo = Math.min(...v), hi = Math.max(...v); const cl = O.concentration[t].find(x => x.top10 === lo).cell, ch = O.concentration[t].find(x => x.top10 === hi).cell; return [toolName(t), `${pf(lo, 0)} (${cellLabel(cl)})`, `${pf(hi, 0)} (${cellLabel(ch)})`]; })),
    table(T('ui.me_port'), T('ui.me_port_help'), [T('ui.tool'), T('ui.me_domains'), T('ui.me_in1'), T('ui.me_in3')],
      TOOLS.map(t => { const p = F.f1_portable[t]; return [toolName(t), nf(p.domains), pf(p.in1_pct, 0), pf(p.in3_pct, 0)]; })));
}

/* ---- tab 5: the 24 questions (free) ---- */
const qState = { v: 'all', lang: LANG === 'fr' || LANG === 'de' ? LANG : 'en' };
function renderQuestions() {
  const host = $('#tab-questions'); if (!host) return;
  host.replaceChildren();
  const ctl = H('div', { class: 'ex-ctl' },
    H('div', {}, H('span', { style: 'display:block;font-size:12.5px;color:var(--muted);margin:0 0 5px' }, T('ui.sector')), segmented([['all', vertName('all')], ['CW', vertName('CW')], ['EA', vertName('EA')]], qState.v, v => { qState.v = v; draw(); }, T('ui.sector'))),
    H('div', {}, H('span', { style: 'display:block;font-size:12.5px;color:var(--muted);margin:0 0 5px' }, T('ui.q_lang')), segmented([['fr', 'FR'], ['de', 'DE'], ['en', 'EN']], qState.lang, v => { qState.lang = v; draw(); }, T('ui.q_lang'))));
  const list = H('ol', { class: 'q-list' });
  host.append(H('p', { class: 'note', style: 'margin-bottom:14px' }, T('ui.q_help')), ctl, list);
  function draw() {
    list.replaceChildren(...F.prompts.filter(p => qState.v === 'all' || p.vertical === qState.v).map(p =>
      H('li', {}, H('span', { class: 'id' }, p.id), H('span', { class: 'tx' }, p[qState.lang]),
        H('span', { class: 'mt' }, `${vertName(p.vertical)}, ${T('stages.' + p.stage)}${p.branded ? ', ' + T('ui.q_branded') : ''}`))));
  }
  draw();
}

/* ================================================================
   Gate (soft): MailerLite embedded-form endpoint, unlock in the browser
================================================================ */
async function loadGated() {
  if (G) return G;
  if (window.__GATED__) { G = window.__GATED__; return G; }
  const r = await fetch(CFG.gatedUrl); G = await r.json(); return G;
}
async function unlock(why) {
  document.body.classList.add('is-unlocked');
  store.set('cbai_unlocked', '1');
  $$('.rec').forEach(r => r.classList.remove('is-locked'));
  $$('[data-lockable]').forEach(e => e.classList.remove('is-locked'));
  try { await loadGated(); } catch (e) { console.warn('gated data not loaded', e); }
  window.dispatchEvent(new CustomEvent('cbai:unlocked', { detail: why }));
}
async function submitLead(d) {
  const ml = CFG.gate.mailerlite || {};
  if (!ml.account || !ml.form) return { ok: false, reason: 'unconfigured' };
  const url = `https://assets.mailerlite.com/jsonp/${ml.account}/forms/${ml.form}/subscribe`;
  const fd = new FormData();
  const put = (k, v) => { if (v) fd.append('fields[' + k + ']', v); };
  put('email', d.email); put('name', d.name); put('company', d.company); put('company_size', d.size);
  put('markets', d.markets); put('languages', d.langs); put('sector', d.sector); put('study_language', CFG.lang);
  // no diagnostic answers: send the first three findings of the study, so the "where to start" block of the email is never empty
  const pr = (d.priorities && d.priorities.length) ? d.priorities : FINDING_IDS.slice(0, 3).map(id => T('situation.titles.' + id));
  pr.slice(0, 3).forEach((t, i) => put('priority_' + (i + 1), t));
  fd.append('ml-submit', '1'); fd.append('anticsrf', 'true');
  try {
    const r = await fetch(url, { method: 'POST', body: fd });
    let j = null; try { j = await r.json(); } catch (e) { /* not json */ }
    if (j && j.success === false) return { ok: false, reason: 'rejected', errors: j.errors };
    return { ok: r.ok };
  } catch (e) {
    try { await fetch(url, { method: 'POST', body: fd, mode: 'no-cors' }); return { ok: true, opaque: true }; } catch (e2) { return { ok: false, reason: 'network' }; }
  }
}
function prefillGate() {
  const form = $('#gform'); if (!form || form.dataset.touched || !lastSit) return;
  const s = lastSit.sel;
  $$('input[name=gm]', form).forEach(x => { x.checked = s.markets.includes(x.value); });
  $$('input[name=gl]', form).forEach(x => { x.checked = s.langs.includes(x.value); });
}
function initGate() {
  const form = $('#gform');
  if (store.get('cbai_unlocked') === '1' || /[?&]unlocked=1\b/.test(location.search)) unlock('stored');
  if (!form) return;
  const msg = $('.msg', form), btn = $('button[type=submit]', form);
  $$('input[name=gm], input[name=gl]', form).forEach(x => x.addEventListener('change', () => { form.dataset.touched = '1'; }));
  window.addEventListener('cbai:situation', prefillGate); prefillGate();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.className = 'msg'; msg.textContent = '';
    if ($('.hp input', form).value) return;           // honeypot
    const name = form.elements.name.value.trim(), email = form.elements.email.value.trim();
    if (!name) { msg.className = 'msg err'; msg.textContent = T('ui.g_err_name'); form.elements.name.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.className = 'msg err'; msg.textContent = T('ui.g_err_email'); form.elements.email.focus(); return; }
    if (!form.elements.consent.checked) { msg.className = 'msg err'; msg.textContent = T('ui.g_err_consent'); return; }
    btn.disabled = true; btn.textContent = T('ui.g_sending');
    const sit = sitFields();
    const data = Object.assign({}, sit, {
      name, email, company: form.elements.company.value.trim(), size: form.elements.size.value,
      markets: $$('input[name=gm]:checked', form).map(x => x.value).join(', ') || sit.markets,
      langs: $$('input[name=gl]:checked', form).map(x => x.value).join(', ') || sit.langs,
    });
    const r = await submitLead(data);
    btn.disabled = false; btn.textContent = T('ui.g_btn');
    if (r.ok) { unlock('form'); const d = $('.gate-done'); if (d) d.scrollIntoView({ block: 'nearest' }); }
    else if (r.reason === 'unconfigured') { msg.className = 'msg err'; msg.textContent = T('ui.g_err_unconfigured'); }
    else { msg.className = 'msg err'; msg.textContent = T('ui.g_err_send'); }
  });
  const pv = $('#gate-preview');
  if (pv) { if (!CFG.gate.preview) pv.remove(); else pv.addEventListener('click', () => unlock('preview')); }
}

/* ================================================================
   Navigation: chapters rail, mobile menu, reading progress; citation copy
================================================================ */
function initNav() {
  const links = $$('.rail a[data-ch], .chap-m a[data-ch]');
  const ids = [...new Set(links.map(a => a.dataset.ch))];
  const els = ids.map(id => document.getElementById(id)).filter(Boolean);
  const bar = $('.prog i'), prog = $('.prog'), cur = $('.cm-c'), menu = $('.chap-m');
  const titleOf = id => { const a = links.find(x => x.dataset.ch === id); return a ? a.childNodes[0].textContent : ''; };
  let busy = false, lastActive = null;
  function update() {
    busy = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? Math.min(100, Math.max(0, 100 * window.scrollY / max)) : 0;
    if (bar) bar.style.transform = `scaleX(${pct / 100})`;
    if (prog) prog.setAttribute('aria-valuenow', String(Math.round(pct)));
    const line = window.innerHeight * 0.3;
    let active = null, best = -Infinity;
    els.forEach(el => { const t = el.getBoundingClientRect().top; if (t <= line && t > best) { best = t; active = el.id; } });
    if (!active) active = 'situation';
    if (active === lastActive) return;
    lastActive = active;
    const inFindings = active === 'constats' || FINDING_IDS.includes(active);
    links.forEach(a => {
      const on = a.dataset.ch === active;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      a.classList.toggle('in', a.dataset.ch === 'constats' && inFindings && !on);
    });
    $$('li.has-sub').forEach(li => li.classList.toggle('open', inFindings));
    if (cur) cur.textContent = titleOf(active);
    const ra = $('.rail a[aria-current=true]');
    if (ra) { const rail = $('.rail'); if (rail && rail.scrollHeight > rail.clientHeight) { const r = ra.getBoundingClientRect(), q = rail.getBoundingClientRect(); if (r.top < q.top + 8 || r.bottom > q.bottom - 60) ra.scrollIntoView({ block: 'center' }); } }
  }
  const queue = () => { if (!busy) { busy = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  window.addEventListener('cbai:unlocked', queue);
  update();
  if (menu) {
    $$('a', menu).forEach(a => a.addEventListener('click', () => { menu.open = false; }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.open) { menu.open = false; $('summary', menu).focus(); } });
    document.addEventListener('click', e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  }
  const cb = $('#copy-cite');
  if (cb) cb.addEventListener('click', async () => {
    const txt = $('#cite-text').textContent.trim();
    try { await navigator.clipboard.writeText(txt); cb.textContent = T('ui.copied'); setTimeout(() => { cb.textContent = T('ui.copy'); }, 1800); } catch (e) { /* ignore */ }
  });
}

/* ================================================================
   Boot
================================================================ */
function initFindingCharts() {
  const v1 = { v: 'all' }, v3 = { v: 'all' }, v7 = { v: 'all' };
  const seg = (id, ctl, redraw, opts) => { const m = $(id); if (m) m.replaceChildren(segmented(opts, ctl.v, v => { ctl.v = v; redraw(); }, T('ui.sector'))); };
  const sectorOpts = [['all', vertName('all')], ['CW', vertName('CW')], ['EA', vertName('EA')]];
  const m1 = $('#c-f1'); if (m1) { const r = chartOverlap(m1, v1); seg('#s-f1', v1, r, sectorOpts); }
  const m2 = $('#c-f2'); if (m2) chartLocal(m2);
  const m3 = $('#c-f3'); if (m3) { const r = chartZurich(m3, v3); seg('#s-f3', v3, r, sectorOpts); }
  const m4 = $('#c-f4'); if (m4) chartTypes(m4);
  const m5 = $('#c-f5'); if (m5) chartFunnel(m5);
  const m6 = $('#c-f6'); if (m6) chartUrl(m6);
  const m7 = $('#c-f7'); if (m7) { const r = chartBrands(m7, v7); seg('#s-f7', v7, r, sectorOpts); }
}
function initTheme() {
  const btn = $('.theme'); if (!btn) return;
  const root = document.documentElement;
  const dark = () => root.getAttribute('data-theme') === 'dark' || (!root.getAttribute('data-theme') && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  const label = () => btn.setAttribute('aria-label', dark() ? btn.dataset.lLight : btn.dataset.lDark);
  label();
  btn.addEventListener('click', () => { const next = dark() ? 'light' : 'dark'; root.setAttribute('data-theme', next); store.set('cbai-theme', next); label(); });
}
function initShare() {
  const dlg = document.getElementById('share'), S = CFG.share;
  if (!dlg || !S) return;
  const ta = dlg.querySelector('textarea'), msg = dlg.querySelector('.sh-msg');
  const say = s => { msg.textContent = s || ''; };
  const full = () => ta.value.trim() + '\n' + S.url;
  const copy = async s => {
    try { await navigator.clipboard.writeText(s); return true; } catch (e) { /* fall back below */ }
    const f = document.createElement('textarea'); f.value = s; f.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(f); f.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
    f.remove(); return ok;
  };
  const nat = dlg.querySelector('[data-net="native"]');
  if (nat && navigator.share) nat.hidden = false;
  const show = key => { ta.value = S.texts[key] || S.texts.gen; say(''); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-share]');
    if (b) { e.preventDefault(); show(b.dataset.share); }
  });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });   // click on the backdrop
  const go = u => window.open(u, '_blank', 'noopener');
  const q = encodeURIComponent;
  dlg.addEventListener('click', async e => {
    const b = e.target.closest('[data-net]'); if (!b) return;
    const net = b.dataset.net, txt = ta.value.trim();
    if (net === 'copy') { await copy(full()); say(S.ui.copied); }
    else if (net === 'li') { await copy(full()); say(S.ui.li_hint); go('https://www.linkedin.com/feed/?shareActive=true&text=' + q(full())); }
    else if (net === 'bsky') go('https://bsky.app/intent/compose?text=' + q(full().replace(/d.Alizée Baudez/g, 'de @' + S.bsky).replace(/Alizée Baudez/g, '@' + S.bsky)));
    else if (net === 'wa') go('https://wa.me/?text=' + q(full()));
    else if (net === 'mail') location.href = 'mailto:?subject=' + q(S.ui.mail_subject) + '&body=' + q(full());
    else if (net === 'native') { try { await navigator.share({ text: txt, url: S.url }); } catch (err) { /* cancelled */ } }
  });
}
function boot() {
  document.documentElement.classList.add('js');
  initFindingCharts(); initHero(); initSituation(); initExplorer(); initGate(); initNav(); initTheme(); initShare();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

})();
