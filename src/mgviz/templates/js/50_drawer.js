/* mgviz report — genome drawer: lineage, per-sample evidence, geNomad, coverage and ORFs per segment. */
VIEWS.drawer = {
  _sig: null,
  render() {
    const root = $('#drawer-root'); const v = S.selVirus ? D.vmap[S.selVirus] : null;
    if (!v) { root.innerHTML = ''; this._sig = null; return; }
    const t = tv(); const d = curDet(v); const dets = Object.values(v.det).sort((a, b) => b.rpkmf - a.rpkmf);
    const lineage = [['order', v.order], ['family', v.f], ['genus', v.g], ['species', v.sp]].filter(x => x[1]);
    const stats = [
      { k: 'confidence', v: TIERS[d.tier], sub: `in ${d.sample}` }, { k: 'aligned reads', v: fmtI(d.reads), sub: `RPKMF ${fmtR(d.rpkmf)}` },
      { k: 'covered', v: fmtPct(d.pct), sub: `mean ${d.meanCov.toFixed(0)}×` }, { k: 'read identity', v: d.rid.toFixed(1) + '%', sub: 'reads vs reference' },
      { k: 'consensus identity', v: d.cid == null ? '—' : d.cid.toFixed(1) + '%', attn: d.adj, sub: d.adj ? 'below species threshold' : 'to reference' },
      { k: 'diversity π', v: d.pi == null ? '—' : d.pi.toFixed(3), sub: d.nfrac == null ? '' : `${(d.nfrac * 100).toFixed(1)}% N in consensus` },
    ];
    const multi = v.segs.length > 1;
    const gvText = d.gv == null ? 'geNomad not run' : `${d.hall} hallmark gene${d.hall === 1 ? '' : 's'} · classified as ${d.gvTax ? d.gvTax.split(';').filter(Boolean).pop() : v.f}${d.adj ? ' (lineage downgraded)' : ''}`;
    root.innerHTML = `<div class="scrim" data-act="drawer-close"></div><div class="drawer" role="dialog" aria-label="${esc(v.n)}">
      <div class="dr-top"><div style="display:flex;flex-direction:column;gap:4px;min-width:0"><div class="dr-meta">${esc(v.f)} · <span class="mono">${esc(v.acc)}</span> · ${multi ? `${v.segs.length} segments · ${fmt(v.len)} bp` : `${fmtI(v.len)} bp`}</div><div class="dr-title">${esc(v.n)}</div></div><button class="dr-x" data-act="drawer-close" title="Close">×</button></div>
      <div class="lineage">${lineage.map(([r, n]) => `<span class="lchip"><span class="rk">${r}</span><span style="font-weight:${r === 'family' ? 600 : 400}">${esc(n)}</span></span>`).join('')}</div>
      <div class="dr-in"><span class="lbl">Detected in</span>${(S.drawerAll || dets.length <= 12 ? dets : dets.slice(0, 12).concat(dets.find(x => x.sample === d.sample) && dets.indexOf(dets.find(x => x.sample === d.sample)) >= 12 ? [dets.find(x => x.sample === d.sample)] : [])).map(x => `<button class="schip${x.sample === d.sample ? ' on' : ''}" data-act="drawer-sample" data-k="${esc(x.sample)}"><span class="nm">${esc(x.sample)}</span>${pillHtml(x.tier, 'xs')}</button>`).join('')}${dets.length > 12 ? `<button class="textact" data-act="drawer-all">${S.drawerAll ? 'Show fewer' : `+${dets.length - 12} more`}</button>` : ''}${v.nS > 1 ? `<button class="btn sm${S.compare ? ' on' : ''}" data-act="drawer-compare" style="margin-left:auto">Compare samples</button>` : ''}</div>
      <div class="tiles">${stats.map(st => `<div class="tile"><span class="k">${st.k}</span><span class="v${st.attn ? ' attn' : ''}">${esc(st.v)}</span><span class="s">${esc(st.sub)}</span></div>`).join('')}</div>
      <div class="gvstrip"><span class="k">geNomad</span><span class="v">${d.gv == null ? '—' : d.gv.toFixed(2)}</span><span class="bar"><i style="width:${d.gv == null ? 0 : Math.round(d.gv * 100)}%"></i></span><span class="t">${esc(gvText)}</span></div>
      <div class="dr-cov"><div class="t">${multi ? `Coverage and ORFs per segment · ${esc(d.sample)}` : `Coverage and ORFs · ${esc(d.sample)}`}</div><span class="exports"><button data-act="drawer-ex" data-f="svg">SVG</button><button data-act="drawer-ex" data-f="png">PNG</button></span></div>
      <div class="gen" id="gen" style="grid-template-columns:${multi ? 'repeat(auto-fill,minmax(250px,1fr))' : '1fr'}"></div>
      <div class="dr-note">Depth on a symlog axis, 100 windows per segment. Arrows are predicted ORFs: forward strand above the line, reverse below; hover for coordinates. Dashed outline marks a partial ORF.</div></div>`;
    this.draw(v, d, dets);
  },
  draw(v, det, dets) {
    const el = $('#gen'); const t = tv(); const compare = S.compare && dets.length > 1; const col = t.ink;
    const pal = PALS[S.paletteSel] || PALS.mgviz; const sColor = i => isDark() ? d3.color(pal[(i + 2) % pal.length]).brighter(.7).formatHex() : pal[(i + 2) % pal.length];
    const multi = v.segs.length > 1;
    if (compare) { const lg = d3.select(el).append('div').style('grid-column', '1 / -1').style('display', 'flex').style('gap', '12px').style('flex-wrap', 'wrap').style('font-size', '11.5px'); dets.forEach((d, i) => lg.append('span').style('display', 'flex').style('align-items', 'center').style('gap', '5px').html(`<span style="width:14px;height:3px;background:${sColor(i)};border-radius:2px"></span><span class="mono">${esc(d.sample)}</span><span class="muted">${fmt(d.reads)} reads</span>`)); }
    det.segs.forEach((sg, si) => {
      const wrap = d3.select(el).append('div').style('min-width', '0'); const W = Math.max(200, wrap.node().clientWidth || (multi ? 260 : 560));
      const covH = multi ? 70 : 140, orfH = multi ? 26 : 34, axH = 22, top = multi ? 18 : 8; const H = top + covH + 8 + orfH + axH;
      const svg = wrap.append('svg').attr('class', 'fig-svg').attr('width', W).attr('height', H).attr('viewBox', [0, 0, W, H]).attr('font-family', '-apple-system, Segoe UI, system-ui, Helvetica, sans-serif').style('display', 'block'); svg.append('rect').attr('width', W).attr('height', H).attr('fill', t.bg);
      const ml = multi ? 30 : 40, mr = 8; const x = d3.scaleLinear().domain([0, sg.len]).range([ml, W - mr]);
      const covOf = d => (d.segs[si] || sg).cov; const maxD = compare ? d3.max(dets, d => d3.max(covOf(d))) : d3.max(sg.cov); const y = d3.scaleSymlog().domain([0, Math.max(10, (maxD || 0) * 1.1)]).range([top + covH, top]);
      if (multi) svg.append('text').attr('x', ml).attr('y', 11).attr('font-size', 11).attr('font-weight', 600).attr('fill', t.fg).text(sg.label || sg.acc).append('tspan').attr('fill', t.muted).attr('font-weight', 400).text(`  ${fmtI(sg.len)} bp · ${fmt(sg.reads)} reads · ${fmtPct(sg.pct)}`);
      const yAx = d3.axisLeft(y).ticks(multi ? 3 : 5, '~s').tickSize(-(W - ml - mr)); svg.append('g').attr('transform', `translate(${ml},0)`).call(yAx).call(g => { g.select('.domain').remove(); g.selectAll('.tick line').attr('stroke', t.faint); g.selectAll('.tick text').attr('fill', t.muted).attr('font-size', 9.5); });
      const n = sg.cov.length || 100; const area = d3.area().x((d, i) => x((i + 0.5) * sg.len / n)).y0(y(0)).y1(d => y(d)).curve(d3.curveStepAfter); const line = d3.line().x((d, i) => x((i + 0.5) * sg.len / n)).y(d => y(d)).curve(d3.curveStepAfter);
      if (compare) dets.forEach((d, i) => svg.append('path').datum(covOf(d)).attr('d', line).attr('fill', 'none').attr('stroke', sColor(i)).attr('stroke-width', 1.5).attr('opacity', .9));
      else { svg.append('path').datum(sg.cov).attr('d', area).attr('fill', col).attr('opacity', .22); svg.append('path').datum(sg.cov).attr('d', line).attr('fill', 'none').attr('stroke', col).attr('stroke-width', 1.4);
        sg.cov.forEach((c, i) => { if (c === 0) svg.append('rect').attr('x', x(i * sg.len / n)).attr('y', top + covH - 3).attr('width', Math.max(1, x(sg.len / n) - x(0))).attr('height', 3).attr('fill', t.attn); }); }
      const oy = top + covH + 8; svg.append('line').attr('x1', ml).attr('x2', W - mr).attr('y1', oy + orfH / 2).attr('y2', oy + orfH / 2).attr('stroke', t.line); const ah = multi ? 9 : 12;
      (sg.orfs || []).forEach((o, k) => {
        const [st, en, strand, , partial] = o; const fwd = strand !== '-' && strand !== -1; const name = `ORF${k + 1}`;
        const x0 = x(st), x1 = x(en), w = x1 - x0; const yy = fwd ? oy + orfH / 2 - ah - 1 : oy + orfH / 2 + 1; const head = Math.min(6, w * 0.4);
        const pts = fwd ? [[x0, yy], [x1 - head, yy], [x1, yy + ah / 2], [x1 - head, yy + ah], [x0, yy + ah]] : [[x1, yy], [x0 + head, yy], [x0, yy + ah / 2], [x0 + head, yy + ah], [x1, yy + ah]];
        const p = svg.append('polygon').attr('points', pts.map(q => q.join(',')).join(' ')).attr('fill', col).attr('opacity', fwd ? .85 : .55).attr('stroke', partial ? t.fg : 'none').attr('stroke-dasharray', partial ? '2 2' : null).style('cursor', 'pointer');
        p.append('title').text(`${name} · ${fmtI(st)}–${fmtI(en)} (${fmtI(en - st + 1)} bp) · ${fwd ? '+' : '−'} strand${partial ? ' · partial' : ''}`);
        if (w > name.length * (multi ? 5.2 : 6.2) + 8) svg.append('text').attr('x', (x0 + x1) / 2).attr('y', yy + ah / 2).attr('dy', '0.35em').attr('text-anchor', 'middle').attr('font-size', multi ? 8.5 : 10).attr('font-weight', 600).attr('fill', t.bg).attr('pointer-events', 'none').text(name);
      });
      svg.append('text').attr('x', ml - 4).attr('y', oy + orfH / 2 - ah / 2 - 1).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 8.5).attr('fill', t.muted).text('+'); svg.append('text').attr('x', ml - 4).attr('y', oy + orfH / 2 + ah / 2 + 1).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 8.5).attr('fill', t.muted).text('−');
      const xAx = d3.axisBottom(x).ticks(multi ? 3 : 7).tickFormat(d => d >= 1000 ? (d / 1000).toFixed(d % 1000 ? 1 : 0) + ' kb' : d + ' bp').tickSize(3); svg.append('g').attr('transform', `translate(0,${oy + orfH + 2})`).call(xAx).call(g => { g.select('.domain').attr('stroke', t.line); g.selectAll('.tick line').attr('stroke', t.line); g.selectAll('.tick text').attr('fill', t.muted).attr('font-size', 9.5); });
    });
  },
};
Object.assign(ACTIONS, {
  'drawer-close': () => setState({ selVirus: null, compare: false, drawerSample: null, drawerAll: false }),
  'drawer-all': () => setState({ drawerAll: !S.drawerAll }),
  'drawer-sample': d => setState({ drawerSample: d.k }),
  'drawer-compare': () => setState({ compare: !S.compare }),
  'drawer-ex': d => { const v = D.vmap[S.selVirus]; EXPORT.fig($('#gen'), 'mgviz_genome_' + (v ? v.acc : 'genome'), d.f); },
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && S.selVirus) ACTIONS['drawer-close'](); });
