/* mgviz report — Overview: the story per sample and per run before any big table. */
VIEWS.overview = {
  render() {
    const N = D.samples.length, many = N > 12, cm = confMin(), sq = seq();
    const q = S.ovQ.trim().toLowerCase();
    const vq = v => !q || v.n.toLowerCase().includes(q) || v.f.toLowerCase().includes(q) || v.g.toLowerCase().includes(q);
    const hit = (v, x) => v.det[x.name] && v.det[x.name].tier >= S.minTier;
    const typesPresent = D.types;
    const ovSamples = (S.selSample ? D.samples.filter(x => x.name === S.selSample) : D.samples);
    // ---- per-sample rows (cards or glance table)
    const sRows = ovSamples.map(x => {
      const sd = D.dets.filter(d => d.sample === x.name && matchV(d.virus)).sort((a, b) => b.rpkmf - a.rpkmf);
      const conf = sd.filter(d => d.tier >= cm), rest = sd.filter(d => d.tier < cm);
      const sMatch = !q || x.name.toLowerCase().includes(q) || x.type.includes(q);
      const vm = q && !sMatch ? conf.filter(d => vq(d.virus)) : [];
      return { x, sd, conf, rest, keep: sMatch || vm.length > 0, vm, frac: x.filtered ? x.mapped / x.filtered : 0 };
    }).filter(r => r.keep);
    // ---- prevalence / shared
    const pv0 = D.viruses.filter(v => matchV(v) && (vq(v) || D.samples.some(x => v.det[x.name] && (x.name.toLowerCase().includes(q) || x.type.includes(q)))))
      .map(v => ({ v, k: D.samples.filter(x => hit(v, x)).length })).filter(e => e.k >= (many ? 1 : 2)).sort((a, b) => b.k - a.k || b.v.tot - a.v.tot);
    const pv = pv0.slice(0, many ? 15 : 14);
    this._export = { sRows, pv0, typesPresent, q };
    // ---- search bar
    let h = `<div class="ov-bar"><div class="ov-search"><input id="in-ovq" data-act="ovq" value="${esc(S.ovQ)}" placeholder="Search samples, sample types or viruses (e.g. stool_S1, nasal, norovirus, Coronaviridae)">${q ? '<button class="x" data-act="ovq-clear" title="Clear search">×</button>' : ''}</div>
      <span class="ov-note">${q ? `${sRows.length} of ${N} samples match` : ''}</span>
      <span class="ov-export">Sample summary <span class="exports" title="Exports all ${sRows.length} rows in the current focus (not only the rows on screen)"><button data-act="ov-ex" data-k="samples" data-f="csv">CSV</button><button data-act="ov-ex" data-k="samples" data-f="tsv">TSV</button><button data-act="ov-ex" data-k="samples" data-f="png">PNG</button></span></span></div>`;
    $('#ov-bar').innerHTML = h;
    // ---- cards / glance
    if (!many) {
      h = `<div class="cards">`;
      sRows.forEach(({ x, sd, conf, rest, vm }) => {
        const top = conf.slice(0, 3);
        const story = conf.length === 0 ? (sd.length ? `No confident call; ${sd.length} weak hit${sd.length > 1 ? 's' : ''} only.` : 'No viruses detected.') : conf.length === 1 ? `${conf[0].virus.n} is the only confident detection.` : `${conf[0].virus.n} dominates; ${conf[1].virus.n}${conf.length > 2 ? ` and ${conf.length - 2} more` : ''} also present.`;
        const qc = [fmt(x.raw) + ' raw', fmt(x.filtered) + ' non-host', fmt(x.mapped) + ' viral reads'];
        h += `<div class="card"><div class="card-head"><button class="card-name" data-act="ov-sample" data-k="${esc(x.name)}">${esc(x.name)}</button><span class="card-type">${esc(x.type)}</span></div>
          <div class="story">${esc(story)}</div>
          <div class="hits"><div class="hits-lbl">Top confident hits · bar = abundance (RPKMF)</div>
          ${top.map(d => `<button class="hit" data-act="open-virus" data-k="${esc(d.virus.id)}" data-s="${esc(x.name)}"><span class="hit-name">${esc(d.virus.n)}</span><span class="hit-row">${pillHtml(d.tier, 'sm')}<span class="hit-bar"><i style="width:${Math.max(3, Math.round(abund(d) * 56))}px"></i><span>${fmtR(d.rpkmf)}</span></span></span></button>`).join('')}
          <div class="more">${(conf.length > 3 ? `+${conf.length - 3} more confident · ` : '') + (rest.length ? `${rest.length} weaker hit${rest.length === 1 ? '' : 's'} hidden` : 'no weaker hits')}</div></div>
          <div class="qc"><div class="qc-text">${qc.join(' → ')}</div><div class="qc-bar"><i class="host" style="width:${x.raw ? (x.filtered / x.raw * 100).toFixed(1) : 0}%"></i><i class="map" style="width:${x.raw ? Math.max(0.8, x.mapped / x.raw * 100).toFixed(2) : 0}%"></i></div></div></div>`;
      });
      if (!sRows.length) h += `<div class="empty">Nothing in the current focus.</div>`;
      h += `</div>`;
    } else {
      const k = S.ovSort;
      const rows = sRows.slice().sort((a, b) => k === 'name' ? a.x.name.localeCompare(b.x.name) : k === 'type' ? (D.types.indexOf(a.x.type) - D.types.indexOf(b.x.type) || a.x.name.localeCompare(b.x.name)) : k === 'hits' ? b.conf.length - a.conf.length : k === 'top' ? ((a.conf[0] ? a.conf[0].virus.n : '~').localeCompare(b.conf[0] ? b.conf[0].virus.n : '~')) : b.frac - a.frac);
      this._export.sRows = rows;
      const mf = Math.max(...rows.map(r => r.frac), 1e-9); const lim = S.ovLimit;
      const cnt = rows.map(r => r.conf.length).sort((a, b) => a - b); const med = cnt.length ? cnt[Math.floor(cnt.length / 2)] : 0; const empty = cnt.filter(c => c === 0).length;
      const story = (q ? `Among the ${rows.length} matching samples, a typical one has ` : `${N} samples in ${typesPresent.length} type${typesPresent.length === 1 ? '' : 's'}. A typical sample has `) + `${med} confident virus${med === 1 ? '' : 'es'}${empty ? `, and ${empty} ${empty === 1 ? 'has' : 'have'} none` : ''}.` + (pv[0] ? ` ${pv[0].v.n} is the most widespread (${pv[0].k} of ${N} samples).` : '');
      const COLS = [['name', 'Sample'], ['type', 'Type'], ['viral', 'Viral reads, % of non-host'], ['hits', 'Confident viruses'], ['top', 'Most abundant virus']];
      h = `<div class="panel glance"><div class="glance-head"><div class="ptitle">Samples at a glance</div><div class="story">${esc(story)}</div></div><div class="glance-tbl"><div class="grow5 ghead">${COLS.map(([kk, l]) => `<button class="${k === kk ? 'on' : ''}" data-act="ov-sort" data-k="${kk}">${l}${k === kk ? ' ▾' : ''}</button>`).join('')}</div>`;
      rows.slice(0, lim).forEach(r => {
        const top = r.vm.length ? r.vm[0] : r.conf[0];
        const top2 = r.vm.length ? `${fmt(r.vm[0].reads)} reads · ${TIERS[r.vm[0].tier]}${r.vm.length > 1 ? ` · +${r.vm.length - 1} matching` : ''}` : r.conf.length > 1 ? `+${r.conf.length - 1} more` : '';
        const pct = r.frac * 100;
        h += `<div class="grow5"><button class="gname" data-act="ov-sample" data-k="${esc(r.x.name)}" title="Open this sample's detections">${esc(r.x.name)}</button><span class="gtype">${esc(r.x.type)}</span>
          <span class="gfrac"><span class="track"><i style="width:${Math.max(1, Math.sqrt(r.frac / mf) * 100).toFixed(1)}%"></i></span><span class="pct">${(pct < 1 ? pct.toFixed(2) : pct.toFixed(1))}%</span><span class="of">of ${fmt(r.x.filtered)}</span></span>
          <span class="ghits">${r.conf.length}</span>
          <span class="gtop">${top ? `<button data-act="open-virus" data-k="${esc(top.virus.id)}" data-s="${esc(r.x.name)}">${esc(top.virus.n)}</button>` : '<button>—</button>'}<span>${esc(top2)}</span></span></div>`;
      });
      if (!rows.length) h += `<div class="empty" style="padding:16px 18px">Nothing in the current focus.</div>`;
      h += `</div>${rows.length > lim ? `<button class="showmore" data-act="ov-more">Show all ${rows.length} samples</button>` : ''}</div>`;
    }
    $('#ov-samples').innerHTML = h;
    // ---- shared / prevalence panel
    const title = many ? 'Most prevalent viruses' : 'Shared across samples';
    let cols, rowsH = '', note;
    if (many) {
      cols = typesPresent.map(ty => ({ label: ty, w: 58 }));
      pv.forEach(({ v, k }) => { rowsH += `<button class="shared-row" data-act="open-virus" data-k="${esc(v.id)}"><span class="vn">${esc(v.n)}</span><span class="prev">${k}/${N}</span><span class="cells">${typesPresent.map(ty => { const L = D.samples.filter(x => x.type === ty); const kk = L.filter(x => hit(v, x)).length; const f = kk / L.length; const bg = kk ? sq(Math.max(.1, f)) : null; return `<span class="cell" style="width:58px;background:${bg || 'var(--line2)'};color:${bg ? inkOn(bg) : 'var(--muted)'}" title="${esc(ty)}: detected in ${kk} of ${L.length} samples">${kk ? Math.round(f * 100) + '%' : ''}</span>`; }).join('')}</span></button>`; });
      note = pv.length ? 'samples = detected in · cell = % of samples of that type' : 'No detections in the current focus.';
    } else {
      cols = D.samples.map(x => ({ label: x.name, w: 52 }));
      pv.forEach(({ v, k }) => { rowsH += `<button class="shared-row" data-act="open-virus" data-k="${esc(v.id)}"><span class="vn">${esc(v.n)}</span><span class="prev">${k}/${N}</span><span class="cells">${D.samples.map(x => { const d = v.det[x.name]; const bg = d ? sq(Math.max(.1, abund(d))) : null; return `<span class="cell" style="width:52px;background:${bg || 'var(--line2)'};color:${bg ? inkOn(bg) : 'var(--muted)'}" title="${esc(x.name)}: ${d ? fmt(d.reads) + ' reads, ' + TIERS[d.tier] : 'not detected'}">${d ? fmt(d.reads) : ''}</span>`; }).join('')}</span></button>`; });
      note = pv.length ? 'colour = abundance · number = reads · blank = not detected' : (N > 1 ? 'No virus is shared between samples.' : 'No virus is shared between samples.');
    }
    $('#ov-shared').innerHTML = `<div class="panel pad" style="min-width:0"><div class="shared-head"><div class="ptitle">${title}</div><div class="right"><div class="shared-note">${note}</div><span class="exports" title="Exports all ${pv0.length} rows in the current focus (not only the rows on screen)"><button data-act="ov-ex" data-k="prev" data-f="csv">CSV</button><button data-act="ov-ex" data-k="prev" data-f="tsv">TSV</button><button data-act="ov-ex" data-k="prev" data-f="png">PNG</button></span></div></div>
      <div style="overflow-x:auto"><div class="shared-cols"><span></span><span>found in</span><div class="cells">${cols.map(c => `<span style="width:${c.w}px">${esc(c.label)}</span>`).join('')}</div></div>${rowsH}</div></div>`;
    const inp = $('#in-ovq'); if (inp && this._focusQ) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); this._focusQ = false; }
  },
  // exports: every row in the current focus
  sampleRows() {
    const { sRows } = this._export; const r = [['sample', 'type', 'raw_reads', 'non_host_reads', 'viral_reads', 'viral_pct_of_non_host', 'confident_viruses', 'weaker_calls', 'most_abundant_virus', 'most_abundant_rpkmf']];
    sRows.forEach(({ x, sd, conf }) => r.push([x.name, x.type, x.raw, x.filtered, x.mapped, x.filtered ? (x.mapped / x.filtered * 100).toFixed(3) : '', conf.length, sd.length - conf.length, conf[0] ? conf[0].virus.n : '', conf[0] ? conf[0].rpkmf.toFixed(2) : '']));
    return r;
  },
  prevRows() {
    const { pv0, typesPresent } = this._export; const N = D.samples.length; const hit = (v, x) => v.det[x.name] && v.det[x.name].tier >= S.minTier;
    const r = [['virus', 'family', 'genus', 'samples_detected', 'samples_total', 'prevalence_pct', ...typesPresent.map(ty => ty + '_pct'), 'total_reads']];
    pv0.forEach(({ v, k }) => r.push([v.n, v.f, v.g, k, N, (k / N * 100).toFixed(1), ...typesPresent.map(ty => { const L = D.samples.filter(x => x.type === ty); return (L.filter(x => hit(v, x)).length / L.length * 100).toFixed(1); }), v.tot]));
    return r;
  },
  png(kind) {
    const t = tv(), sq = seq(), N = D.samples.length, many = N > 12;
    if (kind === 'samples') {
      const rows = this.sampleRows().slice(1); const mf = Math.max(...this._export.sRows.map(r => r.frac), 1e-9);
      const cols = [{ label: 'Sample', w: 150 }, { label: 'Type', w: 90 }, { label: 'Viral reads, % of non-host', w: 250 }, { label: 'Confident viruses', w: 130 }, { label: 'Most abundant virus', w: 260 }];
      const body = this._export.sRows.map(r => { const p = r.frac * 100; return [{ text: r.x.name, bold: true, mono: true }, { text: r.x.type, muted: true }, { bar: Math.sqrt(r.frac / mf) * 100, text: (p < 1 ? p.toFixed(2) : p.toFixed(1)) + '% of ' + fmt(r.x.filtered) }, { text: String(r.conf.length), mono: true }, { text: r.conf[0] ? r.conf[0].virus.n + (r.conf.length > 1 ? ` +${r.conf.length - 1} more` : '') : '—' }]; });
      EXPORT.svgEl(EXPORT.tableSvg('Samples at a glance', `${rows.length} samples`, cols, body), 'mgviz_sample_summary' + focusTag(), 'png', 2);
    } else {
      const { pv0, typesPresent } = this._export; const hit = (v, x) => v.det[x.name] && v.det[x.name].tier >= S.minTier;
      const cols = [{ label: 'Virus', w: 200 }, { label: 'found in', w: 76 }, ...(many ? typesPresent.map(ty => ({ label: ty, w: 58 })) : D.samples.map(x => ({ label: x.name, w: 52 })))];
      const body = pv0.map(({ v, k }) => [{ text: v.n }, { text: `${k}/${N}`, mono: true }, ...(many ? typesPresent.map(ty => { const L = D.samples.filter(x => x.type === ty); const kk = L.filter(x => hit(v, x)).length; const f = kk / L.length; const bg = kk ? sq(Math.max(.1, f)) : t.line2; return { text: kk ? Math.round(f * 100) + '%' : '', bg, fg: kk ? inkOn(bg) : t.muted }; }) : D.samples.map(x => { const d = v.det[x.name]; const bg = d ? sq(Math.max(.1, abund(d))) : t.line2; return { text: d ? fmt(d.reads) : '', bg, fg: d ? inkOn(bg) : t.muted }; }))]);
      EXPORT.svgEl(EXPORT.tableSvg(many ? 'Most prevalent viruses' : 'Shared across samples', many ? 'samples = detected in · cell = % of samples of that type' : 'colour = abundance · number = reads · blank = not detected', cols, body), (many ? 'mgviz_virus_prevalence' : 'mgviz_shared_viruses') + focusTag(), 'png', 2);
    }
  },
};
Object.assign(ACTIONS, {
  'ovq-clear': () => setState({ ovQ: '', ovLimit: 20 }),
  'ov-sample': d => setState({ selSample: d.k, tab: 'table' }),
  'ov-sort': d => setState({ ovSort: d.k }),
  'ov-more': () => setState({ ovLimit: 1e9 }),
  'ov-ex': d => { const V = VIEWS.overview; if (d.f === 'png') V.png(d.k); else EXPORT.rows(d.k === 'samples' ? V.sampleRows() : V.prevRows(), (d.k === 'samples' ? 'mgviz_sample_summary' : (D.samples.length > 12 ? 'mgviz_virus_prevalence' : 'mgviz_shared_viruses')) + focusTag(), d.f); },
});
INPUTS.ovq = v => { VIEWS.overview._focusQ = true; setState({ ovQ: v, ovLimit: 20 }); };
