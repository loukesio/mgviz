# Handoff: mgviz report redesign

## Overview
mgviz is the HTML report of a metagenomic virus-detection pipeline (EsViritu-style mapping → consensus → taxonomy → ORFs → geNomad). This package specifies the redesigned report: a landing **Overview**, a grouped **Detections** table, a **Taxonomy** view (rectangular tree, radial publication figure, composition), a clustered **Samples × taxa** heatmap, and a **genome drawer**. They share one focus model and every view can be exported.

Design goal (from the brief): *within ten seconds a virologist knows which viruses are in which samples and how much to trust each call, can drill into any genome, and can take any view out as a publication figure.*

Design principle agreed with the product owner: **every colour, bar and number must answer a question.** If an encoding repeats a number shown next to it, or has no legend, delete it. Several decisions below exist only because of this rule; please keep to it.

## About the design files
The files in `reference/` are **design references built in HTML**: working prototypes that show the intended look and behaviour. They are not production code to ship. They run on a prototyping runtime (`support.js`, templating with `{{ }}` holes, a `DCLogic` class) that is **not** part of mgviz.

Your task is to **rebuild this design inside the mgviz report environment**, which has these hard constraints (`ORIGINAL_BRIEF.md` §6):
- Single self-contained HTML file that opens offline from `file://`.
- Assembled by Python from one HTML template, one CSS file and one JS file. No build step.
- **d3 v7 vendored and inlined. No other libraries, no CDN, no web fonts from the network.**
- Data embedded as JSON (see `ORIGINAL_BRIEF.md` §7 for the fields).
- Current Chrome, Firefox and Safari; 1 sample / 3 genomes up to 100+ samples / 500 genomes.

Two prototype shortcuts must **not** be copied:
1. The prototype loads d3 and `html-to-image` from jsDelivr. In production, inline vendored d3 and **drop html-to-image**. For PNG export of HTML panels (Overview tables), render the panel as SVG (preferred: draw those tables with d3 into an `<svg>` used only for export), then rasterise with the same canvas path as the figures.
2. All demo data is **synthetic**, from `genData()` in the logic section. Delete it and read the embedded JSON. The *shape* of the derived fields (tiers, prevalence, flags) is specified below and must be computed from the real data.

To view the references: open `reference/mgviz Report v2.dc.html` (4 samples) or `reference/mgviz Report v2 - 100 samples.dc.html` (100 samples, 22 families, ~108 viruses) in Chrome with `support.js` beside them. An internet connection is needed for the CDN scripts.

## Fidelity
**High fidelity.** Colours, type, spacing, copy and interactions are final. Recreate them exactly. Every number in this README was taken from the reference source. Where this README and the reference disagree, the README wins. Report any disagreement.

---

## Global layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ HEADER  padding 20px 28px 16px · border-bottom 1px --line                   │
├──────────────┬──────────────────────────────────────────────────────────────┤
│ FOCUS PANEL  │  TABS (Overview · Detections · Taxonomy · Samples × taxa)    │
│ 236px fixed  │  tab description + "Focus: …" line                           │
│ sticky top:0 │  ─────────────────────────────────────────                   │
│ max-h 100vh  │  ACTIVE VIEW (padding 4px 28px 60px)                         │
│ scroll-y     │                                                              │
└──────────────┴──────────────────────────────────────────────────────────────┘
                                              GENOME DRAWER (fixed right, 620px)
```

- Page background `--bg`. Panels and cards: background `--panel`, `1px solid --line`, `border-radius 10px`.
- Base text 13px / 1.45, `--sans`.
- **Left = what you look at (scope). Top = how you look at it (view).** Changing tab never changes scope. View-specific controls live in a toolbar inside each view, never in a global bar.

### Header
- Kicker: 11px, uppercase, letter-spacing .08em, weight 600, `--muted`. Text: `mgviz · run <run_id> · generated <YYYY-MM-DD>`.
- Headline: `--serif` 26px / 1.1, weight 600, letter-spacing −.01em. Text: `{N viruses} viruses across {S} sample(s)`.
- Subline: 13px `--muted`. Text: `{detections} detections, {high} high-confidence · {families} families · {non-host reads} non-host reads · EsViritu DB v{x} · mgviz {version}`.
- Right: button "Export detections (TSV)": padding 7px 12px, 1px `--line`, radius 6px, `--panel`, 12px weight 500. Hover changes the border to `--fg`.

### Focus panel (left, 236px)
Padding 18px 14px 40px 20px; sections stacked with a 22px gap; `border-right 1px --line`.

Section heading style (used throughout): 11px, uppercase, letter-spacing .06em, weight 600, `--muted`, padding 0 8px.

1. **Find a virus.** Text input: padding 6px 9px, 1px `--line`, radius 6px, `--panel`, 12px. Placeholder "Name, family, accession". Matches virus name, family, genus and accession (case-insensitive substring).
2. **Samples** (collapsible).
   - Header row is a button: chevron ▾/▸ (12px, full `--fg` ink, **must be clearly visible**), "SAMPLES", and a right-hand note: "confident hits" when expanded, "{S} in {T} types" when collapsed.
   - "All samples" row with the count of distinct confident viruses.
   - If S > 12, a "Filter samples" input.
   - Then one sub-group per sample type (stool, nasal, wastewater, clinical, in that order). Each sub-group has its own ▾/▸ toggle and count; rows are indented by 24px. Each row shows the sample name (`--mono` 11.5px) and its number of confident calls (≥ Medium, or ≥ the minimum confidence if that is higher).
   - Default: the panel is expanded when S ≤ 12 and collapsed when S > 12. Type groups are collapsed when S > 12, unless a filter is active or the selected sample is inside them.
   - When collapsed with a sample selected, show only that sample as a chip with ×.
3. **Families** (collapsible). "All families" row, then the 5 families with most reads ("top 5 of 22" in the header) plus the selected family, and a "Show all 22 families" link (`--accent`, 11.5px).
4. **Minimum confidence.** A 4-segment control (Trace · Low · Medium · High). The active segment is `--fg` background with `--panel` text. Below it, one sentence of rule text:
   - Trace: "Showing every call, including trace hits (< 10 reads)."
   - Low: "Hiding trace hits. Low = at least 10 reads."
   - Medium: "Medium and up: ≥ 40% of the genome covered and ≥ 50 reads."
   - High: "High only: ≥ 80% covered, ≥ 500 reads, ≥ 90% read identity, geNomad ≥ 0.8."
5. **Clear focus** link (`--accent`, underlined, 12px), shown only when something is set.

List rows: padding 4–5px 8px, radius 5px, hover `--hi`, selected `--sel` + weight 600. Counts use `font-variant-numeric: tabular-nums`, `--muted`.

### Tabs
Flex with a 28px gap. Each tab: padding 14px 0 11px, 15px. Active: weight 600, `--fg`, 2px `--fg` bottom border. Inactive: weight 400, `--muted`. Hover changes the colour to `--fg`.

Labels: `Overview`, `Detections`, `Taxonomy`, `Samples × taxa`.

Under the tabs there is a row (margin 12px 0 18px): the description of the active tab (13px `--muted`) and, on the right, `Focus: all samples · <family> · ≥ <tier> · "<search>"` (11.5px `--mono`).

Exact descriptions:
- **Overview:** "What was found in each sample, how confident each call is, and what to double-check."
- **Detections:** "Every call with the evidence behind it. Hover a confidence label to see why it got that rating; click a virus to open its genome."
- **Taxonomy:** depends on the layout (see the reference source, `treeDesc`).
- **Samples × taxa:** "Which samples share which viruses. Rows and columns are clustered so similar samples and co-occurring viruses sit together."

---

## Design tokens

### Colour roles (light / dark)
| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#f5f4ef` | `#131615` | page |
| `--panel` | `#ffffff` | `#1b1f1d` | cards, panels, SVG background |
| `--fg` | `#1c201e` | `#e4e6e0` | ink; also High pill fill, active segmented control |
| `--muted` | `#636a66` | `#99a19b` | secondary text |
| `--line` | `#d9dcd4` | `#2e3431` | borders |
| `--line2` | `#eceee7` | `#242927` | row separators, empty bar tracks, absent cells |
| `--accent` | `#1f5f8b` | `#8ec0e4` | links / text actions only |
| `--hi` | `rgba(28,32,30,.04)` | `rgba(228,230,224,.05)` | hover |
| `--sel` | `rgba(28,32,30,.08)` | `rgba(228,230,224,.11)` | selected |
| `--abund` | `#2b5d86` | `#8ec0e4` | abundance bars (the only blue bar) |
| `--attn` | `#a84f2b` | `#f0957a` | warnings only (DIVERGENT, failed checks, flags) |
| SVG faint | `#eef0ea` | `#242927` | grid lines |
| SVG absent | `#f0f1ec` | `#222725` | "not detected" cell |
| grey (unpaletted family) | `#a3a8a4` | `#6b7370` | |
| ink (genome coverage) | `#3b4440` | `#c9cdc6` | |

**Sequential abundance ramp:** light `#dde6ee` → `#0e3a62`; dark `#263645` → `#a9d6ff`.
- Interpolate in RGB with gamma 1.8, i.e. `d3.interpolateRgb.gamma(1.8)`.
- Clamp the input to [0,1] and floor it at 0.08–0.1 so that any detected cell is visibly different from an absent one.
- **Implement this ramp so it works before d3 has loaded.** A prototype bug made every cell one colour because the ramp fell back to its maximum.

**Text on ramp cells:** choose dark (`#1c201e`) or white per cell from the WCAG relative luminance of that cell's background (threshold Y > 0.32 → dark). Do not decide it from the data value.

**Colour discipline (non-negotiable):**
- **Family colour appears only in the Taxonomy and Samples × taxa views.** The Overview and Detections are neutral ink plus the abundance blue plus `--attn`.
- Sample-type colours were removed. Do not add colour-coded type dots.
- In the heatmap, sample type is shown with a **grey** strip: light `#2b302d #7d847f #b4b9b3 #dfe2db`, dark `#e4e6e0 #a3a9a3 #6b7370 #3a403d`, in the order stool, nasal, wastewater, clinical.

**Family palettes:** categorical, colour-blind safe, 8 colours. Families are ordered by total reads; the 9th family onwards is grey until the user assigns a colour. In production, feed these from the ltc collection (`ORIGINAL_BRIEF.md` §5.8). The reference uses:
- mgviz `#2f6db5 #d9822b #3a9a6e #c2457a #7b63b8 #a69b22 #cf5a3c #4b9fc6`
- okabe-ito `#0072B2 #E69F00 #009E73 #CC79A7 #56B4E9 #D55E00 #b5a30a #7f7f7f`
- tol-muted `#332288 #CC6677 #117733 #DDCC77 #88CCEE #882255 #44AA99 #999933`

In dark theme, palette colours are brightened with `d3.color(c).brighter(0.7)`.

Family **labels** set in a grey family colour use `--muted` instead, for contrast.

### Type
- `--sans`: `-apple-system, "Segoe UI", system-ui, Helvetica, sans-serif`
- `--serif`: `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`. Used only for the headline, the overview story sentences and the genome drawer title.
- `--mono`: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`. Used for sample names, accessions, numbers in tables, and the focus line.

| Use | Size / weight |
|---|---|
| Headline | 26px serif 600 |
| Drawer title | 22px serif 600 |
| Story sentence | 15px serif 400 / 1.35 |
| Tab | 15px (600 when active) |
| Panel title | 14px 600 |
| Body / table name | 13px (names 600) |
| Table cell / numbers | 12px mono, tabular-nums |
| Secondary | 11.5px |
| Section heading / column header | 11px uppercase .05–.06em 600 |
| Pills / badges | 10.5–11px 600; flag badges 9.5px 700, letter-spacing .04em |

SVG figures use the same stacks. Tip labels are 8.5px (> 90 tips), 10px (> 45), 11.5px (> 20) and 12.5px otherwise.

### Spacing, radius, shadow
- Spacing steps used: 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 22 · 28. Panel padding is 16px 18px.
- Radius: cards 10px, inputs and buttons 6px, list rows 5px, small badges 3–4px, pills 999px.
- Only two shadows: tooltip/popover `0 8px 24px rgba(0,0,0,.14)`, drawer `-12px 0 40px rgba(0,0,0,.14)`. The dark SVG tooltip uses `0 4px 14px rgba(0,0,0,.18)`.

### Number formats
- `fmt`: ≥ 1e6 → `x.xM`; ≥ 1e4 → `xk`; ≥ 1e3 → `x.xk`; otherwise an integer.
- `fmtI`: `toLocaleString('en-US')`.
- `fmtR` (RPKMF): ≥ 1000 → `fmt`; ≥ 10 → integer; otherwise 1 decimal.

---

## Derived data (compute exactly)

**Confidence tier** per detection (genome × sample):
```
High   = pct_covered ≥ 80 AND reads ≥ 500 AND gv_score ≥ 0.8 AND read_id ≥ 90
Medium = pct_covered ≥ 40 AND reads ≥ 50
Low    = reads ≥ 10
Trace  = otherwise
```
- "Confident" means ≥ Medium, or ≥ the minimum-confidence control if that is higher.

**Abundance scale:** `log10(rpkmf+1) / log10(max_rpkmf+1)`. The reads scale is the same formula with reads.

**Prevalence:** the number of samples in which a virus is detected at or above the minimum confidence. Per type it is the % of that type's samples.

**Flags** ("Needs checking"). These must stay **rare** (a few % of calls). If they fire on a third of calls they are noise.
- **DIVERGENT:** `adj` true (consensus identity below the species threshold) and tier ≥ Low. Tooltip: "Consensus identity X% is below the species threshold: possibly a new variant."
- **LOW GENOMAD:** pct_covered ≥ 60 and gv_score < 0.6. Tooltip: "geNomad score X despite Y% coverage: check that this is really viral."
- **CHECK SOURCE:** a non-human-host virus confidently found in a human sample (the demo uses porcine circovirus; in production use a host-range table). Tooltip: "Animal virus in a human sample: dietary or reagent contamination?"

**Segmented viruses:** one row per assembly. Segments nest under it.

---

## Screens

### 1. Overview
**Purpose:** the story per sample and per run before any big table.

**Search bar** (top, margin-bottom 16px):
- Input: flex 1, min 260px, max 560px, padding 9px 34px 9px 12px, radius 8px, 13px.
- Placeholder: "Search samples, sample types or viruses (e.g. stool_S1, nasal, norovirus, Coronaviridae)".
- A × clear button inside on the right (16px, `--muted`, hover `--fg`).
- Next to it, a muted count: "{k} of {S} samples match".
- At the far right: "Sample summary" plus CSV · TSV · PNG.
- Matching is a case-insensitive substring over sample name, sample type, virus name, family and genus. If a sample matches by virus, its row shows **that virus's** reads and tier, not the sample's top hit ("1.8k reads · High · +2 matching").

**≤ 12 samples: sample cards.**
- Grid `repeat(auto-fill, minmax(280px,1fr))`, gap 14px.
- Card contents, gap 12px:
  1. Sample name (mono 14.5px 600, links to Detections for that sample) and type (11px muted) on the right.
  2. Story sentence, generated:
     - "X dominates; Y and N more also present."
     - "X is the only confident detection."
     - "No confident call; N weak hits only."
     - "No viruses detected."
  3. "Top confident hits · bar = abundance (RPKMF)" (10.5px muted), then up to 3 hits. Each hit shows the name (12.5px, wraps, never truncated) on one line, and under it the confidence pill and an abundance bar (6px tall, `--abund`, max 56px, log scale) followed by the RPKMF value (mono 11px muted).
  4. "+N more confident · M weaker hits hidden".
  5. A divider, then the QC funnel: text "{raw} raw → {non-host} non-host → {viral} viral reads" (mono 11px), and a 6px bar: track `--line2`, non-host fraction in `--line`, viral fraction in `--fg`.

**> 12 samples: "Samples at a glance" table** (replaces the cards).
- Heading, then a story sentence (serif 15px): "{S} samples in {T} types. A typical sample has {median} confident viruses, and {k} have none. {Virus} is the most widespread ({k} of {S} samples)." With a search active, it starts "Among the {k} matching samples, a typical one has …".
- Columns, `150px 90px 250px 130px minmax(200px,1fr)`, gap 14px, min-width 820px with horizontal scroll:
  - **Sample** (mono 12px 600; click focuses that sample and opens Detections)
  - **Type**
  - **Viral reads, % of non-host**: a 100px track with a fill of `sqrt(frac/maxFrac)` in `--fg` at .7 opacity, then the %, then "of {non-host}" in muted
  - **Confident viruses**
  - **Most abundant virus**: name, then "+N more"
- Every header sorts on click; the active one shows ▾.
- 20 rows, then "Show all {S} samples".

**Shared across samples / Most prevalent viruses** (full width under the cards or table):
- Title: "Shared across samples" when S ≤ 12, "Most prevalent viruses" when S > 12.
- Right side: a legend sentence plus CSV · TSV · PNG.
- Rows use grid `200px 76px 1fr`:
  - virus name
  - **"found in"** column: mono `k/S`, **text only**. A mini bar was removed because it repeated the number.
  - cells
- Cells when S ≤ 12: one per sample, 52px × 16px, radius 3px, coloured by abundance, showing the reads value. Legend: "colour = abundance · number = reads · blank = not detected".
- Cells when S > 12: one per sample **type**, 58px, coloured by the type's prevalence %, showing the %. Legend: "samples = detected in · cell = % of samples of that type".
- Up to 14–15 rows. Rows require k ≥ 2 when S ≤ 12, and k ≥ 1 otherwise.
- Clicking a row opens the genome drawer.

**Not on the Overview:** the "Needs a second look" panel was **removed** on purpose (no context, poor alignment). Its information lives in the Detections tab.

### 2. Detections
**Toolbar:**
- **Group by** segmented control `Sample | Virus`. Default: Sample when S ≤ 12, Virus otherwise.
- Toggle "Only viruses in ≥ 2 samples".
- Toggle **"Needs checking · N"**: active state has an `--attn` border and `--sel` background; its title attribute explains the three flag kinds.
- "Expand all segments" / "Collapse segments" (`--accent`).
- Right side: "{calls} calls · {viruses} viruses · {samples} samples", then TSV.

**Table** (min-width 1110px, horizontal scroll):
- Columns: `minmax(220px,2fr) 100px 80px 150px 230px 160px 110px`, gap 14px, row padding 7px 16px.
- Header: 11px uppercase muted. It is clickable and sorts; the active column shows ▾/▴ in `--fg`.
  - Labels: Virus (or **Sample** when grouped by virus) · Confidence · Reads · Abundance (RPKMF) · Coverage along genome · Identity to reference · geNomad.

**Group header row:** background `--bg`.
- Grouped by sample: the name in mono 13px 600, then a summary: "{type} · {n} calls, {c} confident · {non-host} non-host reads, {viral} viral".
- Grouped by virus: the name in sans, then a summary: "{family} · in {k} of {S} samples, {c} confident · {reads} reads".
- Groups show their first **8** rows (sample grouping) or **5** rows (virus grouping), then "Show all {n} calls/samples ▾".
- 20 groups load at a time, then "Show 20 more … · {n} not shown". This keeps 1,500+ calls fast. Only build DOM for visible rows.

**Row:**
1. Name (13px 600), and under it the lineage `family · genus`, or `type · {non-host} non-host reads` when grouped by virus. Then an "{n} segments ▾" chip for segmented viruses, and a flag badge if any (1px `--attn` border, `--attn` text, `cursor:help`, title = reason).
2. **Confidence pill** (neutral, no traffic-light colours):
   - High: `--fg` fill, `--panel` text
   - Medium: 1px solid `--fg`, `--fg` text
   - Low: 1px solid `--line`, `--muted` text
   - Trace: 1px **dashed** `--line`, `--muted` text

   On hover, a popover (264px, `--panel`, `--line` border, radius 8px) shows "Why "Medium"" and four checks with ✓ (ink) or ✕ (`--attn`) and the actual values: Genome covered ≥ 80% · Aligned reads ≥ 500 · Read identity ≥ 90% · geNomad score ≥ 0.8. Its footer: "High = all four. Medium = ≥ 40% covered and ≥ 50 reads. Low = ≥ 10 reads. Fewer = trace."
3. Reads, right-aligned, mono.
4. RPKMF value, plus a 5px bar (track `--line2`, fill `--abund`, log scale).
5. **Coverage sparkline**, 170×36:
   - background rect `--line2`, radius 3px
   - symlog y axis, step curve
   - fill `--fg` at .14 opacity, line `--fg` 1.1px at .8 opacity
   - segment separators in `--panel` 1.5px
   - then "pct%" in mono
6. "read 98.2%" / "cons 94.9%", with a **DIVERGENT** badge when `adj` (title: "Consensus identity below the species threshold: taxonomy downgraded to genus. Possibly a new variant.").
7. geNomad score, then " · {n} hallmark".

**Segment sub-rows** (when expanded): indented 40px, background `--bg`, 12px. Each shows the label, gene, accession, length, reads, mean depth, and a 170×22 sparkline with its %.

**Detections (TSV) export** columns: `sample virus family genus species accession segments length reads rpkmf pct_covered mean_depth read_identity consensus_identity pi genomad_score hallmarks confidence taxonomy_adjusted`.

### 3. Taxonomy
**Toolbar (row 1):**
- Layout segmented control: **Tree · Radial figure · Composition**.
- Value select: abundance (RPKMF, log) / aligned reads (log) / genome covered (%). Composition sizes by reads or RPKMF only.
- Collapse all / Expand all families.
- "Samples as": auto / one track per sample / one track per sample type (mean). Auto switches to per type above 40 samples in Tree, and above 12 in Radial.
- Legend text.
- **Family colours** button.
- Note on the right, then SVG · PNG.

**Toolbar (row 2): interaction bar**, shared by all three layouts (`--panel`, 1px `--line2`, radius 8px, padding 8px 12px):
- **Mouse** segmented control: `Pan · Rotate · Zoom to area`. Rotate appears only in Radial. The default tool is Rotate in Radial and Pan elsewhere.
  - Pan: drag moves the view; cursor grab/grabbing.
  - Rotate: custom circular-arrow cursor. Dragging around the figure centre rotates it live (the angle comes from `atan2` relative to the on-screen centre, after zoom). On release, commit the angle as rotation state and redraw so labels re-flip upright.
  - Zoom to area: crosshair cursor. Dragging draws a dashed rectangle (stroke `#1f5f8b` 1.5px, dash 5 3, fill `rgba(31,95,139,.08)`). On release, zoom (400ms) so that rectangle fills the view. For a very tall tree (viewBox height > 1300), fit the width only and centre on the box. Ignore boxes smaller than 8px.
  - In every mode: the wheel zooms (scale 0.5–12) and double-click resets.
- Zoom − / + buttons (×1/1.5, ×1.5, 250ms) and "Reset view", which also resets rotation.
- Radial only:
  - Rotate ↺ / ↻ buttons (±15°), a 0–359° slider, and the angle readout (mono).
  - **Focus on family** select. Choosing a family rotates the figure so that family sits at 3 o'clock (labels horizontal), then zooms to the family's clade range with a 450ms transition. "whole tree" resets.
- Composition only: **Samples shown** (auto = 30 if more / 10 / 20 / 30 / 50 / all) and **Sort samples by** (sample type · name · total viral signal · share of {each family}).
- Right side: a hint, e.g. "Drag around the centre to rotate · scroll to zoom · double-click to reset".

**Tree model (all layouts):** root → family → (genus, only when a family has more than one genus **and** that genus has more than one tip) → virus. **Single-child rank chains are folded into the family branch.** Never draw one node per rank. Families are collapsible into a wedge whose size is `min(7, 1.6 + log2(n+1))` rows; its label is "Family · n". All families start collapsed when there are more than 130 tips.

**3a. Tree (rectangular, default):**
- Row height 26px; 17px above 45 tips; 12px above 90 tips.
- Left margin is computed from the longest family label so labels are never clipped.
- Family clade: a band in the family colour at 8% opacity, radius 4px, spanning the tree, labels and columns. Family label right-aligned at the family node, 12px (10px above 45 tips) 600, in the family colour, with a 3px `--panel` halo.
- Genus labels: italic, muted, 1px smaller.
- Tips: circles, radius by sqrt(reads) from 2 to 7px (4px above 45 tips), with a 1.2px `--panel` stroke. Labels in `--fg` followed by read counts in muted.
- Sample columns are 9–30px wide. Column labels are rotated −55° when narrower than 70px, mono, max 11px; with per-type tracks they read "stool · 40". The SVG width grows so labels never run off the right edge. The column title ("Abundance, RPKMF (log)") sits right-aligned just left of the columns, never overlapping them.
- Cells: ramp colour, absent = SVG absent colour, radius 2px.

**3b. Radial figure (publication):**
- Square viewBox `max(W,1100)`.
- Three dashed guide circles labelled FAMILY / GENUS / VIRUS, at 36%, 66% and 100% of the tip radius.
- Family clade sectors at 8% opacity. Branches are drawn as arc plus radial segment, stroke 2.6px (family), 1.8px (genus), 1.3px (tip), round caps.
- Tip labels are radial and flip upright on the left half, using the normalised angle so they stay correct at any rotation. Labels truncate with … to fit the band.
- Outer **bar rings**, one per sample (or type): bar height = value, in `--abund`. Each ring has a thin baseline in `--line`. Ring name labels sit in the gap, which follows the rotation, with a `--panel` halo.
- Outside the rings, family arcs (8px thick, family colour) carry a curved family label "Family · n" on a textPath. Labels on the lower half run the other way so they read upright.
- The gap angle depends on the number of rings: `clamp(0.4, nR*0.035+0.32, 1.0)` rad.

**3c. Composition:**
- Left: an icicle (family → genus → virus), height = share of reads (or RPKMF) in the focus. Fills are the family colour mixed with `--panel` at 62% (family), 40% (genus) and 22% (virus). Labels show the name plus "%" when the cell is ≥ 13px tall.
- Right: "Family composition per sample". One 100% stacked bar per sample, with a clickable family legend.
  - The subtitle states what is shown, e.g. "Each bar = 100% of that sample's viral reads. Showing 30 of 100 samples, most Caliciviridae first (shown leftmost). Click a sample to focus it."
  - Sorting by a family puts the samples richest in it at the top **and** draws that family's segment first (leftmost) in every bar, so the bars align and compare.

**Family colours panel** (opens under the toolbar):
- "Start from a palette" chips.
- A grid of families (`minmax(270px,1fr)`). Each has a swatch button that opens ~25 preset swatches, an "any" `<input type=color>` and "Use default", plus a hex input (validates `#rrggbb` and accepts a missing `#`).
- Notes: "custom" or "no colour yet". "Reset all".
- Persist to localStorage under `mgviz.colors` as `{fc:{family:hex}, ps:paletteName}`.

**Tree tooltips:**
- Tips: rank rows (realm, order, family, genus, species, strain) in 9.5px uppercase, then a per-sample mini-table (sample · reads · RPKMF · cov) for the top 8.
- Families: their lineage and "{n} genomes · click to collapse/expand".
- Hovering a tip highlights it everywhere (the others drop to .35 opacity; filtered-out items to .15).
- Clicking a tip opens the genome drawer. Clicking a family node or label toggles collapse.

### 4. Samples × taxa
**Toolbar:**
- Cell value select.
- Ramp legend with the note "low → high · {shown} of {total} viruses, most prevalent first · rows and columns clustered (average linkage, log abundance)".
- **Rows:** auto (top 50 if more than 60) / top 30 / 50 / 100 / all, ranked by number of samples, then by total reads.
- **Columns:** clustered by similarity / grouped by sample type.
- "type strip" legend.
- SVG · PNG · TSV.

**Figure:**
- **Clustering:** UPGMA on Euclidean distance of `log10(rpkmf+1)` vectors, for rows and columns. Use a distance matrix with Lance-Williams average updates (O(n³)); it must handle 200 × 100 instantly. Draw dendrograms in muted 1px, rows on the left (70px) and columns on top (50px).
- When grouped by type, columns are ordered by type and then by cluster order within the type, with no column dendrogram. Labelled brackets "stool · 40" are drawn in its place.
- When clustered and S > 1, a 6px grey type strip runs above the columns.
- **Cells:** height 24px (14px above 45 rows; 9px above 90). Width is fitted, between 6 and 64px. Gap is 1px (0.5px when narrower than 9px); radius 2px (0 when narrower than 9px). In-cell values appear when cells are ≥ 40×14. Absent cells use the quiet absent colour.
- Column labels are hidden when narrower than 9px; the tooltip carries "sample · type". Column totals below each column (bar plus count); the count is hidden when narrower than 14px.
- Row labels: family square, name, and "· k" when the virus is in more than one sample. Then a total-reads log bar.
- The SVG grows wider than the container if needed; the container scrolls.
- **Hover** does not re-render the app: update opacities directly (crosshair dims everything else to .35). Clear the hover on mouseleave of the SVG. A sticky-hover bug existed; do not reintroduce it.
- Clicking a cell opens the drawer. Clicking a column label focuses that sample.

### 5. Genome drawer
- Fixed right panel, `min(620px,100vw)`, padding 22px 26px 40px. Background scrim `rgba(0,0,0,.18)`; clicking it closes the drawer. 0.18s fade/slide-in.
- **Top:** family · accession · length (11.5px muted); title (serif 22px); × close button.
- **Lineage chips:** realm › order › family (600) › genus › species. Each chip has a 10px uppercase rank label.
- **"Detected in"** sample chips with tier pills. Clicking one switches the sample. "Compare samples" toggle appears when the virus is in more than one sample.
- **Stat tiles** (`auto-fit minmax(110px,1fr)`, `--bg`, radius 6px): confidence · aligned reads (sub: RPKMF) · covered (sub: mean depth) · read identity · consensus identity (`--attn` and "below species threshold" when `adj`) · diversity π (sub: % N in consensus).
- **geNomad strip:** score (mono 15px 600), a 6px bar, and "{n} hallmark genes · classified as {family} (lineage downgraded)".
- **Coverage and ORFs**, per segment as small multiples (`repeat(auto-fill,minmax(250px,1fr))` for segmented viruses, single wide plot otherwise):
  - Symlog depth axis.
  - Step area in ink at .22 opacity, plus the line.
  - Zero-coverage windows marked by a 3px `--attn` tick on the baseline.
  - ORF arrows: forward strand above the midline, reverse below. Partial ORFs have a dashed outline. Names appear inside an arrow when it is wide enough. Title on hover: "name · start–end (len bp) · ± strand · partial".
  - Compare mode: one coloured line per sample on a shared y scale, with a legend.
  - SVG · PNG export.

---

## Interactions and state
**Shared focus state** (left panel): `selSample`, `selFamily`, `search`, `minTier`. The Overview and Detections **filter** by it; Taxonomy and Samples × taxa **fade** the rest. The tab description and the "Focus:" line always state the current scope.

**View state:** `tab`, `treeLayout`, `treeValue`, `treeCols`, `collapsed{}`, `treeRot` (deg), `treeTool`, `zoomFam`, zoom transform (kept across redraws until a layout change), `compTop`, `compSort`, `heatTop`, `heatCols`, `groupBy`, `groupLimit`, `groupOpen{}`, `expanded{}`, `sortKey/sortDir`, `flagOnly`, `sharedOnly`, `ovQ`, `ovSort`, `ovLimit`, `selVirus` (drawer), `compare`, `famColors`, `paletteSel`, `theme`.

**Hover:** handle it with direct DOM/opacity updates inside each figure, not a full re-render.

**Selection** (`selVirus`) highlights everywhere: table row `--sel`, tree tip bold with a thicker branch, heatmap row.

**Redraw rules:** redraw a figure only when one of its structural inputs changes (tab, layout, value, collapsed, filters, colours, rotation, tools, row and column options). Everything else is a highlight pass.

**Animations:** zoom transitions 250–450ms (d3 default easing); drawer 180ms ease-out. Nothing else animates.

## Export
- **Figures:** SVG (serialised with an `xmlns`) and PNG (canvas at 3×, filled with `--panel`). Multi-SVG panels such as the genome drawer are stacked vertically into one SVG.
- **Overview tables:** CSV · TSV · PNG on each panel. Exports include **every row in the current focus**, not just the rows on screen; the button title says how many.
  - The file name encodes the focus, e.g. `mgviz_sample_summary_search-noro.csv`.
  - CSV: UTF-8 with a BOM, CRLF line endings, RFC-4180 quoting.
  - TSV: tabs and newlines inside cells replaced with spaces.
  - PNG: the panel at 2×, without the export buttons.
- **Sample summary** columns: `sample type raw_reads non_host_reads viral_reads viral_pct_of_non_host confident_viruses weaker_calls most_abundant_virus most_abundant_rpkmf`.
- **Prevalence** columns: `virus family genus samples_detected samples_total prevalence_pct <type>_pct… total_reads`.
- **Heatmap TSV:** a virus × sample RPKMF matrix.
- **Size limits:** CSV has no row limit of its own; Excel stops at 1,048,576 rows × 16,384 columns. Prefer long format (one row per sample–virus) for anything that could get large. For very large runs the pipeline itself should also write compressed TSV or Parquet, linked from the report.

## Scaling rules (summary)
| Element | ≤ 12 samples | > 12 samples |
|---|---|---|
| Overview | sample cards | "Samples at a glance" table, 20 rows + show all |
| Shared panel | per-sample cells with reads | per-type prevalence % |
| Detections | group by sample | group by virus, 5 rows per group, 20 groups per page |
| Tree tracks | per sample | per sample (Tree, ≤ 40) / per type (Radial, > 12) |
| Heatmap | all rows | top 50 when > 60 viruses, cells down to 6px |
| Composition bars | all | 30 by default when > 30 |
| Left panel | expanded | collapsed types + filter |
| Families | — | collapsed when > 130 tips |

## Empty and edge states to implement
- One sample: no column dendrogram, no "shared" rows ("No virus is shared between samples."), no Compare.
- Nothing in focus: "Nothing in the current focus." / "No detections in the current focus."
- A family without a palette colour: grey, with readable label colour.
- Very long names: truncate with … in figures, but never in Overview hit lists.

## Screenshots (`screenshots/`)
These are viewport captures (about 900×540) of the reference prototypes. Each one shows the top of a view or the start of a figure; open the reference HTML to see the rest.
- **Light, 4 samples:** `light_4-samples_01_overview`, `02_overview-shared`, `03_detections`, `04_tree`, `05_radial`, `06_composition`, `07_heatmap`, `08_genome-drawer`
- **Light, 100 samples:** `light_100-samples_01_overview` (Samples at a glance), `02_overview-prevalence`, `03_detections-grouped-by-virus`, `04_detections-needs-checking`, `05_tree`, `06_radial`, `07_radial-focus-picornaviridae`, `08_composition-sorted-by-caliciviridae`, `09_heatmap-clustered`, `10_heatmap-grouped-by-type`
- **Dark, 4 samples:** `dark_4-samples_01_overview`, `02_detections`, `03_tree`, `04_radial`, `05_composition`, `06_heatmap`, `07_genome-drawer`
- **Dark, 100 samples:** `dark_100-samples_01_overview`, `02_tree`, `03_radial`, `04_heatmap`

## Files in this package
- `CLAUDE_CODE_PROMPT.md`: the message to paste into Claude Code.
- `reference/mgviz Report v2.dc.html`: the complete reference (template at the top, logic class in the `<script data-dc-script>` block). Key methods:
  - `drawTree` (Tree and Radial), `drawComp`, `installTools` / `wrapZoom` / `curTool` (mouse tools)
  - `drawHeat`, `clusterVecs`, `drawGenome`
  - `exportFig`, `exportRows`, `seq`, `inkOn`
  - `renderVals0` + `renderVals` (all derived view data and copy)
  - Ignore `genData` and `CAT`/`VIR`, which are demo data.
- `reference/mgviz Report v2 - 100 samples.dc.html`: the same report at 100 samples.
- `reference/support.js`: the prototype runtime, needed only to open the references.
- `ORIGINAL_BRIEF.md`: the product brief, hard constraints and the data schema.

Implement in this order: tokens and shell → Detections → Overview → Samples × taxa → Tree → Radial → Composition → Drawer → exports → dark theme pass. After each step, check against the reference at 4 and at 100 samples.
