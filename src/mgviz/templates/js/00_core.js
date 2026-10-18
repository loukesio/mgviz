/* mgviz report — core: data derivation, shared focus state, focus panel, tabs, helpers.
   View modules (10_overview.js …) register themselves in VIEWS. Everything runs offline. */
'use strict';
const RAW = window.__MGVIZ__;
const META = RAW.meta || {};
const TIERS = ['Trace', 'Low', 'Medium', 'High'];
const SAMPLE_TYPES = META.sample_types || ['stool', 'nasal', 'wastewater', 'clinical'];
const FAM_PEEK = 5;

// ---------- number formats (README §Number formats)
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
const fmtI = n => Math.round(n).toLocaleString('en-US');
const fmtR = n => n >= 1000 ? fmt(n) : n >= 10 ? n.toFixed(0) : n.toFixed(1);
const fmtPct = p => (Math.abs(p - Math.round(p)) < 0.05 ? String(Math.round(p)) : p.toFixed(1)) + '%';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- confidence tier (README §Derived data). geNomad "not run" passes that check.
function tierOf(d) {
  const gvOk = d.gv == null ? true : d.gv >= 0.8;
  return (d.pct >= 80 && d.reads >= 500 && gvOk && d.rid >= 90) ? 3 : (d.pct >= 40 && d.reads >= 50) ? 2 : d.reads >= 10 ? 1 : 0;
}

// ---------- family palettes: mgviz default + every ltc palette with at least 6 colours
const PALS = (() => {
  const out = {};
  const src = META.palettes || {};
  if (src.mgviz) out.mgviz = src.mgviz.colors.slice(0, 8);
  else out.mgviz = ['#2f6db5', '#d9822b', '#3a9a6e', '#c2457a', '#7b63b8', '#a69b22', '#cf5a3c', '#4b9fc6'];
  Object.keys(src).forEach(k => { if (k !== 'mgviz' && src[k].colors && src[k].colors.length >= 6) out[k] = src[k].colors.slice(0, 8); });
  return out;
})();

// ---------- derived data
function stripAdj(name) { return String(name || '').replace(/\s*\[tax adj:[^\]]*\]\s*$/, ''); }
function segKey(label) { const n = parseInt(label, 10); return isNaN(n) ? [1, String(label)] : [0, n]; }

function derive() {
  const samples = RAW.samples.map(s => ({
    name: s.id, type: s.type || 'sample', raw: s.raw_reads ?? s.filtered_reads ?? 0,
    preHost: s.pre_host_reads, filtered: s.filtered_reads ?? 0, mapped: s.viral_reads ?? 0, hasGv: !!s.has_genomad,
  }));
  const tOrd = t => { const i = SAMPLE_TYPES.indexOf(t); return i < 0 ? 99 : i; };
  samples.sort((a, b) => tOrd(a.type) - tOrd(b.type) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const smap = Object.fromEntries(samples.map(s => [s.name, s]));
  const vmap = {};
  const groups = new Map();
  RAW.contigs.forEach(c => {
    const vid = c.assembly || c.accession;
    const key = c.sample + '|' + vid;
    if (!groups.has(key)) groups.set(key, { sample: c.sample, vid, rows: [] });
    groups.get(key).rows.push(c);
  });
  groups.forEach(g => {
    const rows = g.rows.slice().sort((a, b) => { const ka = segKey(a.segment), kb = segKey(b.segment); return ka[0] - kb[0] || (ka[1] > kb[1] ? 1 : ka[1] < kb[1] ? -1 : 0); });
    const ex = rows.reduce((m, r) => (r.reads || 0) > (m.reads || 0) ? r : m, rows[0]);
    let v = vmap[g.vid];
    if (!v) {
      const unc = x => !x || /^unclassified/i.test(x) ? null : x;
      v = vmap[g.vid] = {
        id: g.vid, n: stripAdj(ex.name) || ex.accession, acc: rows[0].accession, f: ex.family || 'Unclassified', g: ex.genus || '',
        sp: ex.species || '', strain: unc(ex.subspecies), order: ex.order || '', phylum: ex.phylum || '', tclass: ex.tclass || '',
        len: ex.asm_length || rows.reduce((a, r) => a + (r.length || 0), 0),
        segs: rows.map(r => ({ label: r.segment == null ? '' : String(r.segment), len: r.length, acc: r.accession })),
        det: {}, nS: 0, tot: 0,
      };
    }
    const smp = smap[g.sample];
    const reads = rows.reduce((a, r) => a + (r.reads || 0), 0);
    const len = rows.reduce((a, r) => a + (r.length || 0), 0) || v.len;
    const covered = rows.reduce((a, r) => a + (r.covered || 0), 0);
    const wmean = (k, w) => { let s = 0, ws = 0; rows.forEach(r => { if (r[k] != null) { s += r[k] * (w(r) || 0); ws += (w(r) || 0); } }); return ws ? s / ws : null; };
    const gvRaw = ex.gv_score;
    const gv = gvRaw != null ? gvRaw : (smp && smp.hasGv ? 0 : null);
    const rid = wmean('read_id', r => r.reads);
    const d = {
      sample: g.sample, virus: v, reads, len, pct: Math.round(clamp(covered / len * 100, 0, 100) * 10) / 10,
      rid: rid == null ? 0 : rid * 100, cid: ex.cons_id == null ? null : ex.cons_id * 100,
      gv, hall: rows.reduce((a, r) => a + (r.gv_hallmarks || 0), 0), gvTax: ex.gv_tax || null,
      meanCov: wmean('mean_cov', r => r.length) || 0, pi: ex.pi == null ? null : ex.pi,
      nfrac: wmean('consensus_n_frac', r => r.length),
      rpkmf: smp && smp.filtered ? reads / (len / 1000) / (smp.filtered / 1e6) : (ex.rpkmf || 0),
      adj: rows.some(r => r.adj),
      segs: rows.map(r => ({ label: r.segment == null ? '' : String(r.segment), len: r.length, acc: r.accession, reads: r.reads || 0,
        pct: Math.round(clamp((r.covered || 0) / (r.length || 1) * 100, 0, 100) * 10) / 10, meanCov: r.mean_cov || 0,
        cov: r.cov || [], orfs: r.orfs || [] })),
    };
    d.tier = tierOf(d);
    v.det[g.sample] = d; v.nS += 1; v.tot += reads;
  });
  const viruses = Object.values(vmap);
  const famTot = {};
  viruses.forEach(v => { famTot[v.f] = (famTot[v.f] || 0) + v.tot; });
  const famOrder = Object.keys(famTot).sort((a, b) => famTot[b] - famTot[a] || a.localeCompare(b));
  const dets = viruses.flatMap(v => Object.values(v.det));
  const maxRpkmf = Math.max(1e-9, ...dets.map(d => d.rpkmf));
  const maxReads = Math.max(1, ...dets.map(d => d.reads));
  const hasGv = samples.some(s => s.hasGv);
  const types = SAMPLE_TYPES.filter(t => samples.some(s => s.type === t)).concat([...new Set(samples.map(s => s.type))].filter(t => !SAMPLE_TYPES.includes(t)).sort());
  // host range (CHECK SOURCE)
  const HR = META.host_range || { rules: [], human_sample_types: [], flag_hosts: [], plant_flag_outside: [] };
  const rules = (HR.rules || []).map(r => ({ host: r.host, re: new RegExp(r.pattern, 'i') }));
  viruses.forEach(v => { const txt = [v.n, v.sp, v.g, v.f].join(' | '); const r = rules.find(x => x.re.test(txt)); v.host = r ? r.host : 'human'; });
  return { samples, smap, viruses, vmap, famOrder, famTot, dets, maxRpkmf, maxReads, hasGv, types, HR };
}
const D = derive();

// Flags (README §Flags): rare, a few % of calls.
function flagOf(d) {
  const v = d.virus;
  if (d.adj && d.tier >= 1) return ['DIVERGENT', 'Consensus identity ' + (d.cid == null ? '?' : d.cid.toFixed(1)) + '% is below the species threshold: possibly a new variant'];
  if (d.pct >= 60 && d.gv != null && d.gv < 0.6) return ['LOW GENOMAD', 'geNomad score ' + d.gv.toFixed(2) + ' despite ' + fmtPct(d.pct) + ' coverage: check that this is really viral'];
  const st = D.smap[d.sample] ? D.smap[d.sample].type : '';
  const human = (D.HR.human_sample_types || []).includes(st);
  if (d.tier >= 2 && human) {
    if ((D.HR.flag_hosts || []).includes(v.host)) return ['CHECK SOURCE', 'Animal virus in a human sample: dietary or reagent contamination?'];
    if (v.host === 'plant' && !(D.HR.plant_flag_outside || []).includes(st)) return ['CHECK SOURCE', 'Plant virus in a ' + st + ' sample: dietary or reagent contamination?'];
  }
  return null;
}
const abund = d => Math.log10(d.rpkmf + 1) / Math.log10(D.maxRpkmf + 1);

// ---------- state
const S = {
  tab: 'overview', selSample: null, selFamily: null, search: '', minTier: 0, selVirus: null,
  sampleQ: '', samplesOpen: null, famsOpen: false, typeOpen: {},
  treeLayout: 'rect', treeValue: 'rpkmf', treeCols: 'auto', collapsed: null, treeRot: 0, treeTool: null, zoomFam: '',
  compTop: 'auto', compSort: 'type', heatTop: 'auto', heatCols: 'cluster',
  groupBy: 'auto', groupLimit: 20, groupOpen: {}, expanded: {}, sortKey: 'rpkmf', sortDir: -1, flagOnly: false, sharedOnly: false, tierKey: null,
  ovQ: '', ovSort: 'viral', ovLimit: 20,
  compare: false, drawerSample: null, drawerAll: false, famColors: {}, paletteSel: null, colorOpen: false, colorEdit: null, hexDrafts: {}, theme: null,
};
try { const sv = JSON.parse(localStorage.getItem('mgviz.colors') || 'null'); if (sv) { S.famColors = sv.fc || {}; S.paletteSel = sv.ps || null; } } catch (e) { /* storage unavailable */ }
try { const t = localStorage.getItem('mgviz.theme'); if (t === 'light' || t === 'dark') S.theme = t; } catch (e) { /* storage unavailable */ }
function saveColors() { try { localStorage.setItem('mgviz.colors', JSON.stringify({ fc: S.famColors, ps: S.paletteSel })); } catch (e) { /* ignore */ } }
function applyTheme() {
  const root = document.documentElement;
  if (S.theme) root.setAttribute('data-theme', S.theme); else root.removeAttribute('data-theme');
  try { if (S.theme) localStorage.setItem('mgviz.theme', S.theme); else localStorage.removeItem('mgviz.theme'); } catch (e) { /* ignore */ }
}
function isDark() { return S.theme === 'dark' || (!S.theme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }

// theme values for SVG (literal colours, so exports carry them)
function tv() {
  const dark = isDark();
  return dark
    ? { dark, bg: '#1b1f1d', fg: '#e4e6e0', muted: '#99a19b', line: '#2e3431', line2: '#242927', faint: '#242927', absent: '#222725', seq: ['#263645', '#a9d6ff'], grey: '#6b7370', ink: '#c9cdc6', attn: '#f0957a', abund: '#8ec0e4', accent: '#8ec0e4' }
    : { dark, bg: '#ffffff', fg: '#1c201e', muted: '#636a66', line: '#d9dcd4', line2: '#eceee7', faint: '#eef0ea', absent: '#f0f1ec', seq: ['#dde6ee', '#0e3a62'], grey: '#a3a8a4', ink: '#3b4440', attn: '#a84f2b', abund: '#2b5d86', accent: '#1f5f8b' };
}
// sequential ramp: RGB with gamma 1.8, pure JS (works without d3), clamped to [0,1]
function seq() {
  const t = tv(); const p = c => [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16)); const a = p(t.seq[0]), b = p(t.seq[1]);
  const g = 1.8, L = x => Math.pow(x / 255, g), U = x => Math.round(255 * Math.pow(x, 1 / g));
  return v => { const f = clamp(+v || 0, 0, 1); return '#' + a.map((x, k) => U(L(x) + (L(b[k]) - L(x)) * f).toString(16).padStart(2, '0')).join(''); };
}
function inkOn(bg) {
  const c = [1, 3, 5].map(k => parseInt(bg.slice(k, k + 2), 16) / 255).map(x => x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4));
  const Y = .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; return Y > .32 ? '#1c201e' : '#ffffff';
}
function famColor(f) {
  const o = S.famColors && S.famColors[f]; if (o) return o;
  const pal = PALS[S.paletteSel] || PALS.mgviz; const i = D.famOrder.indexOf(f);
  if (!(i >= 0 && i < pal.length)) return tv().grey;
  let c = pal[i]; if (isDark() && window.d3) c = d3.color(c).brighter(0.7).formatHex(); return c;
}
function famLabelColor(f) { const c = famColor(f); return c === tv().grey ? tv().muted : c; }
function typeShades() { return isDark() ? ['#e4e6e0', '#a3a9a3', '#6b7370', '#3a403d'] : ['#2b302d', '#7d847f', '#b4b9b3', '#dfe2db']; }
function typeShade(t) { const i = D.types.indexOf(t); return typeShades()[Math.max(0, i) % 4]; }

// ---------- focus helpers
const confMin = () => Math.max(2, S.minTier);
function matchQ(v, q) { return !q || v.n.toLowerCase().includes(q) || v.f.toLowerCase().includes(q) || v.g.toLowerCase().includes(q) || (v.acc || '').toLowerCase().includes(q); }
function matchV(v) {
  const q = S.search.trim().toLowerCase();
  return (!S.selFamily || v.f === S.selFamily) && matchQ(v, q) && (S.selSample ? (!!v.det[S.selSample] && v.det[S.selSample].tier >= S.minTier) : Object.values(v.det).some(d => d.tier >= S.minTier));
}
function filteredDets() {
  const q = S.search.trim().toLowerCase();
  return D.dets.filter(d => { const v = d.virus; return (!S.selSample || d.sample === S.selSample) && (!S.selFamily || v.f === S.selFamily) && matchQ(v, q) && d.tier >= S.minTier && (!S.sharedOnly || v.nS >= 2); });
}
function hasFocus() { return !!(S.selSample || S.selFamily || S.search || S.minTier); }
function focusTag() { const q = S.search.trim().toLowerCase(); return (q ? '_search-' + q.replace(/[^a-z0-9]+/g, '-') : '') + (S.selSample ? '_' + S.selSample : '') + (S.selFamily ? '_' + S.selFamily : ''); }
function curDet(v) { return (S.drawerSample && v.det[S.drawerSample]) || (S.selSample && v.det[S.selSample]) || Object.values(v.det).sort((a, b) => b.rpkmf - a.rpkmf)[0]; }
function pillHtml(tier, cls) { return `<span class="pill t${tier} ${cls || ''}">${TIERS[tier]}</span>`; }

// ---------- state updates and rendering
const VIEWS = {};
function setState(patch, cb) { Object.assign(S, patch); render(); if (cb) cb(); }
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

function render() {
  applyTheme();
  renderHeader(); renderFocus(); renderTabs();
  ['overview', 'table', 'tree', 'heat'].forEach(k => { $('#view-' + k).hidden = S.tab !== k; });
  if (VIEWS[S.tab]) VIEWS[S.tab].render();
  if (VIEWS.drawer) VIEWS.drawer.render();
}

function renderHeader() {
  const nHigh = D.dets.filter(d => d.tier === 3).length;
  $('#kicker').textContent = `mgviz · run ${META.run_id || META.project} · generated ${String(META.generated || '').slice(0, 10)}`;
  $('#headline').textContent = `${D.viruses.length} viruses across ${D.samples.length} sample${D.samples.length > 1 ? 's' : ''}`;
  const nF = new Set(D.viruses.map(v => v.f)).size;
  const db = META.db_version ? ` · EsViritu DB ${/^v/i.test(META.db_version) ? '' : 'v'}${META.db_version}` : '';
  $('#subline').textContent = `${D.dets.length} detections, ${nHigh} high-confidence · ${nF} families · ${fmt(D.samples.reduce((a, x) => a + x.filtered, 0))} non-host reads${db} · mgviz ${META.mgviz_version || ''}`;
}

const TAB_DESC = {
  overview: 'What was found in each sample, how confident each call is, and what to double-check.',
  table: 'Every call with the evidence behind it. Hover a confidence label to see why it got that rating; click a virus to open its genome.',
  heat: 'Which samples share which viruses. Rows and columns are clustered so similar samples and co-occurring viruses sit together.',
};
const TREE_DESC = {
  rect: 'Where each detection sits in viral taxonomy, and which samples have it. Families are shaded; collapse any family to a wedge.',
  radial: 'The same taxonomy as a publication figure: rank guides, family arcs and one bar ring per sample. Export as SVG or PNG.',
  comp: 'How much of each sample is which family, genus and virus, as a share of viral reads.',
};
function renderTabs() {
  const TAB = [['overview', 'Overview'], ['table', 'Detections'], ['tree', 'Taxonomy'], ['heat', 'Samples × taxa']];
  $('#tabs').innerHTML = TAB.map(([k, l]) => `<button class="tab${S.tab === k ? ' on' : ''}" role="tab" data-act="tab" data-k="${k}">${l}</button>`).join('');
  $('#tabdesc').textContent = S.tab === 'tree' ? TREE_DESC[S.treeLayout] : TAB_DESC[S.tab];
  $('#focusline').textContent = 'Focus: ' + [S.selSample || 'all samples', S.selFamily, S.minTier ? `≥ ${TIERS[S.minTier]}` : null, S.search.trim() ? `“${S.search.trim()}”` : null].filter(Boolean).join(' · ');
}

function renderFocus() {
  const dets = D.dets, cm = confMin(), many = D.samples.length > 12;
  const samplesOpen = S.samplesOpen ?? !many;
  const sq = S.sampleQ.toLowerCase();
  let h = `<div class="sec gap6"><div class="sechead">Find a virus</div><input class="input" id="in-search" data-act="search" value="${esc(S.search)}" placeholder="Name, family, accession"></div>`;
  // samples
  const nAll = new Set(dets.filter(d => d.tier >= cm).map(d => d.virus.id)).size;
  h += `<div class="sec"><button class="sechead-btn" data-act="toggle-samples"><span class="caret">${samplesOpen ? '▾' : '▸'}</span><span class="grow">Samples</span><span class="note">${samplesOpen ? 'confident hits' : `${D.samples.length} in ${D.types.length} type${D.types.length === 1 ? '' : 's'}`}</span></button>`;
  h += `<button class="row${S.selSample ? '' : ' on'}" data-act="sel-sample" data-k=""><span>All samples</span><span class="n">${nAll}</span></button>`;
  if (samplesOpen) {
    if (many) h += `<input class="input small" id="in-sampleq" data-act="sampleq" value="${esc(S.sampleQ)}" placeholder="Filter samples">`;
    D.types.forEach(ty => {
      const all = D.samples.filter(x => x.type === ty); const it = all.filter(x => !sq || x.name.toLowerCase().includes(sq));
      if (!it.length) return;
      const tOpen = S.typeOpen[ty] ?? (!many || !!sq || all.some(x => x.name === S.selSample));
      h += `<button class="typehead" data-act="toggle-type" data-k="${esc(ty)}"><span class="caret">${tOpen ? '▾' : '▸'}</span><span class="grow">${esc(ty)}</span><span>${all.length}</span></button>`;
      if (tOpen) it.forEach(x => { const n = dets.filter(d => d.sample === x.name && d.tier >= cm).length; h += `<button class="row sub${S.selSample === x.name ? ' on' : ''}" data-act="sel-sample" data-k="${esc(x.name)}"><span class="name mono">${esc(x.name)}</span><span class="n">${n}</span></button>`; });
    });
  } else if (S.selSample) {
    h += `<button class="row sub on" data-act="sel-sample" data-k=""><span class="name mono">${esc(S.selSample)}</span><span class="n">×</span></button>`;
  }
  h += `</div>`;
  // families
  const fo = D.famOrder;
  h += `<div class="sec"><button class="sechead-btn" data-act="toggle-fams"><span class="caret">${S.famsOpen ? '▾' : '▸'}</span><span class="grow">Families</span><span class="note">${S.famsOpen ? 'viruses' : `top ${Math.min(FAM_PEEK, fo.length)} of ${fo.length}`}</span></button>`;
  h += `<button class="row${S.selFamily ? '' : ' on'}" data-act="sel-family" data-k=""><span>All families</span><span class="n">${D.viruses.length}</span></button>`;
  fo.forEach((f, i) => { if (!S.famsOpen && !(i < FAM_PEEK || f === S.selFamily)) return; const n = D.viruses.filter(v => v.f === f).length; h += `<button class="row sub${S.selFamily === f ? ' on' : ''}" data-act="sel-family" data-k="${esc(f)}"><span class="name">${esc(f)}</span><span class="n">${n}</span></button>`; });
  if (fo.length > FAM_PEEK) h += `<button class="linkrow" data-act="toggle-fams">${S.famsOpen ? 'Show fewer' : `Show all ${fo.length} families`}</button>`;
  h += `</div>`;
  // minimum confidence
  const NOTE = ['Showing every call, including trace hits (< 10 reads).', 'Hiding trace hits. Low = at least 10 reads.', 'Medium and up: ≥ 40% of the genome covered and ≥ 50 reads.', 'High only: ≥ 80% covered, ≥ 500 reads, ≥ 90% read identity, geNomad ≥ 0.8.'];
  h += `<div class="sec gap6"><div class="sechead">Minimum confidence</div><div class="seg4">${TIERS.map((l, i) => `<button class="${S.minTier === i ? 'on' : ''}" data-act="min-tier" data-k="${i}">${l}</button>`).join('')}</div><div class="rule">${NOTE[S.minTier]}</div></div>`;
  if (hasFocus()) h += `<button class="clear" data-act="clear-focus">Clear focus</button>`;
  const el = $('#focus');
  const active = document.activeElement, keepId = active && el.contains(active) ? active.id : null, pos = keepId ? [active.selectionStart, active.selectionEnd] : null;
  el.innerHTML = h;
  if (keepId) { const again = $('#' + keepId); if (again) { again.focus(); try { again.setSelectionRange(pos[0], pos[1]); } catch (e) { /* ignore */ } } }
}

// ---------- tooltip (figures)
function showTip(tipEl, html, ev, container) {
  if (!tipEl) return; tipEl.hidden = false; tipEl.innerHTML = html;
  const r = container.getBoundingClientRect(); let x = ev.clientX - r.left + 14 + container.scrollLeft, y = ev.clientY - r.top + 14 + container.scrollTop;
  if (x + 290 > r.width + container.scrollLeft) x = ev.clientX - r.left - 294 + container.scrollLeft;
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
}
function hideTip(tipEl) { if (tipEl) tipEl.hidden = true; }
function rankRow(r, n, b) { return `<div class="rr"><span class="rk">${esc(r)}</span><span style="font-weight:${b ? 600 : 400}">${esc(n)}</span></div>`; }
function virusTipHtml(v) {
  let h = rankRow('order', v.order) + rankRow('family', v.f) + rankRow('genus', v.g) + rankRow('species', v.sp) + rankRow('strain', v.strain || v.n, true);
  h += `<div class="mini"><span class="h">sample</span><span class="h">reads</span><span class="h">RPKMF</span><span class="h">cov</span>${Object.values(v.det).sort((a, b) => b.rpkmf - a.rpkmf).slice(0, 8).map(x => `<span>${esc(x.sample)}</span><span>${fmt(x.reads)}</span><span>${fmtR(x.rpkmf)}</span><span>${fmtPct(x.pct)}</span>`).join('')}</div>`;
  return h;
}

// ---------- sparkline paths (symlog, step)
function spark(covs, w, h) {
  const all = covs.flat(); const max = Math.max(1, d3.max(all) || 0);
  const y = d3.scaleSymlog().domain([0, max]).range([h - 1, 2]); const total = all.length || 1; const x = i => (i / total) * w;
  const fill = d3.area().x((d, i) => x(i)).y0(h).y1(d => y(d)).curve(d3.curveStepAfter)(all);
  const line = d3.line().x((d, i) => x(i)).y(d => y(d)).curve(d3.curveStepAfter)(all);
  let sep = '', acc = 0; covs.slice(0, -1).forEach(c => { acc += c.length; sep += `M${x(acc)},0V${h}`; });
  return { fill: fill || '', line: line || '', sep };
}

// ---------- event delegation
const ACTIONS = {
  tab: d => setState({ tab: d.k, tierKey: null }),
  'toggle-samples': () => setState({ samplesOpen: !(S.samplesOpen ?? !(D.samples.length > 12)) }),
  'toggle-type': d => setState({ typeOpen: { ...S.typeOpen, [d.k]: !(S.typeOpen[d.k] ?? (!(D.samples.length > 12) || !!S.sampleQ || D.samples.some(x => x.type === d.k && x.name === S.selSample))) } }),
  'sel-sample': d => setState({ selSample: d.k && S.selSample !== d.k ? d.k : null }),
  'toggle-fams': () => setState({ famsOpen: !S.famsOpen }),
  'sel-family': d => setState({ selFamily: d.k && S.selFamily !== d.k ? d.k : null }),
  'min-tier': d => setState({ minTier: +d.k }),
  'clear-focus': () => setState({ selSample: null, selFamily: null, search: '', minTier: 0 }),
  theme: () => setState({ theme: isDark() ? 'light' : 'dark' }),
  'export-all': () => EXPORT.detectionsTsv(),
};
const INPUTS = {
  search: v => setState({ search: v }),
  sampleq: v => setState({ sampleQ: v }),
};
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const fn = ACTIONS[el.dataset.act]; if (fn) { fn(el.dataset, ev, el); }
});
document.addEventListener('input', ev => {
  const el = ev.target.closest('input[data-act]'); if (!el) return;
  const fn = INPUTS[el.dataset.act]; if (fn) fn(el.value, el.dataset, el);
});
document.addEventListener('change', ev => {
  const el = ev.target.closest('select[data-act],input[type=range][data-act],input[type=color][data-act]'); if (!el) return;
  const fn = INPUTS[el.dataset.act]; if (fn) fn(el.value, el.dataset, el);
});
$('#btn-export-all').dataset.act = 'export-all';
$('#btn-theme').dataset.act = 'theme';
window.addEventListener('resize', () => { if (VIEWS[S.tab] && VIEWS[S.tab].resize) VIEWS[S.tab].resize(); });
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!S.theme) render(); });
