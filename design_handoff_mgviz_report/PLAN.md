# Implementation plan: mgviz report redesign

Written 2026-10-18 after reading `README.md`, `ORIGINAL_BRIEF.md` §6–7, `CLAUDE_CODE_PROMPT.md`, all 25 screenshots, the prototype template (lines 9–448 of `reference/mgviz Report v2.dc.html`) and targeted parts of its logic class, plus the current `src/mgviz/{bundle,loader,render,palettes,synthetic}.py` and `templates/report.{html,css,js}`.

## 1. What exists today

| Piece | Now | After |
|---|---|---|
| `render.py` | Replaces 5 placeholders in `report.html` (title, CSS, d3, JSON, JS). | Unchanged mechanism. One HTML, one CSS, one JS, d3 inlined. |
| `report.html` (119 lines) | Stat tiles, 3 tabs, global filter bar, table, tree, heatmap, tooltip. | Rewritten shell: header, 236px focus panel, 4 tabs, per-view toolbars, view containers, drawer + scrim, two tooltips, hidden export `<canvas>`. No global filter bar. |
| `report.css` (195 lines) | Palette vars on `.viz-root`, old components. | Rewritten from the README tokens (light `:root`, dark `[data-theme=dark]` + `prefers-color-scheme`), type scale, spacing, the two shadows, every component class. |
| `report.js` (756 lines) | Table + sparklines, radial/rectangular tree with rings, heatmap, palette picker. | Rewritten (~4–5k lines, one file): `derive()` → shared focus state → one `render<View>()` per tab + figure drawers (`drawTree`, `drawRadial`, `drawComp`, `drawHeat`, `drawGenome`) + `hl*()` hover passes + export module. Only the sparkline, symlog depth scale and tree-folding code survive, reworked. |
| `bundle.py` | contigs with cov[100], orfs, gv_*, taxonomy; per-sample readstats dict; assemblies; tax. | Adds the per-sample and meta fields listed in §2. Contig/assembly shapes stay. |
| `synthetic.py` | 4-sample demo, fixed names. | Gains `--samples N` with typed names (`stool_S01`, `nasal_N01`, `wastewater_W01`, `clinical_C01`), type-dependent virus mixes, read-attrition stats, segmented viruses, rare `adj`/low-geNomad cases, so a 100-sample fixture exists for side-by-side checks. Lives in Python only; the report JS never contains demo data. |
| `palettes.py` / `ltc_palettes.json` | 32 ltc palettes (3–10 colours each) + a 3-step mgviz blue. | Family palettes come from ltc; see §3.6. |

## 2. Data: what §7 promises vs what the bundle has

Present and usable as-is: `sample, accession, name, description, segment, assembly, length, covered, pct_covered, mean_cov, cov[100], reads, rpkmf, read_id, cons_id, pi, 8 ranks, adj, orfs[], gv_score, gv_tax, gv_hallmarks, consensus_n_frac`, per-sample `filtered_reads`, `readstats`, `params`.

Missing or different, and how I will handle each:

| Needed by the spec | Status | Plan |
|---|---|---|
| **Sample type** (stool / nasal / wastewater / clinical) drives the left panel groups, per-type tracks, type strip, prevalence by type, "Samples at a glance" | Not in any EsViritu file or in our samplesheet (`sample,fastq_1,fastq_2`). | Add an optional `type` column to the samplesheet; `MGVIZ_REPORT` passes it as a small `samples.tsv`; `mgviz report --samples samples.tsv`. Fallback when absent: infer from the name prefix before `_` if it is one of the four known types, else the single type `sample`. Views degrade per the README's one-type rules (no type strip, no type grouping). **Decision 1 below.** |
| **run_id** (header kicker) | Not in bundle. | `--run-id` on the CLI; Nextflow passes `workflow.runName`; default = project directory name. |
| **Raw → non-host → viral reads** (QC funnel, subline "non-host reads") | readstats YAML has `reads pre-quality filter` (raw), `reads pre-host removal`, `reads for EsViritu denominator` (non-host). Keys are absent when trimming or host filtering was skipped. | bundle: `raw = first present of [pre-quality, pre-host, denominator]`, `nonhost = denominator`, `viral = Σ reads over the sample's detections`. Funnel text drops a stage that is unknown rather than showing 0. |
| **EsViritu DB version** (subline) | Not recorded; params YAML has only the EsViritu `version`. | Pipeline: `tables.py` writes `db_version` (from the DB directory name) into the params YAML. Report: show "EsViritu DB v…" only when known; always show `mgviz {version}`. |
| **realm** rank (drawer chips, tree tooltip) | Not available; `kingdom` is `Viruses` for every record. `order`, `phylum`, `tclass` exist. | Chips: order › family › genus › species (realm omitted). Tooltip rank rows: order, family, genus, species, strain. Listed as a deviation. |
| **ORF names / "gene" in segment rows** | pyrodigal-gv gives coordinates only; segment label comes from EsViritu's `Segment`. | ORFs labelled `ORF1…n` in genome plots; segment rows show the segment label and accession and no separate gene column. Deviation. |
| **CHECK SOURCE** needs a host-range table | None exists. | **Decision 2 below.** |
| **gv_score** can be null (geNomad step optional) | High requires `gv ≥ 0.8`. | **Decision 3 below.** |
| **Confidence tier, prevalence, flags, abundance scale, clustering** | Derived. | Computed in `derive()` in JS from the embedded data, exactly as README §"Derived data". README thresholds win over the prototype where they differ (LOW GENOMAD: README `pct ≥ 60 and gv < 0.6`; prototype used `tier ≥ 2 and gv < 0.8`). |

Per-detection record in JS = one contig row; assemblies (segmented viruses) are grouped by `assembly` into one virus row with nested segments, aggregating reads, RPKMF, covered bases over segments (length-weighted `pct_covered`, mean `read_id`/`cons_id`, min `gv_score`? → I will use the **exemplar segment's** values for identity/geNomad and sums for reads/length/covered, as EsViritu's assembly_summary does).

## 3. Mapping the spec onto the files

### 3.1 Shell and tokens (step 1)
- `report.css`: `:root` light tokens; `@media (prefers-color-scheme: dark) :root:not([data-theme=light])` and `:root[data-theme=dark]` dark tokens; `--sans/--serif/--mono`; classes for header, aside, list rows, segmented controls, tabs, toolbars, pills, badges, cards, grid tables, drawer, tooltips, popover. Figures read token values via `getComputedStyle` once per draw (SVG needs literal colours for export).
- Theme: follows the OS by default; a small "Theme" text action in the header (right of the export button) toggles and remembers in `localStorage` (`mgviz.theme`). The README has no toggle; **Decision 4.**
- `report.html`: static skeleton only; all dynamic content is built by JS.

### 3.2 Derived data and state (step 1)
- `derive()` runs once: samples (type, raw/nonhost/viral, confident counts), viruses (grouped assemblies, per-sample detections, `nS`, totals, family), families ordered by reads, tiers, flags, max RPKMF/reads.
- `state.focus = {selSample, selFamily, search, minTier}`; `state.view = {tab, treeLayout, treeValue, treeCols, collapsed, treeRot, treeTool, zoomFam, zoomT, compTop, compSort, heatTop, heatCols, groupBy, groupLimit, groupOpen, expanded, sortKey, sortDir, flagOnly, sharedOnly, ovQ, ovSort, ovLimit, selVirus, compare, famColors, paletteSel, theme}`.
- `render()` rebuilds the focus panel, tab header and the active view's DOM. Figures redraw only when a structural input changes (a signature string per figure); hover is `hl*()` opacity-only, cleared on `mouseleave` of the SVG.

### 3.3 Views (steps 2–8, README order)
1. **Detections**: grouped grid table, group paging (20 groups, 8/5 rows), sort, segment sub-rows, confidence popover, flag badges, sparkline 170×36 (symlog, step, separators), TSV with the 19 spec columns.
2. **Overview**: search + count, cards (≤ 12) or "Samples at a glance" (> 12) with sort and 20-row paging, story sentences, QC funnel, Shared / Most prevalent panel (per-sample reads cells or per-type % cells), CSV/TSV/PNG per panel (export-only SVG drawn with d3, rasterised at 2×).
3. **Samples × taxa**: UPGMA (Lance–Williams average, Float64 distance matrix) on `log10(rpkmf+1)`, dendrograms, type strip or type brackets, fitted cell sizes, in-cell values with luminance-based ink, totals, hover crosshair, click → drawer / focus sample, SVG/PNG/TSV.
4. **Tree**: folded model (root → family → optional genus → virus), collapse wedges, family bands + halo labels, left margin from longest label, tips by √reads, sample/type columns with rotated labels and growing SVG width.
5. **Radial**: square viewBox, rank guide circles, clade sectors, arc+radial branches, upright labels by normalised angle, bar rings with gap and halo'd ring names, outer family arcs with textPath labels (reversed on the lower half), rotate/pan/zoom-to-area tools, ±15° buttons, slider, focus-on-family (rotate to 3 o'clock + zoom to clade, 450 ms).
6. **Composition**: icicle (family → genus → virus) + 100% stacked bars with family-first sorting; Samples shown / Sort by controls.
7. **Family colours panel**: palette chips (§3.6), per-family swatch popover, hex input validation, `localStorage` `mgviz.colors`.
8. **Genome drawer**: scrim, slide-in, lineage chips, "Detected in" chips, stat tiles, geNomad strip, per-segment small multiples (symlog, step area, zero-coverage ticks, ORF arrows above/below midline, dashed partial), compare mode, SVG/PNG (stacked SVGs).
9. **Exports**: `svgString()` with xmlns and literal colours; PNG at 3× (figures) / 2× (panels) on canvas filled with `--panel`; CSV (BOM, CRLF, RFC-4180) / TSV (tabs and newlines in cells → spaces); file names encode the focus; exports take every row in focus.
10. **Dark pass**: check every screen against the dark screenshots; palette colours `brighter(0.7)`; grey-family labels in `--muted`.

### 3.4 The seven prototype traps
1. Ramp: `seq(t)` is a plain function using the README hex pairs and `d3.interpolateRgb.gamma(1.8)` created lazily; d3 is inlined before the data and JS, so it is always loaded, and the function still has a non-d3 linear fallback that never returns the maximum for `t = 0`.
2. In-cell ink from WCAG luminance of the cell colour (`Y > 0.32` → dark).
3. Hover = opacity-only passes with `mouseleave` reset on the SVG; no state change on hover.
4. Tree left margin measured from the longest family label with `getComputedTextLength` (fallback 0.6 em/char); column block width added to the SVG width; column title right-aligned to the left of the first column.
5. Chevrons: 12px, `--fg`, fixed 12px box.
6. Export functions take the full filtered set, never the paged slice; button titles state the row count.
7. Radial label flip uses `((angle + rot) mod 2π)` normalised to `[0, 2π)` before testing the left half.

### 3.5 Scaling and edge states
Implemented as README's table: cards vs glance table at 12; per-type tracks above 40 (tree) / 12 (radial); heatmap top 50 above 60 with cells down to 6px; composition 30; families collapsed above 130 tips; 1-sample run (no column dendrogram, "No virus is shared between samples.", no Compare); empty focus messages word for word.

### 3.6 Palettes (ltc)
- Family palette chips = `mgviz` (the 8 README defaults) + every ltc palette with ≥ 6 colours, in collection order; a palette with fewer than 8 colours leaves the remaining families grey until the user assigns a colour (README's grey rule). Dark theme brightens by 0.7.
- The sequential abundance ramp stays the README's fixed pair per theme (it encodes magnitude; the ltc collection has no validated sequential ramps).
- The old "Palette" select is removed; palette choice lives in the Family colours panel as specified.

## 4. Pipeline and CLI touches (small)
- `pipeline/assets/samplesheet.example.csv` + `main.nf`: optional `type` column, carried to `MGVIZ_REPORT`.
- `modules/mgviz_report.nf`: pass `--samples samples.tsv --run-id ${workflow.runName}`.
- `pipeline/tables.py`: write `db_version` into the params YAML.
- `cli.py`: `report --samples`, `--run-id`; `demo --samples N`.
- Tests: extend `tests/test_pipeline.py` with a derive-level check in Python? No: derivation lives in JS. Instead a Playwright smoke test (optional, local only) that opens the 4- and 100-sample demos, switches every tab and layout, and checks for console errors. Pytest keeps covering loader/bundle/render.

## 5. Build order and checks
README order: tokens + shell → Detections → Overview → Samples × taxa → Tree → Radial → Composition → Drawer → exports → dark pass. After each step: regenerate `demo` at 4 and 100 samples, screenshot with headless Chrome at 900×540 and compare with the matching screenshot(s); fix before moving on. Firefox and Safari checks at the end (manual, since only Chrome is installed for automation).

## 6. Decisions needed before coding

1. **Sample type**: accept the samplesheet `type` column + name-prefix fallback described above? Or only the column (no inference)?
2. **CHECK SOURCE**: no host-range table exists. Options: (a) ship a small curated table in `mgviz/static/host_range.json` (family/genus/name keywords → host group: porcine, bovine, avian, plant, …; flag when host ≠ human and sample type is stool/nasal/clinical); (b) implement the flag plumbing but leave the table empty so it never fires until you supply one. I recommend (a) with a short starter list that you review.
3. **Missing geNomad** (step not run → `gv_score` null for every call): treat the geNomad check as "not run" so High needs only the other three checks, with the popover saying "geNomad not run"? Or cap such runs at Medium? I recommend the first.
4. **Theme toggle**: OK to add a small "Theme" text action in the header? The README specifies no control; without one the report only follows the OS setting.
5. **JS file size**: one `report.js` of roughly 4–5k lines keeps the "one JS file" rule. Acceptable, or may I split into a few files concatenated by `render.py` (still no build step)?
6. **Realm / ORF names**: confirm the two deviations in §2 (order replaces realm; ORFs numbered) are acceptable, or tell me where the data should come from.
