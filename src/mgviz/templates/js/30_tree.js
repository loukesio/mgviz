/* mgviz report — Taxonomy: rectangular tree, radial publication figure, composition; family colours; mouse tools. */
function effCollapsed() { if (S.collapsed) return S.collapsed; const c = {}; if (D.viruses.length > 130) D.famOrder.forEach(f => c[f] = true); return c; }
function buildTree() {
  const col = effCollapsed();
  const children = D.famOrder.map(f => {
    const vs = D.viruses.filter(v => v.f === f).sort((a, b) => b.tot - a.tot);
    const via = [['order', vs[0].order || '—']];
    if (col[f]) return { name: f, rank: 'family', family: f, collapsed: true, n: vs.length, viruses: vs, via };
    const gen = d3.groups(vs, v => v.g);
    const kids = gen.flatMap(([g, gv]) => { const tips = gv.map(v => ({ name: v.n, rank: 'tip', family: f, virus: v })); return gen.length > 1 && gv.length > 1 ? [{ name: g, rank: 'genus', family: f, children: tips }] : tips; });
    return { name: f, rank: 'family', family: f, children: kids, via, n: vs.length };
  });
  return { name: 'Viruses', rank: 'root', children };
}
function ringGroups() {
  const tc = S.treeCols, N = D.samples.length;
  if (tc === 'sample' || (tc !== 'type' && (N <= 12 || (S.treeLayout === 'rect' && N <= 40)))) return D.samples.map(s => ({ name: s.name, samples: [s.name], type: s.type }));
  return D.types.map(t => { const L = D.samples.filter(s => s.type === t); return { name: S.treeLayout === 'rect' ? `${t} · ${L.length}` : `${t} (mean of ${L.length})`, samples: L.map(s => s.name), type: t }; });
}
function groupVal(vs, g) { let n = 0, sum = 0; vs.forEach(v => g.samples.forEach(sn => { const d = v.det[sn]; if (d) { n++; sum += valOf(d); } })); return n ? { v: sum / n, n } : null; }
function nodeTipHtml(d) {
  if (d.data.rank === 'tip') return virusTipHtml(d.data.virus);
  let h = ''; (d.data.via || []).forEach(([r, n]) => h += rankRow(r, n)); h += rankRow(d.data.rank, d.data.name, true);
  if (d.data.rank === 'family') h += `<div style="margin-top:4px;opacity:.75">${d.data.n} genome${d.data.n > 1 ? 's' : ''} · click to ${d.data.collapsed ? 'expand' : 'collapse'}</div>`;
  return h;
}
const ROTATE_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cpath d='M21 8.5a9 9 0 1 0 2 6.5' fill='none' stroke='white' stroke-width='5' stroke-linecap='round'/%3E%3Cpath d='M21 8.5a9 9 0 1 0 2 6.5' fill='none' stroke='%231c201e' stroke-width='2.2' stroke-linecap='round'/%3E%3Cpath d='M23.5 3v7h-7z' fill='%231c201e' stroke='white' stroke-width='1.2' stroke-linejoin='round'/%3E%3C/svg%3E\") 14 14, grab";

VIEWS.tree = {
  _sig: null, _hv: null, _T: null, _famMid: {}, _uid: Math.random().toString(36).slice(2, 7),
  curTool() { const tl = S.treeTool; const radial = S.treeLayout === 'radial'; if (tl === 'rotate' && !radial) return 'pan'; return tl || (radial ? 'rotate' : 'pan'); },
  render() {
    const s = S, N = D.samples.length, nF = new Set(D.viruses.map(v => v.f)).size, col = effCollapsed(), nCol = Object.values(col).filter(Boolean).length;
    const radial = s.treeLayout === 'radial', comp = s.treeLayout === 'comp';
    const ringLegend = comp ? '' : s.treeLayout === 'rect' ? 'One column per sample · darker = more · blank = not detected · dot size = reads' : ('One ring per ' + (N > 12 ? 'sample type (mean)' : 'sample') + ' · bar height = value · no bar = not detected');
    const agg = !comp && ringGroups().some(g => g.samples.length > 1);
    const legend = agg && !/sample type/.test(ringLegend) ? ringLegend.replace(/per sample/i, 'per sample type (mean of detected samples)') : ringLegend;
    const nCustom = Object.keys(s.famColors).length; const cur = this.curTool();
    const T = [['pan', 'Pan', 'Drag to move the figure'], ['rotate', 'Rotate', 'Drag around the centre to turn the figure'], ['box', 'Zoom to area', 'Drag a rectangle to zoom into it']].filter(x => radial || x[0] !== 'rotate');
    const hint = (cur === 'rotate' ? 'Drag around the centre to rotate' : cur === 'box' ? 'Drag a rectangle to zoom into it' : 'Drag to pan') + ' · scroll to zoom · double-click to reset';
    $('#tree-bar').innerHTML = `<div class="toolbar">
      <span class="segc soft p12">${[['rect', 'Tree'], ['radial', 'Radial figure'], ['comp', 'Composition']].map(([k, l]) => `<button class="${s.treeLayout === k ? 'on' : ''}" data-act="tree-layout" data-k="${k}">${l}</button>`).join('')}</span>
      <label class="lbl">${comp ? 'Size by' : s.treeLayout === 'rect' ? 'Columns show' : 'Rings show'} <select class="select" data-act="tree-value">${[['rpkmf', 'abundance (RPKMF, log)'], ['reads', 'aligned reads (log)'], ['pct', 'genome covered (%)']].filter(([k]) => !comp || k !== 'pct').map(([k, l]) => `<option value="${k}"${s.treeValue === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      ${comp ? '' : `<button class="btn sm" data-act="tree-collapse">${nCol < D.famOrder.length ? 'Collapse all families' : 'Expand all families'}</button>
      <label class="lbl">Samples as <select class="select" data-act="tree-cols">${[['auto', 'auto'], ['sample', 'one track per sample'], ['type', 'one track per sample type (mean)']].map(([k, l]) => `<option value="${k}"${s.treeCols === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`}
      <span class="muted">${legend}</span>
      <button class="btn sm${s.colorOpen ? ' on' : ''}" data-act="tree-colors" style="display:flex;align-items:center;gap:6px"><span style="display:flex">${PALS.mgviz.slice(0, 3).map(c => `<span style="width:8px;height:8px;border-radius:2px;background:${c}"></span>`).join('')}</span>${nCustom ? `Family colours · ${nCustom} custom` : 'Family colours'}</button>
      <span class="push muted">${D.viruses.length} genomes · ${nF} families${nCol ? ` · ${nCol} collapsed` : ''}</span>
      <span class="exports md"><button data-act="tree-ex" data-f="svg">SVG</button><button data-act="tree-ex" data-f="png">PNG</button></span>
      <div class="toolbar2">
        <span class="lbl" style="gap:8px">Mouse<span class="segc">${T.map(([k, l, ti]) => `<button class="${cur === k ? 'on' : ''}" data-act="tree-tool" data-k="${k}" title="${ti}">${l}</button>`).join('')}</span></span>
        <span class="lbl">Zoom <button class="iconbtn" data-act="tree-zoom" data-k="out" title="Zoom out">−</button><button class="iconbtn" data-act="tree-zoom" data-k="in" title="Zoom in">+</button><button class="textact" data-act="tree-reset" style="margin-left:4px">Reset view</button></span>
        ${radial ? `<span class="lbl">Rotate <button class="iconbtn" data-act="tree-rot" data-k="-15" title="Rotate 15° anticlockwise">↺</button><input type="range" min="0" max="359" step="1" value="${s.treeRot}" data-act="tree-rot-slider"><button class="iconbtn" data-act="tree-rot" data-k="15" title="Rotate 15° clockwise">↻</button><span class="rot-lbl">${s.treeRot}°</span></span>
        <label class="lbl">Focus on family <select class="select" data-act="tree-zoomfam"><option value="">whole tree</option>${D.famOrder.map(f => `<option value="${esc(f)}"${s.zoomFam === f ? ' selected' : ''}>${esc(f)} · ${D.viruses.filter(v => v.f === f).length}</option>`).join('')}</select></label>` : ''}
        ${comp ? `<label class="lbl">Samples shown <select class="select" data-act="comp-top">${[['auto', 'auto (30 if more)'], ['10', '10'], ['20', '20'], ['30', '30'], ['50', '50'], ['all', 'all']].map(([k, l]) => `<option value="${k}"${String(s.compTop) === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="lbl">Sort samples by <select class="select" data-act="comp-sort">${[['type', 'sample type'], ['name', 'name'], ['total', 'total viral signal'], ...D.famOrder.map(f => [f, 'share of ' + f])].map(([k, l]) => `<option value="${esc(k)}"${s.compSort === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
        <span class="hint">${hint}</span>
      </div></div>`;
    this.renderColors();
    const FOOT = { rect: 'Hover a virus for its lineage and per-sample numbers. Click a virus to open its genome; click a family name to collapse or expand it. Scroll to zoom, drag to pan.', radial: 'Dashed circles mark the family, genus and virus levels. Coloured arcs outside the rings mark families; click one to collapse it. Sample names sit in the gap at the top.', comp: 'Left: the current focus (all samples, or the selected one) split by family, genus and virus. Right: every sample as a 100% bar, so samples can be compared at a glance.' };
    $('#tree-foot').textContent = FOOT[s.treeLayout];
    const sig = JSON.stringify([s.treeLayout, s.treeValue, s.collapsed, s.sharedOnly, s.minTier, s.search, s.selFamily, s.selSample, s.famColors, s.paletteSel, s.treeCols, s.treeRot, s.treeTool, s.compTop, s.compSort, isDark(), $('#tree-fig').clientWidth]);
    if (sig !== this._sig || !$('#tree-fig').firstChild) { if (this._sig && JSON.parse(this._sig)[0] !== s.treeLayout) this._T = null; this._sig = sig; this.draw(); }
    this.hl();
  },
  resize() { if (S.tab === 'tree') { this._T = null; this.render(); } },
  renderColors() {
    const box = $('#tree-colors'); if (!S.colorOpen) { box.innerHTML = ''; return; }
    const t = tv(); const curPal = S.paletteSel || 'mgviz'; const SW = Array.from(new Set([].concat(...Object.values(PALS).slice(0, 4), ['#5b5f5c', '#9aa09b']))).slice(0, 26);
    box.innerHTML = `<div class="colors"><div class="colors-head"><div><div class="t">Family colours</div><div class="s">Used in the tree, the heatmap and the composition view. Saved in this browser.</div></div><div style="display:flex;gap:12px;font-size:12px"><button class="textact" data-act="colors-reset">Reset all</button><button class="muted" data-act="tree-colors">Close</button></div></div>
      <div class="chips"><span class="sechead" style="margin-right:4px;padding:0">Start from a palette</span>${Object.keys(PALS).map(k => `<button class="chip${k === curPal ? ' on' : ''}" data-act="colors-pal" data-k="${esc(k)}"><span class="sw">${PALS[k].slice(0, 8).map(c => `<i style="background:${c}"></i>`).join('')}</span>${esc(k)}</button>`).join('')}</div>
      <div class="famgrid">${D.famOrder.map(f => { const c = famColor(f); const ed = S.colorEdit === f; const isGrey = c === t.grey && !S.famColors[f]; const n = D.viruses.filter(v => v.f === f).length;
        return `<div class="famrow"><div class="top"><button class="swb${ed ? ' on' : ''}" style="background:${c}" data-act="colors-edit" data-k="${esc(f)}" title="Pick a colour"></button><span class="nm">${esc(f)} <span>${n}</span></span><span class="note">${isGrey ? 'no colour yet' : S.famColors[f] ? 'custom' : ''}</span><input class="hex" data-act="colors-hex" data-k="${esc(f)}" value="${esc(S.hexDrafts[f] ?? c)}" spellcheck="false"></div>
        ${ed ? `<div class="sws">${SW.map(x => `<button class="s${x.toLowerCase() === c.toLowerCase() ? ' on' : ''}" style="background:${x}" data-act="colors-set" data-k="${esc(f)}" data-c="${x}"></button>`).join('')}<label>any<input type="color" value="${c}" data-act="colors-pick" data-k="${esc(f)}"></label><button class="def" data-act="colors-clear" data-k="${esc(f)}">Use default</button></div>` : ''}</div>`; }).join('')}</div></div>`;
  },
  // ---------- drawing
  draw() {
    const el = $('#tree-fig'); d3.select(el).selectAll('*').remove(); this._g = null; this._svg = null; this._zoom = null;
    if (S.treeLayout === 'comp') return this.drawComp(el);
    const s = S, t = tv(), sq = seq(); const root = d3.hierarchy(buildTree()); const leaves = root.leaves(), n = leaves.length;
    const W = Math.max(480, el.clientWidth); const radial = s.treeLayout === 'radial'; const groups = ringGroups(), nR = groups.length;
    const wgt = d => d.data.collapsed ? Math.min(7, 1.6 + Math.log2(d.data.n + 1)) : 1;
    const maxLab = d3.max(leaves, d => d.data.name.length + 6) || 10; const fs = n > 90 ? 8.5 : n > 45 ? 10 : n > 20 ? 11.5 : 12.5;
    const H = radial ? Math.max(720, Math.min(W, 980)) : Math.max(420, leaves.reduce((a, d) => a + wgt(d), 0) * (n > 90 ? 12 : n > 45 ? 17 : 26) + 150);
    const svg = d3.select(el).append('svg').attr('class', 'fig-svg').attr('width', W).attr('height', H).attr('viewBox', [0, 0, W, H]).attr('font-family', '-apple-system, Segoe UI, system-ui, Helvetica, sans-serif').style('display', 'block');
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', t.bg); const g = svg.append('g'); this._g = g; this._svg = svg;
    const self = this;
    const zoom = d3.zoom().scaleExtent([0.5, 12]).filter(ev => self.zoomFilter(ev)).on('zoom', e => { g.attr('transform', e.transform); self._T = e.transform; });
    svg.call(zoom).on('dblclick.zoom', null); this._zoom = zoom; if (this._T) svg.call(zoom.transform, this._T);
    const tipEl = $('#tree-tip'), cont = $('#tree-box');
    const onEnter = (ev, d) => { showTip(tipEl, nodeTipHtml(d), ev, cont); if (d.data.rank === 'tip') { self._hv = d.data.virus.id; self.hl(); } };
    const onMove = (ev, d) => showTip(tipEl, nodeTipHtml(d), ev, cont);
    const onLeave = () => { hideTip(tipEl); if (self._hv) { self._hv = null; self.hl(); } };
    const onClick = (ev, d) => { ev.stopPropagation(); if (d.data.rank === 'tip') setState({ selVirus: d.data.virus.id, drawerSample: null, compare: false }); else if (d.data.rank === 'family') self.toggleFam(d.data.family); };
    const famLabel = d => d.data.collapsed ? `${d.data.name} · ${d.data.n}` : d.data.name;
    const rsz = d3.scaleSqrt().domain([1, D.maxReads]).range([2, n > 45 ? 4 : 7]);
    const valTxt = gv => s.treeValue === 'pct' ? Math.round(gv.v * 100) + '%' : s.treeValue === 'reads' ? fmt(Math.pow(10, gv.v * Math.log10(D.maxReads + 1)) - 1) + ' reads' : 'RPKMF ' + fmtR(Math.pow(10, gv.v * Math.log10(D.maxRpkmf + 1)) - 1);
    if (radial) {
      const VW = Math.max(W, 1100); svg.attr('viewBox', [0, 0, VW, VW]).attr('height', Math.min(W, VW)).attr('width', Math.min(W, VW)); svg.select('rect').attr('width', VW).attr('height', VW);
      const cx = VW / 2, cy = VW / 2; const ringW = Math.max(7, Math.min(14, 170 / nR)); const outer = VW / 2 - 14; const famW = n > 45 ? 150 : 120; const ringR0 = outer - famW - nR * ringW - 4;
      const labelW = Math.min(fs * 0.6 * maxLab + 20, ringR0 * (n > 45 ? 0.42 : 0.6)); const maxCh = Math.max(6, Math.floor((labelW - 10) / (fs * 0.56))); const trunc = x => x.length > maxCh ? x.slice(0, maxCh - 1) + '…' : x;
      const tipR = ringR0 - labelW - 4; const gap = clamp(nR * 0.035 + 0.32, 0.4, 1.0); const uid = this._uid;
      d3.cluster().size([2 * Math.PI - gap, tipR]).separation((a, b) => (wgt(a) + wgt(b)) / 2)(root);
      const rot = (s.treeRot || 0) * Math.PI / 180; const nrm = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      root.each(d => { d.x += gap / 2 + rot; d.y = d.depth === 0 ? 0 : d.data.rank === 'family' ? tipR * 0.36 : d.data.rank === 'genus' ? tipR * 0.66 : tipR; });
      const pos = (a, r) => [cx + r * Math.sin(a), cy - r * Math.cos(a)]; const step = (2 * Math.PI - gap) / Math.max(1, leaves.reduce((a, d) => a + wgt(d), 0) - 1); const fams = root.children || [];
      const span = d => { const lv = d.leaves(); return [d3.min(lv, x => x.x - wgt(x) * step / 2), d3.max(lv, x => x.x + wgt(x) * step / 2)]; };
      this._famMid = {}; fams.forEach(d => { const [a0, a1] = span(d); this._famMid[d.data.family] = ((a0 + a1) / 2 - rot) * 180 / Math.PI; }); this._VW = VW;
      const gg = g.append('g').attr('transform', `translate(${cx},${cy})`);
      g.append('g').attr('transform', `translate(${cx},${cy})`).selectAll('path').data(fams).join('path').attr('d', d => { const [a0, a1] = span(d); return d3.arc()({ innerRadius: tipR * 0.36 - 12, outerRadius: ringR0 - 4, startAngle: a0, endAngle: a1 }); }).attr('fill', d => famColor(d.data.family)).attr('opacity', 0.08).attr('data-f', d => d.data.family).attr('class', 'clade');
      [['family', tipR * 0.36], ['genus', tipR * 0.66], ['virus', tipR]].forEach(([r, rad]) => { gg.append('circle').attr('r', rad).attr('fill', 'none').attr('stroke', t.line).attr('stroke-dasharray', '2 4'); gg.append('text').attr('x', (rad + 4) * Math.sin(rot)).attr('y', -(rad + 4) * Math.cos(rot)).attr('text-anchor', 'middle').attr('paint-order', 'stroke').attr('stroke', t.bg).attr('stroke-width', 3).attr('font-size', 9).attr('fill', t.muted).attr('letter-spacing', '.08em').text(r.toUpperCase()); });
      const link = d => { const [x0, y0] = pos(d.source.x, d.source.y), [x1, y1] = pos(d.target.x, d.source.y), [x2, y2] = pos(d.target.x, d.target.y); const sweep = d.target.x > d.source.x ? 1 : 0; return d.source.y === 0 ? `M${cx},${cy}L${x2},${y2}` : `M${x0},${y0}A${d.source.y},${d.source.y} 0 0 ${sweep} ${x1},${y1}L${x2},${y2}`; };
      g.append('g').attr('fill', 'none').selectAll('path').data(root.links()).join('path').attr('d', link).attr('stroke', d => d.target.data.family ? famColor(d.target.data.family) : t.line).attr('stroke-width', d => d.target.data.rank === 'tip' ? 1.3 : d.target.depth === 1 ? 2.6 : 1.8).attr('stroke-linecap', 'round').attr('class', 'link').attr('data-f', d => d.target.data.family || '').attr('data-v', d => d.target.data.virus ? d.target.data.virus.id : '');
      g.append('g').selectAll('path').data(leaves.filter(d => d.data.collapsed)).join('path').attr('d', d => { const half = wgt(d) * step / 2 * 0.9; const [x0, y0] = pos(d.x, d.parent ? d.parent.y : 0), [x1, y1] = pos(d.x - half, tipR), [x2, y2] = pos(d.x + half, tipR); return `M${x0},${y0}L${x1},${y1}L${x2},${y2}Z`; }).attr('fill', d => famColor(d.data.family)).attr('opacity', 0.55).attr('stroke', t.bg).attr('class', 'node').attr('data-f', d => d.data.family).style('cursor', 'pointer').on('mouseenter', onEnter).on('mousemove', onMove).on('mouseleave', onLeave).on('click', onClick);
      g.append('g').selectAll('circle').data(root.descendants().filter(d => d.depth > 0 && d.data.rank !== 'tip' && !d.data.collapsed)).join('circle').attr('cx', d => pos(d.x, d.y)[0]).attr('cy', d => pos(d.x, d.y)[1]).attr('r', d => d.data.rank === 'family' ? 5 : 3.2).attr('fill', d => famColor(d.data.family)).attr('stroke', t.bg).attr('stroke-width', 1.5).attr('data-f', d => d.data.family).attr('class', 'node').style('cursor', 'pointer').on('mouseenter', onEnter).on('mousemove', onMove).on('mouseleave', onLeave).on('click', onClick);
      g.append('g').selectAll('circle').data(leaves.filter(d => !d.data.collapsed)).join('circle').attr('cx', d => pos(d.x, d.y)[0]).attr('cy', d => pos(d.x, d.y)[1]).attr('r', d => rsz(d.data.virus.tot)).attr('fill', d => famColor(d.data.family)).attr('stroke', t.bg).attr('stroke-width', 1.2).attr('class', 'tip').attr('data-v', d => d.data.virus.id).style('cursor', 'pointer').on('mouseenter', onEnter).on('mousemove', onMove).on('mouseleave', onLeave).on('click', onClick);
      g.append('g').selectAll('text').data(leaves).join('text').attr('transform', d => { const deg = d.x * 180 / Math.PI; const flip = nrm(d.x) > Math.PI; return `translate(${cx},${cy}) rotate(${deg - 90}) translate(${tipR + 8},0) rotate(${flip ? 180 : 0})`; }).attr('dy', '0.32em').attr('text-anchor', d => nrm(d.x) > Math.PI ? 'end' : 'start').attr('font-size', d => d.data.collapsed ? fs + 1 : fs).attr('font-weight', d => d.data.collapsed ? 600 : 400).attr('fill', d => d.data.collapsed ? famLabelColor(d.data.family) : t.fg).attr('class', 'lab').attr('data-v', d => d.data.virus ? d.data.virus.id : '').attr('data-f', d => d.data.family).style('cursor', 'pointer').on('mouseenter', onEnter).on('mousemove', onMove).on('mouseleave', onLeave).on('click', onClick)
        .each(function (d) { const e = d3.select(this); const full = famLabel(d) + (d.data.collapsed ? '' : ` ${fmt(d.data.virus.tot)}`); if (full.length > maxCh) { e.text(trunc(famLabel(d))); return; } e.append('tspan').text(famLabel(d)); if (!d.data.collapsed) e.append('tspan').attr('fill', t.muted).attr('font-size', fs - 1.5).text(` ${fmt(d.data.virus.tot)}`); });
      const ringG = g.append('g').attr('transform', `translate(${cx},${cy})`);
      groups.forEach((gr, i) => {
        const r0 = ringR0 + i * ringW, r1 = r0 + ringW - 2.5;
        ringG.append('path').attr('d', d3.arc()({ innerRadius: r0, outerRadius: r0 + 0.7, startAngle: rot + gap / 2 - step / 2, endAngle: rot + 2 * Math.PI - gap / 2 + step / 2 })).attr('fill', t.line);
        ringG.selectAll(null).data(leaves).join('path').attr('d', d => { const gv = groupVal(d.data.collapsed ? d.data.viruses : [d.data.virus], gr); const h = gv ? Math.max(1.5, (r1 - r0) * gv.v) : 0; return d3.arc()({ innerRadius: r0 + 0.7, outerRadius: r0 + 0.7 + h, startAngle: d.x - wgt(d) * step / 2 + 0.006, endAngle: d.x + wgt(d) * step / 2 - 0.006 }); }).attr('fill', t.abund).attr('class', 'cell').attr('data-v', d => d.data.virus ? d.data.virus.id : '').attr('data-f', d => d.data.family).attr('data-g', i);
        ringG.selectAll(null).data(leaves).join('path').attr('d', d => d3.arc()({ innerRadius: r0, outerRadius: r1, startAngle: d.x - wgt(d) * step / 2, endAngle: d.x + wgt(d) * step / 2 })).attr('fill', 'transparent').on('mouseenter', (ev, d) => { const gv = groupVal(d.data.collapsed ? d.data.viruses : [d.data.virus], gr); showTip(tipEl, `<b>${esc(gr.name)}</b><br>${esc(famLabel(d))}<br>${gv ? (d.data.collapsed ? 'mean ' : '') + valTxt(gv) : 'not detected'}`, ev, cont); }).on('mouseleave', () => hideTip(tipEl));
        ringG.append('text').attr('x', (r0 + ringW / 2) * Math.sin(rot)).attr('y', -(r0 + ringW / 2) * Math.cos(rot)).attr('dy', '0.35em').attr('text-anchor', 'middle').attr('paint-order', 'stroke').attr('stroke', t.bg).attr('stroke-width', 3).attr('font-size', Math.min(10.5, ringW - 1)).attr('fill', t.fg).attr('font-family', 'ui-monospace, Menlo, monospace').attr('class', 'ringlab').attr('data-g', i).text(gr.name);
      });
      const rf = ringR0 + nR * ringW + 3; const fg = g.append('g').attr('transform', `translate(${cx},${cy})`);
      fams.forEach((d, i) => {
        const [a0, a1] = span(d); const f = d.data.family;
        fg.append('path').attr('d', d3.arc()({ innerRadius: rf, outerRadius: rf + 8, startAngle: a0 + 0.004, endAngle: a1 - 0.004 })).attr('fill', famColor(f)).attr('data-f', f).attr('class', 'famlab').style('cursor', 'pointer').on('mouseenter', ev => showTip(tipEl, nodeTipHtml(d), ev, cont)).on('mouseleave', () => hideTip(tipEl)).on('click', ev => onClick(ev, d));
        const mid = nrm((a0 + a1) / 2), bottom = mid > Math.PI / 2 && mid < Math.PI * 1.5; const r = bottom ? rf + 20 : rf + 13; const lab = `${d.data.name} · ${d.data.n}`; const fits = (a1 - a0) * r > lab.length * 6.4;
        if (!fits) { const deg = mid * 180 / Math.PI, flip = mid > Math.PI; fg.append('text').attr('transform', `rotate(${deg - 90}) translate(${rf + 14},0) rotate(${flip ? 180 : 0})`).attr('dy', '0.32em').attr('text-anchor', flip ? 'end' : 'start').attr('font-size', 10.5).attr('font-weight', 600).attr('fill', famLabelColor(f)).attr('data-f', f).attr('class', 'famlab').style('cursor', 'pointer').on('click', ev => onClick(ev, d)).text(lab); return; }
        const p0 = [r * Math.sin(a0), -r * Math.cos(a0)], p1 = [r * Math.sin(a1), -r * Math.cos(a1)]; const large = a1 - a0 > Math.PI ? 1 : 0; const id = `fp${uid}${i}`;
        fg.append('path').attr('id', id).attr('fill', 'none').attr('d', bottom ? `M${p1[0]},${p1[1]}A${r},${r} 0 ${large} 0 ${p0[0]},${p0[1]}` : `M${p0[0]},${p0[1]}A${r},${r} 0 ${large} 1 ${p1[0]},${p1[1]}`);
        fg.append('text').attr('font-size', 11).attr('font-weight', 600).attr('fill', famLabelColor(f)).attr('data-f', f).attr('class', 'famlab').style('cursor', 'pointer').on('click', ev => onClick(ev, d)).append('textPath').attr('href', `#${id}`).attr('startOffset', '50%').attr('text-anchor', 'middle').text(lab);
      });
    } else {
      const rowH = n > 90 ? 12 : n > 45 ? 17 : 26; const famFs = n > 45 ? 10 : 12;
      // left margin from the longest family label (measured), so labels never clip
      const meas = svg.append('text').attr('font-size', famFs).attr('font-weight', 600).attr('visibility', 'hidden');
      const flw = d3.max(root.children || [], c => { meas.text(`${c.data.name} · ${c.data.n}`); const w = meas.node().getComputedTextLength ? meas.node().getComputedTextLength() : 0; return w || (c.data.name.length + 5) * famFs * 0.62; }) || 0; meas.remove();
      const glw = 0.6 * 6.5 * (d3.max(groups, gr => gr.name.length) || 8); const labelW = Math.min(260, fs * 0.58 * maxLab + 40);
      const top = Math.max(120, 24 + 0.85 * 6.5 * (d3.max(groups, gr => gr.name.length) || 8));
      const treeW = Math.max(140, Math.min(W * 0.42, 380, W - 24 - labelW - nR * (nR <= 8 ? 22 : 10) - glw - 40));
      const left = Math.max(24, flw + 16 - treeW / Math.max(1, root.height));
      const avail = W - left - treeW - labelW - 40 - glw; const colW = Math.max(9, Math.min(30, avail / nR));
      const need = left + treeW + labelW + nR * colW + glw + 30; if (need > W) { svg.attr('width', need).attr('viewBox', [0, 0, need, H]); svg.select('rect').attr('width', need); }
      d3.cluster().size([leaves.reduce((a, d) => a + wgt(d), 0) * rowH, treeW]).separation((a, b) => (wgt(a) + wgt(b)) / 2)(root);
      const step = rowH; const Y = d => top + d.x, X = d => left + d.y; const fams = root.children || [];
      g.append('g').selectAll('rect').data(fams).join('rect').attr('x', d => X(d) - 8).attr('y', d => { const lv = d.leaves(); return top + d3.min(lv, x => x.x - wgt(x) * step / 2); }).attr('width', d => left + treeW + labelW + nR * colW + 24 - X(d) + 8).attr('height', d => { const lv = d.leaves(); return d3.max(lv, x => x.x + wgt(x) * step / 2) - d3.min(lv, x => x.x - wgt(x) * step / 2); }).attr('rx', 4).attr('fill', d => famColor(d.data.family)).attr('opacity', 0.08).attr('class', 'clade').attr('data-f', d => d.data.family);
      g.append('g').attr('fill', 'none').selectAll('path').data(root.links()).join('path').attr('d', d => `M${X(d.source)},${Y(d.source)}V${Y(d.target)}H${X(d.target)}`).attr('stroke', d => d.target.data.family ? famColor(d.target.data.family) : t.line).attr('stroke-width', d => d.target.data.rank === 'tip' ? 1.4 : 2).attr('class', 'link').attr('data-f', d => d.target.data.family || '').attr('data-v', d => d.target.data.virus ? d.target.data.virus.id : '');
      g.append('g').selectAll('path').data(leaves.filter(d => d.data.collapsed)).join('path').attr('d', d => { const half = wgt(d) * step / 2 * 0.85; return `M${X(d.parent)},${Y(d)}L${left + treeW},${Y(d) - half}L${left + treeW},${Y(d) + half}Z`; }).attr('fill', d => famColor(d.data.family)).attr('opacity', 0.55).attr('class', 'node').attr('data-f', d => d.data.family).style('cursor', 'pointer').on('mouseenter', onEnter).on('mousemove', onMove).on('mouseleave', onLeave).on('click', onClick);
      g.append('g').selectAll('circle').data(root.descendants().filter(d => d.depth > 0 && d.data.rank !== 'tip' && !d.data.collapsed)).join('circle').attr('cx', X).attr('cy', Y).attr('r', d => d.data.rank === 'family' ? 4.5 : 3).attr('fill', d => famColor(d.data.family)).attr('stroke', t.bg).attr('stroke-width', 1.5).attr('class', 'node').attr('data-f', d => d.data.family).style('cursor', 'pointer').on('mouseenter', onEnter).on('mousemove', onMove).on('mouseleave', onLeave).on('click', onClick);
      g.append('g').selectAll('text').data(root.descendants().filter(d => d.data.rank === 'family' && !d.data.collapsed)).join('text').attr('x', d => X(d) - 8).attr('y', d => Y(d) - 9).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', famFs).attr('font-weight', 600).attr('paint-order', 'stroke').attr('stroke', t.bg).attr('stroke-width', 3).attr('fill', d => famLabelColor(d.data.family)).attr('class', 'famlab').attr('data-f', d => d.data.family).style('cursor', 'pointer').text(d => `${d.data.name} · ${d.data.n}`).on('mouseenter', onEnter).on('mousemove', onMove).on('mouseleave', onLeave).on('click', onClick);
      g.append('g').selectAll('text').data(root.descendants().filter(d => d.data.rank === 'genus')).join('text').attr('x', d => X(d) - 6).attr('y', d => Y(d) - 7).attr('text-anchor', 'end').attr('font-size', fs - 1).attr('fill', t.muted).attr('font-style', 'italic').attr('data-f', d => d.data.family).attr('class', 'node').text(d => d.data.name);
      g.append('g').selectAll('circle').data(leaves.filter(d => !d.data.collapsed)).join('circle').attr('cx', X).attr('cy', Y).attr('r', d => rsz(d.data.virus.tot)).attr('fill', d => famColor(d.data.family)).attr('stroke', t.bg).attr('stroke-width', 1.2).attr('class', 'tip').attr('data-v', d => d.data.virus.id).style('cursor', 'pointer').on('mouseenter', onEnter).on('mousemove', onMove).on('mouseleave', onLeave).on('click', onClick);
      const maxChR = Math.max(8, Math.floor((labelW - 14) / (fs * 0.58)));
      g.append('g').selectAll('text').data(leaves).join('text').attr('x', left + treeW + 10).attr('y', Y).attr('dy', '0.32em').attr('font-size', d => d.data.collapsed ? fs + 1 : fs).attr('font-weight', d => d.data.collapsed ? 600 : 400).attr('fill', d => d.data.collapsed ? famLabelColor(d.data.family) : t.fg).attr('class', 'lab').attr('data-v', d => d.data.virus ? d.data.virus.id : '').attr('data-f', d => d.data.family).style('cursor', 'pointer').on('mouseenter', onEnter).on('mousemove', onMove).on('mouseleave', onLeave).on('click', onClick)
        .each(function (d) { const e = d3.select(this); const cnt = d.data.collapsed ? '' : ` ${fmt(d.data.virus.tot)}`; let nm = famLabel(d); const room = maxChR - cnt.length; if (nm.length > room) nm = nm.slice(0, Math.max(4, room - 1)) + '…'; e.append('tspan').text(nm); if (!d.data.collapsed) e.append('tspan').attr('fill', t.muted).attr('font-size', fs - 1.5).text(cnt); });
      const mx = left + treeW + labelW; const mg = g.append('g');
      groups.forEach((gr, i) => {
        const x = mx + i * colW;
        mg.selectAll(null).data(leaves).join('rect').attr('x', x + 1).attr('y', d => Y(d) - wgt(d) * step / 2 + 1).attr('width', colW - 2).attr('height', d => wgt(d) * step - 2).attr('rx', 2).attr('fill', d => { const gv = groupVal(d.data.collapsed ? d.data.viruses : [d.data.virus], gr); return gv ? sq(Math.max(0.08, gv.v)) : t.absent; }).attr('class', 'cell').attr('data-v', d => d.data.virus ? d.data.virus.id : '').attr('data-f', d => d.data.family).attr('data-g', i)
          .on('mouseenter', (ev, d) => { const gv = groupVal(d.data.collapsed ? d.data.viruses : [d.data.virus], gr); showTip(tipEl, `<b>${esc(gr.name)}</b><br>${esc(famLabel(d))}<br>${gv ? `${s.treeValue === 'pct' ? 'covered' : s.treeValue}: ${s.treeValue === 'pct' ? Math.round(gv.v * 100) + '%' : s.treeValue === 'reads' ? fmt(Math.pow(10, gv.v * Math.log10(D.maxReads + 1)) - 1) : fmtR(Math.pow(10, gv.v * Math.log10(D.maxRpkmf + 1)) - 1)}` : 'not detected'}`, ev, cont); }).on('mouseleave', () => hideTip(tipEl));
        mg.append('text').attr('transform', `translate(${x + colW / 2},${top - 14}) rotate(${colW < 70 ? -55 : 0})`).attr('text-anchor', colW < 70 ? 'start' : 'middle').attr('dy', '0.32em').attr('font-size', Math.min(11, Math.max(8, colW - 2))).attr('fill', t.fg).attr('font-family', 'ui-monospace, Menlo, monospace').attr('class', 'ringlab').attr('data-g', i).text(gr.name);
      });
      mg.append('text').attr('x', mx - 6).attr('y', top - 14).attr('text-anchor', 'end').attr('font-size', 10).attr('fill', t.muted).text(s.treeValue === 'pct' ? 'Genome covered' : s.treeValue === 'reads' ? 'Aligned reads (log)' : 'Abundance, RPKMF (log)');
    }
    this.installTools(svg, g, radial ? this._VW / 2 : null);
  },
  drawComp(el) {
    const s = S, t = tv(); const W = Math.max(480, el.clientWidth); const by = s.treeValue === 'rpkmf' ? 'rpkmf' : 'reads'; const byLab = by === 'reads' ? 'viral reads' : 'abundance (RPKMF)';
    const tipEl = $('#tree-tip'), cont = $('#tree-box'); const q = s.search.trim().toLowerCase();
    const ok = d => d && d.tier >= s.minTier; const vOk = v => matchQ(v, q);
    const focusNames = s.selSample ? [s.selSample] : D.samples.map(x => x.name); const vval = (v, names) => vOk(v) ? d3.sum(names, nm => ok(v.det[nm]) ? v.det[nm][by] : 0) : 0;
    const fams = D.famOrder.map(f => ({ name: f, rank: 'family', family: f, children: d3.groups(D.viruses.filter(v => v.f === f), v => v.g).map(([g, gv]) => ({ name: g, rank: 'genus', family: f, children: gv.map(v => ({ name: v.n, rank: 'virus', family: f, virus: v, value: vval(v, focusNames) })).filter(x => x.value > 0) })).filter(x => x.children.length) })).filter(x => x.children.length);
    const root = d3.hierarchy({ name: 'all', rank: 'root', children: fams }).sum(d => d.value || 0).sort((a, b) => b.value - a.value); const total = root.value || 0;
    const side = W >= 980; const left = 20, top = 64; const icW = side ? Math.round((W - left) * 0.55) : W - left - 20; const icH = Math.max(420, Math.min(760, 40 + root.leaves().length * 9));
    const cs = s.compSort || 'type';
    const allRows = D.samples.map(x => { const parts = D.famOrder.map(f => ({ f, v: d3.sum(D.viruses.filter(v => v.f === f), v => vval(v, [x.name])) })).filter(p => p.v > 0); const tot = d3.sum(parts, p => p.v); const share = f => { const p = parts.find(e => e.f === f); return tot && p ? p.v / tot : 0; }; return { x, parts, tot, share }; });
    const famSort = D.famOrder.includes(cs);
    const srt = cs === 'name' ? (a, b) => a.x.name.localeCompare(b.x.name) : cs === 'total' ? (a, b) => b.tot - a.tot : famSort ? (a, b) => b.share(cs) - a.share(cs) || b.tot - a.tot : (a, b) => D.types.indexOf(a.x.type) - D.types.indexOf(b.x.type) || a.x.name.localeCompare(b.x.name);
    let crow = allRows.slice().sort(srt); const ct = String(s.compTop || 'auto'); const clim = ct === 'all' ? 0 : ct === 'auto' ? (D.samples.length > 30 ? 30 : 0) : +ct; if (clim) crow = crow.slice(0, clim);
    const nS = crow.length; const rowH = nS > 20 ? 12 : 22; const labW = nS > 20 ? 96 : 120; const totW = 56; const bLeft = side ? left + icW + 44 : left; const bW = (side ? W - bLeft - 20 : W - left - 20) - labW - totW;
    const legItems = D.famOrder.map(f => ({ f, w: f.length * 6.2 + 22 })); let lx = 0, ly = 0; const legW = labW + bW; legItems.forEach(it => { if (lx + it.w > legW) { lx = 0; ly += 16; } it.x = lx; it.y = ly; lx += it.w; }); const legH = ly + 16;
    const bHead = side ? top : top + icH + 40; const bTop = bHead + legH + 18; const H = Math.max(side ? top + icH + 30 : 0, bTop + nS * (rowH + 3) + 30);
    const svg = d3.select(el).append('svg').attr('class', 'fig-svg').attr('width', W).attr('height', H).attr('viewBox', [0, 0, W, H]).attr('font-family', '-apple-system, Segoe UI, system-ui, Helvetica, sans-serif').style('display', 'block'); svg.append('rect').attr('width', W).attr('height', H).attr('fill', t.bg); this._svg = svg;
    const mix = (c, k) => d3.interpolateRgb(t.bg, c)(k); const pc = v => { const p = total ? v / total * 100 : 0; return p >= 10 ? p.toFixed(0) + '%' : p >= 1 ? p.toFixed(1) + '%' : '<1%'; }; const famSel = s.selFamily;
    const hl = f => svg.selectAll('[data-f]').attr('opacity', function () { return !f || this.dataset.f === f ? 1 : 0.22; });
    const valStr = v => by === 'reads' ? fmtI(v) + ' reads' : 'RPKMF ' + fmtR(v);
    svg.append('text').attr('x', left).attr('y', 20).attr('font-size', 13).attr('font-weight', 600).attr('fill', t.fg).text(`What makes up ${s.selSample || 'all samples'}${famSel ? ' · ' + famSel + ' highlighted' : ''}`);
    svg.append('text').attr('x', left).attr('y', 38).attr('font-size', 11).attr('fill', t.muted).text(total ? `Height = share of ${byLab} in focus (${by === 'reads' ? fmt(total) + ' reads' : 'sum ' + fmtR(total)}). Click a family to highlight it, a virus to open it.` : 'Nothing in the current focus.');
    if (total) {
      d3.partition().size([icH, 4])(root); const xs = [0, 0, .27, .54], xe = [0, .27, .54, 1]; const X0 = d => left + xs[d.depth] * icW, X1 = d => left + xe[d.depth] * icW - 2;
      ['Family', 'Genus', 'Virus'].forEach((h, i) => svg.append('text').attr('x', left + xs[i + 1] * icW).attr('y', top - 8).attr('font-size', 9.5).attr('fill', t.muted).attr('letter-spacing', '.08em').text(h.toUpperCase()));
      const nodes = root.descendants().filter(d => d.depth > 0); const kk = [0, .62, .4, .22]; const cg = svg.append('g');
      cg.selectAll('rect').data(nodes).join('rect').attr('x', X0).attr('y', d => top + d.x0).attr('width', d => X1(d) - X0(d)).attr('height', d => Math.max(0.5, d.x1 - d.x0 - 1)).attr('rx', 2).attr('fill', d => mix(famColor(d.data.family), kk[d.depth])).attr('data-f', d => d.data.family).style('cursor', 'pointer')
        .on('mouseenter', (ev, d) => { hl(d.data.family); const lin = d.ancestors().reverse().slice(1, -1).map(a => a.data.name).join(' › '); showTip(tipEl, `${lin ? `<div style="opacity:.7;font-size:10.5px">${esc(lin)}</div>` : ''}<b>${esc(d.data.name)}</b><br>${valStr(d.value)} · ${pc(d.value)} of focus${d.data.rank === 'virus' ? `<br><span style="opacity:.7">in ${Object.keys(d.data.virus.det).length} sample(s)</span>` : ''}`, ev, cont); })
        .on('mousemove', ev => showTip(tipEl, tipEl.innerHTML, ev, cont)).on('mouseleave', () => { hl(famSel); hideTip(tipEl); })
        .on('click', (ev, d) => { if (d.data.rank === 'virus') setState({ selVirus: d.data.virus.id, drawerSample: null, compare: false }); else setState({ selFamily: famSel === d.data.family ? null : d.data.family }); });
      cg.selectAll('text').data(nodes.filter(d => d.x1 - d.x0 >= 13)).join('text').attr('x', d => X0(d) + 6).attr('y', d => top + (d.x0 + d.x1) / 2).attr('dy', '0.35em').attr('font-size', d => d.depth === 1 ? 11.5 : 10.5).attr('font-weight', d => d.depth === 1 ? 600 : 400).attr('fill', t.fg).attr('pointer-events', 'none').attr('data-f', d => d.data.family)
        .each(function (d) { const w = X1(d) - X0(d) - 12; const e = d3.select(this); const p = pc(d.value); const maxCh = Math.floor(w / 6.1) - p.length - 1; let nm = d.data.name; if (maxCh < 4) return; if (nm.length > maxCh) nm = nm.slice(0, maxCh - 1) + '…'; e.append('tspan').text(nm + ' '); e.append('tspan').attr('fill', t.muted).attr('font-family', 'ui-monospace, Menlo, monospace').attr('font-size', 9.5).text(p); });
    }
    svg.append('text').attr('x', bLeft).attr('y', side ? 20 : bHead - 24).attr('font-size', 13).attr('font-weight', 600).attr('fill', t.fg).text('Family composition per sample');
    svg.append('text').attr('x', bLeft).attr('y', side ? 38 : bHead - 6).attr('font-size', 11).attr('fill', t.muted).text(`Each bar = 100% of that sample's ${byLab}. ${nS < D.samples.length ? 'Showing ' + nS + ' of ' + D.samples.length + ' samples' : 'All ' + nS + ' samples'}${famSort ? ', most ' + cs + ' first (shown leftmost)' : cs === 'total' ? ', strongest viral signal first' : cs === 'name' ? ', by name' : ', by sample type'}. Click a sample to focus it.`);
    const lg = svg.append('g').attr('transform', `translate(${bLeft},${bHead + (side ? 0 : 8)})`);
    legItems.forEach(it => { const gi = lg.append('g').attr('transform', `translate(${it.x},${it.y})`).attr('data-f', it.f).style('cursor', 'pointer').on('click', () => setState({ selFamily: famSel === it.f ? null : it.f })).on('mouseenter', () => hl(it.f)).on('mouseleave', () => hl(famSel)); gi.append('rect').attr('width', 9).attr('height', 9).attr('rx', 2).attr('fill', famColor(it.f)); gi.append('text').attr('x', 13).attr('y', 4.5).attr('dy', '0.35em').attr('font-size', 10.5).attr('fill', t.fg).text(it.f); });
    svg.append('text').attr('x', bLeft + labW + bW + 8).attr('y', bTop - 6).attr('font-size', 9.5).attr('fill', t.muted).text(by === 'reads' ? 'reads' : 'RPKMF');
    crow.forEach((rw, i) => {
      const x = rw.x; const y = bTop + i * (rowH + 3); const parts = famSort ? [...rw.parts.filter(p => p.f === cs), ...rw.parts.filter(p => p.f !== cs)] : rw.parts; const tot = rw.tot; const on = s.selSample === x.name;
      const row = svg.append('g').style('cursor', 'pointer').on('click', () => setState({ selSample: on ? null : x.name }));
      row.append('rect').attr('x', bLeft - 4).attr('y', y - 1.5).attr('width', labW + bW + totW).attr('height', rowH + 3).attr('rx', 3).attr('fill', on ? t.faint : t.bg);
      row.append('text').attr('x', bLeft).attr('y', y + rowH / 2).attr('dy', '0.35em').attr('font-size', nS > 20 ? 9.5 : 11).attr('font-family', 'ui-monospace, Menlo, monospace').attr('font-weight', on ? 700 : 400).attr('fill', t.fg).text(x.name);
      if (!tot) { row.append('text').attr('x', bLeft + labW).attr('y', y + rowH / 2).attr('dy', '0.35em').attr('font-size', 10).attr('fill', t.muted).text('nothing in focus'); return; }
      let acc = 0; parts.forEach(p => { const w = p.v / tot * bW; row.append('rect').attr('x', bLeft + labW + acc).attr('y', y).attr('width', Math.max(0.5, w - 1)).attr('height', rowH).attr('fill', famColor(p.f)).attr('data-f', p.f).on('mouseenter', ev => { hl(p.f); showTip(tipEl, `<b>${esc(x.name)}</b><br>${esc(p.f)}: ${(p.v / tot * 100).toFixed(1)}% · ${valStr(p.v)}`, ev, cont); }).on('mouseleave', () => { hl(famSel); hideTip(tipEl); }); acc += w; });
      row.append('text').attr('x', bLeft + labW + bW + 8).attr('y', y + rowH / 2).attr('dy', '0.35em').attr('font-size', 9.5).attr('font-family', 'ui-monospace, Menlo, monospace').attr('fill', t.muted).text(by === 'reads' ? fmt(tot) : fmtR(tot));
    });
    hl(famSel); this.wrapZoom(svg);
  },
  hl() {
    const g = this._g; if (!g) return; const focus = this._hv || S.selVirus; const groups = ringGroups(); const gIdx = S.selSample ? groups.findIndex(x => x.samples.includes(S.selSample)) : -1;
    const vOn = v => !v || matchV(v); const fOn = f => !f || !S.selFamily || f === S.selFamily;
    g.selectAll('[data-v]').each(function () { const id = this.dataset.v, f = this.dataset.f; const v = id ? D.vmap[id] : null; let o = 1; if (v) { if (!vOn(v)) o = 0.15; else if (focus) o = v.id === focus ? 1 : 0.35; } else if (!fOn(f)) o = 0.15; else if (focus) o = 0.5; if (this.classList.contains('cell') && gIdx >= 0 && +this.dataset.g !== gIdx) o = Math.min(o, 0.25); d3.select(this).attr('opacity', o).attr('font-weight', v && focus && v.id === focus && this.classList.contains('lab') ? 700 : null).attr('stroke-width', v && focus && v.id === focus && this.classList.contains('link') ? 3 : null); });
    g.selectAll('.clade,.famlab,.node').filter(function () { return !this.dataset.v; }).each(function () { const f = this.dataset.f; d3.select(this).attr('opacity', this.classList.contains('clade') ? (fOn(f) ? 0.09 : 0.02) : fOn(f) ? (this.classList.contains('node') && this.tagName === 'path' ? 0.55 : 1) : 0.2); });
    g.selectAll('.ringlab').attr('font-weight', function () { return gIdx >= 0 && +this.dataset.g === gIdx ? 700 : 400; });
  },
  toggleFam(f) { const c = { ...effCollapsed() }; c[f] = !c[f]; setState({ collapsed: c }); },
  // ---------- mouse tools
  zoomFilter(ev) { if (ev.type === 'wheel') return true; if (ev.type === 'dblclick') return false; return !ev.button && this.curTool() === 'pan'; },
  wrapZoom(svg) {
    const n = svg.node(); const zg = document.createElementNS('http://www.w3.org/2000/svg', 'g'); [...n.childNodes].slice(1).forEach(k => zg.appendChild(k)); n.appendChild(zg); const g = d3.select(zg); const self = this;
    const zoom = d3.zoom().scaleExtent([0.5, 12]).filter(ev => self.zoomFilter(ev)).on('zoom', e => { g.attr('transform', e.transform); self._T = e.transform; });
    svg.call(zoom).on('dblclick.zoom', null); this._zoom = zoom; if (this._T) svg.call(zoom.transform, this._T); this.installTools(svg, g, null);
  },
  installTools(svg, g, center) {
    const node = svg.node(); const self = this; const curs = { pan: 'grab', rotate: ROTATE_CURSOR, box: 'crosshair' }; const tool = () => self.curTool();
    svg.style('cursor', curs[tool()]); svg.on('mousedown.cur', () => { if (tool() === 'pan') svg.style('cursor', 'grabbing'); }).on('mouseup.cur', () => svg.style('cursor', curs[tool()]));
    const box = svg.append('rect').attr('fill', 'rgba(31,95,139,.08)').attr('stroke', '#1f5f8b').attr('stroke-width', 1.5).attr('stroke-dasharray', '5 3').attr('display', 'none').attr('pointer-events', 'none'); let st = null;
    const drag = d3.drag().filter(ev => !ev.button && tool() !== 'pan')
      .on('start', ev => { const p = d3.pointer(ev.sourceEvent, node); const T = d3.zoomTransform(node); hideTip($('#tree-tip')); if (tool() === 'rotate' && center != null) { const cs = T.apply([center, center]); st = { m: 'r', a0: Math.atan2(p[1] - cs[1], p[0] - cs[0]), cs, T, d: 0 }; svg.style('cursor', 'grabbing'); } else { st = { m: 'b', p0: p }; box.attr('display', null).attr('x', p[0]).attr('y', p[1]).attr('width', 0).attr('height', 0); } })
      .on('drag', ev => { if (!st) return; const p = d3.pointer(ev.sourceEvent, node); if (st.m === 'r') { const a = Math.atan2(p[1] - st.cs[1], p[0] - st.cs[0]); st.d = (a - st.a0) * 180 / Math.PI; g.attr('transform', st.T.toString() + ' rotate(' + st.d + ',' + center + ',' + center + ')'); } else { box.attr('x', Math.min(p[0], st.p0[0])).attr('y', Math.min(p[1], st.p0[1])).attr('width', Math.abs(p[0] - st.p0[0])).attr('height', Math.abs(p[1] - st.p0[1])); st.p1 = p; } })
      .on('end', () => {
        if (!st) return; const Z = st; st = null;
        if (Z.m === 'r') { svg.style('cursor', curs.rotate); if (Math.abs(Z.d) > 0.5) { const r = (((Math.round((S.treeRot || 0) + Z.d)) % 360) + 360) % 360; setState({ treeRot: r, zoomFam: '' }); } else g.attr('transform', Z.T.toString()); return; }
        box.attr('display', 'none'); if (!Z.p1) return;
        const x0 = Math.min(Z.p0[0], Z.p1[0]), x1 = Math.max(Z.p0[0], Z.p1[0]), y0 = Math.min(Z.p0[1], Z.p1[1]), y1 = Math.max(Z.p0[1], Z.p1[1]); if (x1 - x0 < 8 || y1 - y0 < 8) return;
        const T = d3.zoomTransform(node); const a = T.invert([x0, y0]), b = T.invert([x1, y1]); const bw = b[0] - a[0], bh = b[1] - a[1];
        const vb = (svg.attr('viewBox') || '').split(/[ ,]+/).map(Number); const vw = vb[2], vh = vb[3]; const tall = vh > 1300;
        const k = clamp(tall ? vw / bw * 0.95 : Math.min(vw / bw, vh / bh) * 0.95, 0.5, 12); const cyT = tall ? (y0 + y1) / 2 : vh / 2;
        svg.transition().duration(400).call(self._zoom.transform, d3.zoomIdentity.translate(vw / 2 - k * (a[0] + bw / 2), cyT - k * (a[1] + bh / 2)).scale(k));
      });
    svg.call(drag); svg.on('dblclick.reset', () => { self._T = null; svg.transition().duration(300).call(self._zoom.transform, d3.zoomIdentity); });
  },
  zoomBy(f) { if (this._svg && this._zoom) this._svg.transition().duration(250).call(this._zoom.scaleBy, f); },
  resetView() { this._T = null; if (this._svg && this._zoom) this._svg.call(this._zoom.transform, d3.zoomIdentity); },
  zoomToFam(f) {
    if (!this._g || !this._svg || !this._zoom) return; const el = this._g.select(`.clade[data-f="${f}"]`).node(); if (!el) return;
    const b = el.getBBox(); const m = el.parentNode.transform.baseVal.consolidate(); const ox = m ? m.matrix.e : 0, oy = m ? m.matrix.f : 0;
    const vb = (this._svg.attr('viewBox') || '').split(/[ ,]+/).map(Number); const vw = vb[2], vh = vb[3];
    const k = clamp(0.9 * Math.min(vw / b.width, vh / b.height), 1, 6); const tx = vw / 2 - k * (ox + b.x + b.width / 2), ty = vh / 2 - k * (oy + b.y + b.height / 2);
    this._svg.transition().duration(450).call(this._zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  },
};
const setRot = v => { const x = ((Math.round(v) % 360) + 360) % 360; VIEWS.tree._T = null; setState({ treeRot: x, zoomFam: '' }); };
Object.assign(ACTIONS, {
  'tree-layout': d => { VIEWS.tree._T = null; setState(d.k === 'comp' && S.treeValue === 'pct' ? { treeLayout: d.k, treeValue: 'reads' } : { treeLayout: d.k }); },
  'tree-collapse': () => { const c = {}; const col = effCollapsed(); if (Object.values(col).filter(Boolean).length < D.famOrder.length) D.famOrder.forEach(f => c[f] = true); setState({ collapsed: c }); },
  'tree-colors': () => setState({ colorOpen: !S.colorOpen, colorEdit: null }),
  'tree-ex': d => EXPORT.fig($('#tree-fig'), S.treeLayout === 'comp' ? 'mgviz_composition' : 'mgviz_tree', d.f),
  'tree-tool': d => setState({ treeTool: d.k }),
  'tree-zoom': d => VIEWS.tree.zoomBy(d.k === 'in' ? 1.5 : 1 / 1.5),
  'tree-reset': () => { VIEWS.tree._T = null; setState({ treeRot: 0, zoomFam: '' }, () => VIEWS.tree.resetView()); },
  'tree-rot': d => setRot(S.treeRot + (+d.k)),
  'colors-reset': () => { S.famColors = {}; S.hexDrafts = {}; S.paletteSel = null; S.colorEdit = null; saveColors(); render(); },
  'colors-pal': d => { S.paletteSel = d.k; S.famColors = {}; S.hexDrafts = {}; saveColors(); render(); },
  'colors-edit': d => setState({ colorEdit: S.colorEdit === d.k ? null : d.k }),
  'colors-set': d => { S.famColors = { ...S.famColors, [d.k]: d.c.toLowerCase() }; S.hexDrafts = { ...S.hexDrafts, [d.k]: d.c }; saveColors(); render(); },
  'colors-clear': d => { const fc = { ...S.famColors }; delete fc[d.k]; const hd = { ...S.hexDrafts }; delete hd[d.k]; S.famColors = fc; S.hexDrafts = hd; saveColors(); render(); },
});
Object.assign(INPUTS, {
  'tree-cols': v => { VIEWS.tree._T = null; setState({ treeCols: v }); },
  'tree-rot-slider': v => setRot(+v),
  'comp-top': v => setState({ compTop: v }),
  'comp-sort': v => setState({ compSort: v }),
  'tree-zoomfam': v => { const V = VIEWS.tree; if (!v) { V._T = null; setState({ zoomFam: '' }, () => { if (V._svg && V._zoom) V._svg.transition().duration(350).call(V._zoom.transform, d3.zoomIdentity); }); return; } const base = V._famMid && V._famMid[v]; const rot = base == null ? S.treeRot : (((Math.round(90 - base)) % 360) + 360) % 360; V._T = null; setState({ treeRot: rot, zoomFam: v }, () => setTimeout(() => V.zoomToFam(v), 40)); },
  'colors-hex': (val, d) => { const v2 = val.trim() && val.trim()[0] !== '#' ? '#' + val.trim() : val.trim(); S.hexDrafts = { ...S.hexDrafts, [d.k]: val }; if (/^#[0-9a-f]{6}$/i.test(v2)) { S.famColors = { ...S.famColors, [d.k]: v2.toLowerCase() }; saveColors(); VIEWS.tree._sig = null; if (S.tab === 'tree') { VIEWS.tree.draw(); VIEWS.tree.hl(); } } },
  'colors-pick': (val, d) => { S.famColors = { ...S.famColors, [d.k]: val }; S.hexDrafts = { ...S.hexDrafts, [d.k]: val }; saveColors(); render(); },
});
