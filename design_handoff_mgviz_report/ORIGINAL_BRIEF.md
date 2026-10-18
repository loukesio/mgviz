# mgviz report redesign brief

Prepared 2026-10-18 for a design pass (Claude Design). Screenshots are in `screenshots/`.

## 1. What mgviz is

mgviz is the reporting layer of a virus-detection pipeline for metagenomic sequencing (wastewater, stool, nasal swabs, clinical samples). The pipeline maps millions of short reads against a database of ~31,000 viral reference genomes (the EsViritu database), decides which genomes are really present, builds a consensus sequence for each one, assigns taxonomy, predicts proteins (ORFs) and scores each genome with a deep-learning classifier (geNomad).

The report is the only thing most users ever look at. A virologist or public-health analyst opens it to answer, in this order:

1. Which viruses are in each sample?
2. How abundant are they, and how confident is the call (reads, coverage completeness, identity to reference)?
3. Which samples share which viruses?
4. Where do the detections sit in viral taxonomy (family, genus, species, strain)?
5. For one genome: what does coverage look like along the genome, where are the genes, is it a known variant or something divergent?

Audience: scientists, not designers. They will paste figures from this report into slides and papers, so figure quality matters as much as dashboard usability.

## 2. What the original tool (EsViritu) offers, and why we are replacing it

EsViritu ships one HTML page per run: a sortable table with a 100-window coverage sparkline per genome (`screenshots/00_esviritu_report_table.png`, `00_esviritu_report_full.png`). It has no cross-sample view, no taxonomy view of the results, no genome-level zoom, and no export. The only tree it ships is a static PNG of the whole *database* (`00_esviritu_db_heat_tree.png`), not of the results. That PNG is actually a decent reference for the feel we like: rounded family nodes, counts in the labels, soft colours, big and readable.

We decided to rebuild the analysis as our own pipeline and to make the report the strong point of the project.

## 3. What we have built so far (current state)

Everything is a single self-contained HTML file: vendored d3 v7, inline CSS and JS, data embedded as JSON. It must open from `file://` with no network and no build step. It has light and dark themes and a palette picker fed by our own palette collection (`ltc`, 32 palettes).

| Screenshot | What it shows |
|---|---|
| `01_table_overview.png` | Landing view: header, five stat cards, three tabs, control bar, detections table with sparklines (first screen of 62 rows). |
| `02_table_row_expanded_detail.png` | Clicking a row opens the genome panel: lineage breadcrumb, coverage along the genome (log scale, 100 windows), ORF track underneath. |
| `02b_table_row_expanded_segmented.png` | Same panel for a segmented virus (influenza, 8 segments): one chart per segment, stacked. |
| `03_tree_radial.png` | Taxonomy tree of the detections, radial. Branches coloured by family, per-sample rings outside the tips coloured by abundance, tip labels with read counts. |
| `04_tree_radial_hover_tooltip.png` | Hover on a tip: path highlight plus tooltip. |
| `05_tree_family_focus.png` | Clicking a family in the legend dims everything else. |
| `06_tree_horizontal.png` | Same tree, rectangular layout, with rank labels on internal nodes and a column per sample at the right. |
| `07_heatmap_sample_by_taxon.png` | Sample × taxon heatmap (rows taxa, columns samples, colour = abundance). |
| `08_heatmap_dark.png`, `09_tree_radial_dark.png` | Dark theme. |
| `10_header_and_controls.png` | Header, stat cards, tab strip and control bar in isolation. |

The demo data has 4 samples, 62 detected genomes, 18 assemblies (a segmented virus is one assembly with several genome segments), 11 families. Real runs range from 1 sample with 3 viruses to 100+ samples with several hundred genomes.

## 4. What is wrong (be blunt with us)

### Whole report

- It looks like a generic admin template. No visual identity, nothing that says "virology" or "genomics". Stat cards at the top are decorative; nobody needs "Assemblies: 18" as the first thing they see.
- There is no overview. The user lands on a 62-row table and has to work out the story themselves. There is no per-sample summary ("stool_A01: norovirus dominates, rotavirus present, 3 trace hits"), no ranking of what matters, no QC panel (read counts, reads removed by filtering, reads mapped) even though the data is there.
- The three tabs are silos. Clicks do link them (tree tip → table filter, heatmap cell → table filter) but nothing about the design tells you that. There is no selection model: pick a sample or a family and see it reflected everywhere.
- The control bar is a long row of selects whose labels change per tab (Ring value / Cell value / Depth scale). Hard to know which control affects what.
- Typography and spacing are default system-font and flat; hierarchy is weak everywhere.

### Detections table

- Segmented viruses explode the table: influenza is 8 rows, rotavirus 11 rows, so 18 real detections become 62 rows. Rows should group by virus/assembly with segments nested or summarised.
- Sparklines are too small to read and the little depth number clutters them. The "% covered" bar and the sparkline partly encode the same thing.
- Every column has equal visual weight. The key question "how confident is this call?" (reads, coverage completeness, read identity, consensus identity, geNomad score) is not answered visually; it is just numbers in grey.
- Sample grouping is invisible; rows from four samples interleave by RPKMF.
- Sort state is a tiny arrow; filters are hidden in the control bar.

### Taxonomy tree (the part we care most about)

- Radial layout: the centre is a hairball. Between root and each tip there are up to seven ranks (realm, kingdom, phylum, class, order, family, genus, species, subspecies) and most of them are single-child chains, so every tip is a long spoke of small hollow circles that carry no information. This is the "grey points" problem in a new form.
- Rank names are only shown in the rectangular layout, so the radial tree is pretty but uninformative, and the rectangular tree is informative but ugly (chains of text).
- Rings: the sample names stacked at 12 o'clock overlap the ring cells; nothing else tells you which ring is which sample. Grey "not detected" cells dominate. The ring legend is a tiny gradient bar.
- Tip labels are rotated and hard to read; read counts are faint grey; tip size encodes reads but you cannot see it.
- Family identity is only a text legend with coloured squares and "+N more families in grey". There is no clade shading or labelled coloured range like iTOL draws around groups of leaves, so the family structure is not visible in the figure itself.
- Focus mode dims everything else to near-invisible instead of pushing it to the background.
- It does not scale. Eleven tips look fine; 200 tips will be unreadable. There is no collapse-to-family, no zoom-with-labels, no search highlight, no "show only shared across samples".
- Nothing is exportable as SVG/PNG for a paper.

### Heatmap

- Bare. No clustering or dendrogram on either axis, no row/column totals, no numbers in cells, grey dominates when most taxa are absent from most samples. Column labels rotated.

### Genome detail panel

- Coverage area in pale fill on a log scale; one chart per segment stacked vertically becomes very tall for 11-segment rotavirus.
- ORF track is fat arrows with no labels, strand only by direction. geNomad score, taxonomy and hallmark-gene count are available but not shown here.
- Lineage breadcrumb and stat line are cramped into two lines of bold/normal text.
- No way to compare the same genome across samples side by side.

### Dark theme

- A plain inversion. Ring and heatmap greys go muddy; the data colours were not re-selected for the dark surface.

## 5. What we want to achieve

The point: **a report a virologist opens and, within ten seconds, knows which viruses are in which samples and how much to trust each call, then can drill into any genome, and can take any view out as a publication-quality figure.**

Concretely:

1. **Overview first.** A landing section that tells the story per sample and per project (top hits, confidence, shared viruses, QC) before any big table.
2. **An iTOL-quality tree of the results.** Reference: https://itol.embl.de/ (and the EsViritu database tree PNG for the softer feel). Needs: readable tip labels, labelled and shaded family/clade ranges, collapsed rank chains (do not draw seven hollow circles per tip), per-sample abundance rings or bars that are obviously tied to sample names, scaling to a few hundred tips via collapse/zoom/search, and radial plus rectangular layouts.
3. **A table that groups by virus** with segments nested, with confidence visible at a glance (a pill, a bar, a stripe, not only numbers), and sparklines large enough to read.
4. **A sample × taxon view** that orders and clusters samples and taxa, shows totals, and makes absence quiet instead of dominant.
5. **A genome panel** that works for 1 and for 11 segments, shows ORFs with labels and strand, shows the geNomad classification, and can compare one genome across samples.
6. **Linked interaction everywhere.** Hover highlights across views, click selects, selection persists across tabs. "Always interactive" is a hard requirement from us.
7. **Export** of every figure as SVG and PNG, and of every table as TSV.
8. **A real visual identity.** Typography, spacing, and colour that feel like a scientific instrument, not a SaaS dashboard. Colour must come from our ltc palettes (categorical for families, sequential for abundance), with light and dark designed separately. Must stay colour-blind safe for the categorical set.

## 6. Hard constraints for the design

- Single HTML file, opens offline from disk. d3 v7 is vendored; no other libraries, no web fonts from the network (system font stacks or embedded fonts only).
- No build step: the page is assembled by Python from an HTML template, a CSS file and a JS file.
- Must work from 1 sample / 3 genomes up to 100 samples / 500 genomes.
- Light and dark theme, palette switchable at runtime.
- Must render in current Chrome, Firefox, Safari.

## 7. Data available per detected genome (so the design can use it)

| Field | Meaning |
|---|---|
| sample, accession, name, description | Which sample, reference ID, virus name |
| segment, assembly | Segment label (influenza PB2, HA…); assembly groups segments of one virus |
| length, covered, pct_covered, mean_cov, cov[100] | Genome length, bases covered, fraction covered, mean depth, depth in 100 windows |
| reads, rpkmf | Aligned reads; reads per kilobase per million filtered reads (abundance) |
| read_id, cons_id | Mean read identity to reference; consensus-to-reference identity |
| pi | Nucleotide diversity within the sample |
| kingdom…subspecies (8 ranks), adj | Taxonomy; `adj` = taxonomy was downgraded because identity was below species/subspecies thresholds |
| orfs[] | Predicted genes: start, end, strand, length, partial flag |
| gv_score, gv_tax, gv_hallmarks | geNomad virus score (0–1), geNomad taxonomy, number of viral hallmark genes |
| consensus_n_frac | Fraction of consensus sequence that is N (unresolved) |

Per sample: filtered read count, read statistics from QC (raw, after trimming, after host removal), pipeline parameters.

## 8. What we would like back

- A layout for the overview/landing section.
- The tree, in both layouts, at 10 tips and at 200 tips, light and dark.
- The grouped detections table with its confidence encoding.
- The heatmap and the genome panel.
- The navigation / control model (how filters and selections are exposed and shared across views).
- Type scale, spacing system and colour roles mapped onto our palettes.
- Empty and edge states: one sample, one virus; many samples, many viruses.

References: iTOL https://itol.embl.de/ · EsViritu https://github.com/cmmr/EsViritu · ltc palettes https://github.com/loukesio/ltc-color-palettes
