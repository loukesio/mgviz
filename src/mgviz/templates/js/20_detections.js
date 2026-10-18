/* mgviz report — Detections: grouped table with evidence per call. */
VIEWS.table = {
  render() {
    const many = D.samples.length > 12, N = D.samples.length;
    const fd0 = filteredDets(); const nFlag = fd0.filter(flagOf).length; const fd = S.flagOnly ? fd0.filter(flagOf) : fd0;
    const gb = S.groupBy === 'auto' ? (many ? 'virus' : 'sample') : S.groupBy;
    const allKeys = fd.filter(d => d.virus.segs.length > 1).map(d => d.virus.id + '|' + d.sample); const anyExp = allKeys.some(k => S.expanded[k]);
    $('#tbl-bar').innerHTML = `
      <span class="lbl">Group by<span class="segc">${[['sample', 'Sample'], ['virus', 'Virus']].map(([k, l]) => `<button class="${gb === k ? 'on' : ''}" data-act="t-group" data-k="${k}">${l}</button>`).join('')}</span></span>
      <button class="btn sm${S.sharedOnly ? ' on' : ''}" data-act="t-shared">Only viruses in ≥ 2 samples</button>
      <button class="btn sm${S.flagOnly ? ' attn-on' : ''}" data-act="t-flag" title="Calls whose numbers disagree: identity below the species threshold (possible new variant), low geNomad score despite good coverage, or a virus that is unexpected for the sample (possible contamination)">Needs checking · ${nFlag}</button>
      <button class="textact" data-act="t-expand">${anyExp ? 'Collapse segments' : 'Expand all segments'}</button>
      <span class="push muted">${fd.length} calls · ${new Set(fd.map(d => d.virus.id)).size} viruses · ${new Set(fd.map(d => d.sample)).size} samples</span>
      <button class="btn sm" data-act="t-tsv">TSV</button>`;
    this._allKeys = allKeys; this._anyExp = anyExp; this._fd = fd;
    // groups
    const sortKey = S.sortKey, sdir = S.sortDir;
    const kf = d => sortKey === 'name' ? (gb === 'virus' ? d.sample : d.virus.n) : sortKey === 'tier' ? d.tier * 1e6 + d.rpkmf : sortKey === 'gv' ? (d.gv == null ? -1 : d.gv) : d[sortKey];
    const sorter = (a, b) => { const ka = kf(a), kb = kf(b); return (ka > kb ? 1 : ka < kb ? -1 : 0) * sdir; };
    const ROWS = gb === 'virus' ? 5 : 8, GL = S.groupLimit; let groups;
    if (gb === 'sample') { const by = S.selSample ? D.samples.filter(x => x.name === S.selSample) : D.samples; groups = by.map(x => ({ key: 's:' + x.name, x, rows: fd.filter(d => d.sample === x.name) })).filter(g => g.rows.length); }
    else { const m = new Map(); fd.forEach(d => { if (!m.has(d.virus.id)) m.set(d.virus.id, { key: 'v:' + d.virus.id, v: d.virus, rows: [] }); m.get(d.virus.id).rows.push(d); }); groups = [...m.values()].sort((a, b) => b.rows.length - a.rows.length || b.v.tot - a.v.tot); }
    const COLS = [['name', gb === 'virus' ? 'Sample' : 'Virus', 'left'], ['tier', 'Confidence', 'left'], ['reads', 'Reads', 'right'], ['rpkmf', 'Abundance (RPKMF)', 'left'], ['pct', 'Coverage along genome', 'left'], ['rid', 'Identity to reference', 'left'], ['gv', 'geNomad', 'left']];
    let h = `<div class="tblbox"><div class="tblin"><div class="thead">${COLS.map(([k, l, a]) => `<button class="${a === 'right' ? 'right ' : ''}${sortKey === k ? 'on' : ''}" data-act="t-sort" data-k="${k}">${l}${sortKey === k ? (sdir < 0 ? ' ▾' : ' ▴') : ''}</button>`).join('')}</div>`;
    if (!groups.length) h += `<div class="empty" style="padding:24px 16px">No detections in the current focus.</div>`;
    groups.slice(0, GL).forEach(g => {
      const rows = g.rows.sort(sorter); const op = !!S.groupOpen[g.key]; const vis = op ? rows : rows.slice(0, ROWS); const nC = rows.filter(d => d.tier >= 2).length;
      if (gb === 'sample') h += `<div class="ghrow"><button class="gh-name mono" data-act="sel-sample" data-k="${esc(g.x.name)}">${esc(g.x.name)}</button><span class="gh-sum">${esc(g.x.type)} · ${rows.length} call${rows.length > 1 ? 's' : ''}, ${nC} confident · ${fmt(g.x.filtered)} non-host reads, ${fmt(g.x.mapped)} viral</span></div>`;
      else h += `<div class="ghrow"><button class="gh-name" data-act="open-virus" data-k="${esc(g.v.id)}">${esc(g.v.n)}</button><span class="gh-sum">${esc(g.v.f)} · in ${rows.length} of ${N} samples, ${nC} confident · ${fmt(rows.reduce((a, d) => a + d.reads, 0))} reads</span></div>`;
      vis.forEach(d => { h += this.rowHtml(d, gb); });
      if (rows.length > ROWS) h += `<button class="grp-more" data-act="t-grp-more" data-k="${esc(g.key)}">${op ? 'Show fewer' : `Show all ${rows.length} ${gb === 'sample' ? 'calls' : 'samples'} ▾`}</button>`;
    });
    if (groups.length > GL) h += `<button class="more-groups" data-act="t-more-groups">Show ${Math.min(20, groups.length - GL)} more ${gb === 'sample' ? 'samples' : 'viruses'} · ${groups.length - GL} not shown</button>`;
    h += `</div></div>`;
    $('#tbl-wrap').innerHTML = h;
  },
  rowHtml(d, gb) {
    const v = d.virus, key = v.id + '|' + d.sample, exp = !!S.expanded[key]; const smp = D.smap[d.sample];
    const sp = d._sp || (d._sp = spark(d.segs.map(q => q.cov), 170, 36));
    const fl = flagOf(d); const showFlag = fl && fl[0] !== 'DIVERGENT';
    const name = gb === 'virus' ? d.sample : v.n; const lineage = gb === 'virus' ? `${smp.type} · ${fmt(smp.filtered)} non-host reads` : `${v.f} · ${v.g}`;
    let h = `<div class="trow${S.selVirus === v.id ? ' sel' : ''}" data-key="${esc(key)}">
      <div class="tname"><button class="vn${gb === 'virus' ? ' mono' : ''}" data-act="open-virus" data-k="${esc(v.id)}" data-s="${esc(d.sample)}">${esc(name)}</button>
        <div class="ln"><span>${esc(lineage)}</span>${v.segs.length > 1 ? `<button class="segchip" data-act="t-toggle-seg" data-k="${esc(key)}">${v.segs.length} segments ${exp ? '▴' : '▾'}</button>` : ''}${showFlag ? `<span class="badge" title="${esc(fl[1])}">${fl[0]}</span>` : ''}</div></div>
      <div class="tier-wrap" data-tier-key="${esc(key)}">${pillHtml(d.tier)}</div>
      <div class="treads">${fmtI(d.reads)}</div>
      <div class="tab-col"><span class="v">${fmtR(d.rpkmf)}</span><span class="bar"><i style="width:${Math.max(1, abund(d) * 100).toFixed(1)}%"></i></span></div>
      <div class="tcov"><svg width="170" height="36" viewBox="0 0 170 36"><rect width="170" height="36" rx="3" fill="var(--line2)"></rect><path d="${sp.fill}" fill="var(--fg)" opacity="0.14"></path><path d="${sp.line}" fill="none" stroke="var(--fg)" stroke-width="1.1" opacity="0.8"></path><path d="${sp.sep}" fill="none" stroke="var(--panel)" stroke-width="1.5"></path></svg><span class="pct">${fmtPct(d.pct)}</span></div>
      <div class="tid"><span><span class="k">read </span>${d.rid.toFixed(1)}%</span><span class="cons"><span><span class="k">cons </span>${d.cid == null ? '—' : d.cid.toFixed(1) + '%'}</span>${d.adj ? `<span class="badge" title="Consensus identity below the species threshold: taxonomy downgraded to genus. Possibly a new variant.">DIVERGENT</span>` : ''}</span></div>
      <div class="tgv">${d.gv == null ? '<span class="muted">not run</span>' : `<span>${d.gv.toFixed(2)}</span><span class="hall"> · ${d.hall} hallmark</span>`}</div>
    </div>`;
    if (exp) d.segs.forEach(sg => { const ss = sg._sp || (sg._sp = spark([sg.cov], 170, 22)); h += `<div class="srow"><div class="sl"><span class="lab">${esc(sg.label)}</span><span class="acc">${esc(sg.acc)}</span></div><div class="mono muted">${fmtI(sg.len)} bp</div><div class="mono r">${fmtI(sg.reads)}</div><div class="mono muted">${sg.meanCov.toFixed(0)}× mean</div><div class="tcov"><svg width="170" height="22" viewBox="0 0 170 22"><rect width="170" height="22" rx="3" fill="var(--line2)"></rect><path d="${ss.fill}" fill="var(--fg)" opacity="0.14"></path><path d="${ss.line}" fill="none" stroke="var(--fg)" stroke-width="1" opacity="0.8"></path></svg><span class="pct mono">${fmtPct(sg.pct)}</span></div><div></div><div></div></div>`; });
    return h;
  },
  popoverHtml(d) {
    const t = tv();
    const checks = [['Genome covered ≥ 80%', d.pct >= 80, fmtPct(d.pct)], ['Aligned reads ≥ 500', d.reads >= 500, fmtI(d.reads)], ['Read identity ≥ 90%', d.rid >= 90, d.rid.toFixed(1) + '%'],
      ['geNomad score ≥ 0.8', d.gv == null ? true : d.gv >= .8, d.gv == null ? 'not run' : d.gv.toFixed(2)]];
    return `<div class="popover"><div class="ttl">Why “${TIERS[d.tier]}”</div>${checks.map(([l, ok, v]) => `<div class="chk"><span class="mk${ok ? '' : ' no'}">${ok ? '✓' : '✕'}</span><span>${l}</span><span class="val">${v}</span></div>`).join('')}<div class="ft">High = all four. Medium = ≥ 40% covered and ≥ 50 reads. Low = ≥ 10 reads. Fewer = trace.</div></div>`;
  },
};
Object.assign(ACTIONS, {
  't-group': d => setState({ groupBy: d.k, groupLimit: 20, groupOpen: {} }),
  't-shared': () => setState({ sharedOnly: !S.sharedOnly }),
  't-flag': () => setState({ flagOnly: !S.flagOnly, groupLimit: 20 }),
  't-expand': () => { const e = {}; if (!VIEWS.table._anyExp) VIEWS.table._allKeys.forEach(k => e[k] = true); setState({ expanded: e }); },
  't-tsv': () => EXPORT.rows(EXPORT.detectionRows(VIEWS.table._fd || filteredDets()), 'mgviz_detections' + focusTag(), 'tsv'),
  't-sort': d => setState({ sortKey: d.k, sortDir: S.sortKey === d.k ? -S.sortDir : (d.k === 'name' ? 1 : -1) }),
  't-grp-more': d => setState({ groupOpen: { ...S.groupOpen, [d.k]: !S.groupOpen[d.k] } }),
  't-more-groups': () => setState({ groupLimit: S.groupLimit + 20 }),
  't-toggle-seg': d => setState({ expanded: { ...S.expanded, [d.k]: !S.expanded[d.k] } }),
  'open-virus': d => { const patch = { selVirus: d.k, compare: false }; if (d.s && S.selSample !== d.s) patch.drawerSample = d.s; else patch.drawerSample = null; setState(patch); },
});
// confidence popover: direct DOM on hover, no re-render
document.addEventListener('mouseover', ev => {
  const w = ev.target.closest('.tier-wrap'); if (!w || w.querySelector('.popover')) return;
  const key = w.dataset.tierKey; const [vid, sample] = key.split('|'); const v = D.vmap[vid]; const d = v && v.det[sample]; if (!d) return;
  w.insertAdjacentHTML('beforeend', VIEWS.table.popoverHtml(d));
});
document.addEventListener('mouseout', ev => {
  const w = ev.target.closest('.tier-wrap'); if (!w) return; if (ev.relatedTarget && w.contains(ev.relatedTarget)) return;
  const p = w.querySelector('.popover'); if (p) p.remove();
});
