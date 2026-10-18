/* mgviz report — exports: CSV/TSV tables, SVG/PNG figures. All rows in the current focus, never only the visible ones. */
const EXPORT = {
  download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },
  rows(rows, name, kind) {
    if (kind === 'csv') {
      const escCsv = v => { const x = v == null ? '' : String(v); return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
      const txt = '﻿' + rows.map(r => r.map(escCsv).join(',')).join('\r\n');
      this.download(new Blob([txt], { type: 'text/csv;charset=utf-8' }), name + '.csv');
    } else {
      const clean = v => (v == null ? '' : String(v)).replace(/[\t\r\n]+/g, ' ');
      const txt = rows.map(r => r.map(clean).join('\t')).join('\n');
      this.download(new Blob([txt], { type: 'text/tab-separated-values;charset=utf-8' }), name + '.tsv');
    }
  },
  detectionRows(dets) {
    const r = [['sample', 'virus', 'family', 'genus', 'species', 'accession', 'segments', 'length', 'reads', 'rpkmf', 'pct_covered', 'mean_depth', 'read_identity', 'consensus_identity', 'pi', 'genomad_score', 'hallmarks', 'confidence', 'taxonomy_adjusted']];
    dets.forEach(d => { const v = d.virus; r.push([d.sample, v.n, v.f, v.g, v.sp, v.acc, v.segs.length, d.len, d.reads, d.rpkmf.toFixed(3), d.pct, d.meanCov.toFixed(2), d.rid.toFixed(2), d.cid == null ? '' : d.cid.toFixed(2), d.pi == null ? '' : d.pi, d.gv == null ? '' : d.gv.toFixed(3), d.hall, TIERS[d.tier], d.adj]); });
    return r;
  },
  detectionsTsv() { this.rows(this.detectionRows(filteredDets()), 'mgviz_detections' + focusTag(), 'tsv'); },
  svgString(svg) {
    const c = svg.cloneNode(true); c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    if (!c.getAttribute('font-family')) c.setAttribute('font-family', '-apple-system, "Segoe UI", system-ui, Helvetica, sans-serif');
    if (!c.getAttribute('width')) { const vb = (c.getAttribute('viewBox') || '0 0 800 600').split(/[\s,]+/); c.setAttribute('width', vb[2]); c.setAttribute('height', vb[3]); }
    return new XMLSerializer().serializeToString(c);
  },
  stack(svgs) {
    // several SVG panels into one, stacked vertically, with the panel background
    const t = tv(); const ns = 'http://www.w3.org/2000/svg';
    const dims = svgs.map(s => { const vb = (s.getAttribute('viewBox') || `0 0 ${s.clientWidth || 800} ${s.clientHeight || 600}`).split(/[\s,]+/).map(Number); return { w: vb[2], h: vb[3] }; });
    const W = Math.max(...dims.map(d => d.w)), H = dims.reduce((a, d) => a + d.h + 16, 0);
    const out = document.createElementNS(ns, 'svg'); out.setAttribute('viewBox', `0 0 ${W} ${H}`); out.setAttribute('width', W); out.setAttribute('height', H);
    const bg = document.createElementNS(ns, 'rect'); bg.setAttribute('width', W); bg.setAttribute('height', H); bg.setAttribute('fill', t.bg); out.appendChild(bg);
    let y = 0; svgs.forEach((s, i) => { const g = document.createElementNS(ns, 'g'); g.setAttribute('transform', `translate(0,${y})`); Array.from(s.cloneNode(true).childNodes).forEach(n => g.appendChild(n)); out.appendChild(g); y += dims[i].h + 16; });
    return out;
  },
  fig(container, name, kind, scale) {
    if (!container) return; const svgs = $$('svg.fig-svg', container); if (!svgs.length) return;
    const svg = svgs.length === 1 ? svgs[0] : this.stack(svgs);
    this.svgEl(svg, name, kind, scale);
  },
  svgEl(svg, name, kind, scale) {
    const str = this.svgString(svg);
    if (kind === 'svg') { this.download(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }), name + '.svg'); return; }
    const vb = (svg.getAttribute('viewBox') || `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`).split(/[\s,]+/).map(Number);
    const k = scale || 3, w = vb[2], h = vb[3]; const img = new Image();
    // a data URI never taints the canvas (a blob: URL does on file:// pages)
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k); const ctx = cv.getContext('2d');
      ctx.fillStyle = tv().bg; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(b => { if (b) this.download(b, name + '.png'); else console.error('PNG export failed: canvas could not be read'); }, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  },
  // export-only SVG table (for Overview panels): cols = [{label, w, align}], rows = [[cell…]], cell = string | {text, bg, fg, bar}
  tableSvg(title, sub, cols, rows, opts) {
    const t = tv(); const ns = 'http://www.w3.org/2000/svg'; const o = Object.assign({ rowH: 22, pad: 18, font: 11.5 }, opts || {});
    const W = o.pad * 2 + cols.reduce((a, c) => a + c.w + 14, -14); const H = o.pad * 2 + 44 + (sub ? 20 : 0) + 24 + rows.length * o.rowH;
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('class', 'fig-svg'); svg.setAttribute('font-family', '-apple-system, "Segoe UI", system-ui, Helvetica, sans-serif');
    const add = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); if (text != null) e.textContent = text; svg.appendChild(e); return e; };
    add('rect', { width: W, height: H, fill: t.bg });
    let y = o.pad + 16; add('text', { x: o.pad, y, 'font-size': 14, 'font-weight': 600, fill: t.fg }, title);
    if (sub) { y += 20; add('text', { x: o.pad, y, 'font-size': 11, fill: t.muted }, sub); }
    y += 24; let x = o.pad;
    cols.forEach(c => { add('text', { x: c.align === 'right' ? x + c.w : x, y, 'font-size': 10, fill: t.muted, 'text-anchor': c.align === 'right' ? 'end' : 'start', 'letter-spacing': '.05em' }, String(c.label).toUpperCase()); x += c.w + 14; });
    add('line', { x1: o.pad, x2: W - o.pad, y1: y + 6, y2: y + 6, stroke: t.line });
    y += 8;
    rows.forEach(r => {
      let cx = o.pad; const cy = y + o.rowH / 2;
      r.forEach((cell, i) => {
        const c = cols[i]; const v = typeof cell === 'object' && cell ? cell : { text: cell };
        if (v.bg) { add('rect', { x: cx, y: cy - 8, width: c.w, height: 16, rx: 3, fill: v.bg }); add('text', { x: cx + c.w / 2, y: cy + 3.5, 'font-size': 9.5, 'text-anchor': 'middle', fill: v.fg || t.fg, 'font-family': 'ui-monospace, Menlo, monospace' }, v.text || ''); }
        else if (v.bar != null) { add('rect', { x: cx, y: cy - 3, width: 100, height: 6, rx: 3, fill: t.line2 }); add('rect', { x: cx, y: cy - 3, width: Math.max(1, v.bar), height: 6, rx: 3, fill: t.fg, opacity: .7 }); add('text', { x: cx + 108, y: cy + 3.5, 'font-size': o.font, fill: t.fg, 'font-family': 'ui-monospace, Menlo, monospace' }, v.text || ''); }
        else add('text', { x: c.align === 'right' ? cx + c.w : cx, y: cy + 4, 'font-size': o.font, fill: v.muted ? t.muted : t.fg, 'text-anchor': c.align === 'right' ? 'end' : 'start', 'font-weight': v.bold ? 600 : 400, 'font-family': v.mono ? 'ui-monospace, Menlo, monospace' : null }, v.text == null ? '' : String(v.text));
        cx += c.w + 14;
      });
      y += o.rowH; add('line', { x1: o.pad, x2: W - o.pad, y1: y, y2: y, stroke: t.line2 });
    });
    return svg;
  },
};
