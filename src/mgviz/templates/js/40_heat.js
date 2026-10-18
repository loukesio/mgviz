/* mgviz report — Samples × taxa: clustered heatmap (UPGMA, Lance–Williams average, log abundance). */
function clusterVecs(vecs) {
  const n = vecs.length; if (!n) return null;
  const nodes = vecs.map((v, i) => ({ leaf: i, leaves: [i], h: 0, size: 1 })); if (n < 2) return nodes[0];
  const M = []; for (let i = 0; i < n; i++) M[i] = new Float64Array(n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { let s = 0; const a = vecs[i], b = vecs[j]; for (let k = 0; k < a.length; k++) { const x = a[k] - b[k]; s += x * x; } M[i][j] = M[j][i] = Math.sqrt(s); }
  const act = nodes.map((_, i) => i);
  while (act.length > 1) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let a = 0; a < act.length; a++) { const Da = M[act[a]]; for (let b = a + 1; b < act.length; b++) { const d = Da[act[b]]; if (d < bd) { bd = d; bi = a; bj = b; } } }
    const i = act[bi], j = act[bj], A = nodes[i], B = nodes[j];
    const m = { children: [A, B], leaves: A.leaves.concat(B.leaves), h: bd, size: A.size + B.size };
    for (const k of act) { if (k === i || k === j) continue; const d = (M[i][k] * A.size + M[j][k] * B.size) / m.size; M[i][k] = M[k][i] = d; }
    nodes[i] = m; act.splice(bj, 1);
  }
  return nodes[act[0]];
}
function drawDendro(g, node, posOf, hScale, horizontal, color) {
  const walk = n => {
    if (!n.children) return posOf(n.leaf);
    const p = n.children.map(walk); const y = hScale(n.h);
    n.children.forEach((c, k) => { const yc = hScale(c.h); g.append('path').attr('d', horizontal ? `M${yc},${p[k]}H${y}` : `M${p[k]},${yc}V${y}`); });
    g.append('path').attr('d', horizontal ? `M${y},${p[0]}V${p[1]}` : `M${p[0]},${y}H${p[1]}`);
    return (p[0] + p[1]) / 2;
  };
  walk(node); g.selectAll('path').attr('fill', 'none').attr('stroke', color).attr('stroke-width', 1);
}
function valOf(d) { const k = S.treeValue; return k === 'pct' ? d.pct / 100 : k === 'reads' ? Math.log10(d.reads + 1) / Math.log10(D.maxReads + 1) : Math.log10(d.rpkmf + 1) / Math.log10(D.maxRpkmf + 1); }
function heatLim() { const v = S.heatTop; if (v === 'all') return 0; if (v === 'auto') return D.viruses.length > 60 ? 50 : 0; return +v; }

VIEWS.heat = {
  _sig: null, _hv: null, _hs: null,
  render() {
    const N = D.samples.length;
    const hv = D.viruses.filter(v => matchV(v) || (!S.selSample && !S.search && !S.selFamily)).length; const lim = heatLim(); const shown = lim ? Math.min(lim, hv) : hv;
    const note = 'low → high · ' + (shown < hv ? `${shown} of ${hv} viruses, most prevalent first` : `${hv} viruses`) + ' · ' + (S.heatCols === 'type' ? 'columns grouped by sample type, rows clustered' : 'rows and columns clustered (average linkage, log abundance)');
    const showTypes = N > 1 && S.heatCols !== 'type' && D.types.length > 1;
    $('#heat-bar').innerHTML = `<div class="toolbar">
      <label class="lbl">Cell value <select class="select" data-act="tree-value">${[['rpkmf', 'abundance (RPKMF, log)'], ['reads', 'aligned reads (log)'], ['pct', 'genome covered (%)']].map(([k, l]) => `<option value="${k}"${S.treeValue === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <span class="lbl"><span class="ramp"></span>${note}</span>
      <label class="lbl">Rows <select class="select" data-act="heat-top">${[['auto', 'auto (top 50 if more than 60)'], ['30', 'top 30 by prevalence'], ['50', 'top 50 by prevalence'], ['100', 'top 100 by prevalence'], ['all', 'all viruses']].map(([k, l]) => `<option value="${k}"${S.heatTop === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="lbl">Columns <select class="select" data-act="heat-cols">${[['cluster', 'clustered by similarity'], ['type', 'grouped by sample type']].map(([k, l]) => `<option value="${k}"${S.heatCols === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      ${showTypes ? `<span class="typeleg">type strip${D.types.map(ty => `<span style="display:flex;align-items:center;gap:4px"><i style="background:${typeShade(ty)}"></i>${esc(ty)}</span>`).join('')}</span>` : ''}
      <span class="push"></span><span class="exports md"><button data-act="heat-ex" data-f="svg">SVG</button><button data-act="heat-ex" data-f="png">PNG</button><button data-act="heat-ex" data-f="tsv">TSV</button></span></div>`;
    const sig = JSON.stringify([S.treeValue, S.heatTop, S.heatCols, S.selSample, S.selFamily, S.search, S.minTier, S.famColors, S.paletteSel, isDark(), $('#heat-fig').clientWidth]);
    if (sig !== this._sig || !$('#heat-fig').firstChild) { this._sig = sig; this.draw(); }
    this.hl();
  },
  resize() { if (S.tab === 'heat') this.render(); },
  draw() {
    const el = $('#heat-fig'), t = tv(), sq = seq(); const byType = S.heatCols === 'type';
    let vs = D.viruses.filter(v => matchV(v) || (!S.selSample && !S.search && !S.selFamily)).sort((a, b) => b.nS - a.nS || b.tot - a.tot);
    const lim = heatLim(); if (lim && vs.length > lim) vs = vs.slice(0, lim);
    const sm = S.selSample ? D.samples.filter(x => x.name === S.selSample) : D.samples;
    const nR = vs.length, nC = sm.length;
    d3.select(el).selectAll('*').remove();
    if (!nR) { el.innerHTML = '<div class="empty" style="padding:24px 18px">Nothing in the current focus.</div>'; this._svg = null; return; }
    const rowTree = clusterVecs(vs.map(v => sm.map(x => v.det[x.name] ? Math.log10(v.det[x.name].rpkmf + 1) : 0)));
    const colTree = clusterVecs(sm.map(x => vs.map(v => v.det[x.name] ? Math.log10(v.det[x.name].rpkmf + 1) : 0)));
    const rowOrder = rowTree ? rowTree.leaves : [0]; let colOrder = colTree ? colTree.leaves : [0];
    if (byType) { const cp = new Map(colOrder.map((c, k) => [c, k])); colOrder = sm.map((x, j) => j).sort((a, b) => D.types.indexOf(sm[a].type) - D.types.indexOf(sm[b].type) || cp.get(a) - cp.get(b)); }
    const rIdx = new Map(rowOrder.map((r, k) => [r, k])), cIdx = new Map(colOrder.map((c, k) => [c, k]));
    let W = Math.max(480, el.clientWidth); const dendW = nR > 1 ? 70 : 10, dendH = nC > 1 ? 50 : 10, labW = Math.min(260, (d3.max(vs, v => v.n.length) || 10) * 6.6 + 24), totW = 70;
    const cellH = nR > 90 ? 9 : nR > 45 ? 14 : 24; const cellW = Math.max(6, Math.min(64, (W - dendW - labW - totW - 60) / nC)); const gp = cellW < 9 ? 0.5 : 1;
    const hdrH = cellW < 9 ? 20 : cellW < 70 ? 110 : 24; const top = dendH + hdrH + 16, left = dendW + 10;
    W = Math.max(W, left + nC * cellW + 10 + labW + totW + 30); const H = top + nR * cellH + 60;
    const svg = d3.select(el).append('svg').attr('class', 'fig-svg').attr('width', W).attr('height', H).attr('viewBox', [0, 0, W, H]).attr('font-family', '-apple-system, Segoe UI, system-ui, Helvetica, sans-serif').style('display', 'block');
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', t.bg); this._svg = svg;
    const tipEl = $('#heat-tip'), cont = $('#heat-box'); const self = this;
    svg.on('mouseleave', () => { self._hv = null; self._hs = null; self.hl(); hideTip(tipEl); });
    const rowY = i => top + rIdx.get(i) * cellH, colX = j => left + cIdx.get(j) * cellW;
    if (rowTree && nR > 1) { const hs = d3.scaleLinear().domain([0, rowTree.h || 1]).range([left - 6, left - dendW + 4]); drawDendro(svg.append('g'), rowTree, i => rowY(i) + cellH / 2, hs, true, t.muted); }
    if (colTree && nC > 1 && !byType) { const hs = d3.scaleLinear().domain([0, colTree.h || 1]).range([top - hdrH - 8, top - hdrH - dendH + 4]); drawDendro(svg.append('g'), colTree, j => colX(j) + cellW / 2, hs, false, t.muted); }
    if (byType && nC > 1) {
      D.types.forEach(ty => { const js = colOrder.filter(j => sm[j].type === ty); if (!js.length) return; const x0 = colX(js[0]), x1 = colX(js[js.length - 1]) + cellW; const yb = top - hdrH - 20;
        svg.append('path').attr('d', `M${x0 + 1},${yb + 6}V${yb}H${x1 - 1}V${yb + 6}`).attr('fill', 'none').attr('stroke', t.muted);
        svg.append('text').attr('x', (x0 + x1) / 2).attr('y', yb - 6).attr('text-anchor', 'middle').attr('font-size', 10.5).attr('fill', t.fg).text(`${ty} · ${js.length}`); });
    } else if (nC > 1 && D.types.length > 1) {
      const sy = cellW >= 9 ? top - hdrH - 2 : top - 14;
      sm.forEach((x, j) => svg.append('rect').attr('x', colX(j) + gp).attr('y', sy).attr('width', Math.max(1, cellW - 2 * gp)).attr('height', 6).attr('fill', typeShade(x.type)).append('title').text(x.name + ' · ' + x.type));
    }
    const cells = svg.append('g');
    vs.forEach((v, i) => sm.forEach((x, j) => {
      const d = v.det[x.name]; const fill = d ? sq(Math.max(0.08, valOf(d))) : t.absent;
      cells.append('rect').attr('x', colX(j) + gp).attr('y', rowY(i) + gp).attr('width', cellW - 2 * gp).attr('height', cellH - 2 * gp).attr('rx', cellW < 9 ? 0 : 2).attr('fill', fill).attr('data-v', v.id).attr('data-s', x.name).attr('class', 'cell').style('cursor', 'pointer')
        .on('mouseenter', ev => { self._hv = v.id; self._hs = x.name; self.hl(); showTip(tipEl, `<b>${esc(v.n)}</b><br><span style="font-family:ui-monospace,Menlo,monospace">${esc(x.name)}</span> · ${esc(x.type)}<br>${d ? `${fmt(d.reads)} reads · RPKMF ${fmtR(d.rpkmf)} · ${fmtPct(d.pct)} covered · ${TIERS[d.tier]}` : 'not detected'}`, ev, cont); })
        .on('mouseleave', () => { self._hv = null; self._hs = null; self.hl(); hideTip(tipEl); })
        .on('click', () => setState({ selVirus: v.id, drawerSample: x.name, compare: false }));
      if (d && cellW >= 40 && cellH >= 14) cells.append('text').attr('x', colX(j) + cellW / 2).attr('y', rowY(i) + cellH / 2).attr('dy', '0.35em').attr('text-anchor', 'middle').attr('font-size', cellH >= 20 ? 10.5 : 9).attr('font-family', 'ui-monospace, Menlo, monospace').attr('fill', inkOn(fill)).attr('pointer-events', 'none').attr('data-v', v.id).attr('data-s', x.name).attr('class', 'celltext').text(S.treeValue === 'pct' ? fmtPct(d.pct) : S.treeValue === 'reads' ? fmt(d.reads) : fmtR(d.rpkmf));
    }));
    const lx = left + nC * cellW + 10; const rl = svg.append('g');
    vs.forEach((v, i) => {
      rl.append('rect').attr('x', lx).attr('y', rowY(i) + cellH / 2 - 4).attr('width', 8).attr('height', 8).attr('rx', 2).attr('fill', famColor(v.f)).attr('data-v', v.id).attr('class', 'rlab');
      rl.append('text').attr('x', lx + 13).attr('y', rowY(i) + cellH / 2).attr('dy', '0.35em').attr('font-size', cellH >= 20 ? 11.5 : cellH >= 14 ? 10 : 8).attr('fill', t.fg).attr('data-v', v.id).attr('class', 'rlab').style('cursor', 'pointer').text(v.n + (v.nS > 1 ? `  ·  ${v.nS}` : ''))
        .on('click', () => setState({ selVirus: v.id, drawerSample: null, compare: false })).on('mouseenter', () => { self._hv = v.id; self.hl(); }).on('mouseleave', () => { self._hv = null; self.hl(); });
    });
    const tx = lx + labW; const tsc = d3.scaleLog().domain([1, D.maxReads * 1.2]).range([0, totW - 10]);
    svg.append('text').attr('x', tx).attr('y', top - 8).attr('font-size', 10).attr('fill', t.muted).text('total reads');
    vs.forEach((v, i) => { svg.append('rect').attr('x', tx).attr('y', rowY(i) + 2).attr('width', Math.max(1, tsc(Math.max(1, v.tot)))).attr('height', Math.max(2, cellH - 4)).attr('rx', 1.5).attr('fill', t.muted).attr('opacity', .5); if (cellH >= 14) svg.append('text').attr('x', tx + tsc(Math.max(1, v.tot)) + 4).attr('y', rowY(i) + cellH / 2).attr('dy', '0.35em').attr('font-size', 9).attr('font-family', 'ui-monospace, Menlo, monospace').attr('fill', t.muted).text(fmt(v.tot)); });
    const ch = svg.append('g');
    sm.forEach((x, j) => {
      const cx = colX(j) + cellW / 2;
      if (cellW >= 9) ch.append('text').attr('transform', `translate(${cx},${top - 8}) rotate(${cellW < 70 ? -60 : 0})`).attr('text-anchor', cellW < 70 ? 'start' : 'middle').attr('dy', '0.32em').attr('font-size', Math.min(11, Math.max(8, cellW - 2))).attr('font-family', 'ui-monospace, Menlo, monospace').attr('fill', t.fg).attr('data-s', x.name).attr('class', 'clab').style('cursor', 'pointer').text(x.name)
        .on('click', () => setState({ selSample: S.selSample === x.name ? null : x.name })).on('mouseenter', () => { self._hs = x.name; self.hl(); }).on('mouseleave', () => { self._hs = null; self.hl(); });
      const n = vs.filter(v => v.det[x.name]).length; const by = top + nR * cellH + 8;
      ch.append('rect').attr('x', colX(j) + 1).attr('y', by).attr('width', Math.max(1, cellW - 2)).attr('height', Math.max(2, n / Math.max(1, nR) * 34)).attr('rx', 1.5).attr('fill', t.muted).attr('opacity', .5);
      if (cellW >= 14) ch.append('text').attr('x', cx).attr('y', by + 46).attr('text-anchor', 'middle').attr('font-size', 9).attr('font-family', 'ui-monospace, Menlo, monospace').attr('fill', t.muted).text(n);
    });
    svg.append('text').attr('x', left - 6).attr('y', top + nR * cellH + 30).attr('text-anchor', 'end').attr('font-size', 10).attr('fill', t.muted).text('viruses');
  },
  hl() {
    const svg = this._svg; if (!svg) return; const fv = this._hv || S.selVirus, fs = this._hs;
    svg.selectAll('.cell,.celltext,.rlab,.clab').each(function () { const v = this.dataset.v, sm = this.dataset.s; let o = 1; if (fv && v && v !== fv) o = 0.35; if (fs && sm && sm !== fs) o = Math.min(o, 0.35); this.setAttribute('opacity', o); });
  },
  tsv() { const rows = [['virus', 'family', ...D.samples.map(s => s.name)]]; D.viruses.forEach(v => rows.push([v.n, v.f, ...D.samples.map(s => v.det[s.name] ? v.det[s.name].rpkmf.toFixed(2) : 0)])); EXPORT.rows(rows, 'mgviz_sample_by_taxon_rpkmf', 'tsv'); },
};
Object.assign(ACTIONS, { 'heat-ex': d => { if (d.f === 'tsv') VIEWS.heat.tsv(); else EXPORT.fig($('#heat-fig'), 'mgviz_sample_by_taxon', d.f); } });
Object.assign(INPUTS, { 'tree-value': v => setState({ treeValue: v }), 'heat-top': v => setState({ heatTop: v }), 'heat-cols': v => setState({ heatCols: v }) });
