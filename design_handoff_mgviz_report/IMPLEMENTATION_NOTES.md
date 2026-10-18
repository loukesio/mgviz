# Implementation notes and deviations from README.md

Implemented 2026-10-18 in `src/mgviz/templates/` (report.html, report.css, `js/00_core.js … 99_boot.js`)
with `bundle.py`, `loader.py`, `synthetic.py` and the Nextflow report module updated. Checked
against every screenshot at 4 and 100 samples, light and dark, in headless Chrome; every
SVG/PNG/CSV/TSV export exercised programmatically; no console errors across tabs, layouts,
focus states and the one-sample case.

## Deviations (and why)

1. **JS is split into seven files**, concatenated by `render.py` in name order (no build step; the
   output is still one HTML file). Agreed with the product owner before coding.
2. **Theme toggle.** A small "Theme" text action sits in the header right of the export button
   (not in the README). Without it the page only follows the OS. Choice remembered in `localStorage`.
3. **Realm is not available** in the EsViritu database (kingdom is "Viruses" for every record).
   Lineage chips are order › family › genus › species; tree tooltips list order, family, genus,
   species, strain (strain = EsViritu subspecies when it is not "unclassified").
4. **ORFs are numbered** (`ORF1…n`): pyrodigal-gv gives coordinates only. Segment sub-rows show
   label and accession, with no gene column. geNomad's per-gene annotations are a follow-up.
5. **Sample type** comes from an optional `type` column in the samplesheet (`--samples` on the
   CLI); without it the type is inferred from the name prefix when it is one of stool, nasal,
   wastewater, clinical, else `sample`. Single-type runs drop the type strip and type grouping.
6. **CHECK SOURCE** uses a starter host-range table (`static/host_range.json`, regex rules on
   name/species/genus/family → host group). Animal-host viruses are flagged in stool, nasal and
   clinical samples; plant viruses only outside stool (diet makes them expected there); phages
   never. Edit the JSON to extend it. On the 100-sample fixture flags fire on 4.5 % of calls.
7. **geNomad not run** (no summary file in the run): the fourth High check is treated as passed
   and the popover / drawer say "not run". If geNomad ran but did not list a consensus, the score
   is 0 (geNomad did not call it viral). Segmented viruses use the exemplar segment's score and the
   sum of hallmark genes.
8. **Drawer "Detected in" chips** show 12 and a "+N more" toggle when a virus is in more samples
   (the README has no cap; 40+ chips pushed the evidence off screen). Clicking a chip switches the
   drawer's sample without changing the global focus.
9. **Rectangular tree tip labels** truncate with … to the label band (full name in the tooltip);
   the README only specifies truncation for the radial figure.
10. **Overview PNG for ≤ 12 samples** draws the same export-only SVG table used above 12 samples
    (sample, type, viral %, confident viruses, most abundant virus) rather than a picture of the
    cards, as the README's preferred route for HTML panels.
11. **LOW GENOMAD** follows the README (`pct ≥ 60 and gv < 0.6`), not the prototype's looser rule.
12. **Virus display name** is EsViritu's `Name` column (strain is shown separately), so long
    GenBank names such as "Severe acute respiratory syndrome coronavirus 2" truncate in narrow
    cells; the drawer shows the full name.
13. **Composition cell value** shares the Taxonomy "value" select (reads or RPKMF); choosing
    "genome covered" in another layout falls back to reads in Composition, as in the prototype.

## Not verified here

- Firefox and Safari were not exercised (only Chrome is scriptable on this machine). The code uses
  no Chrome-only APIs; please open `mgviz demo` output in both once.
- Rotate-drag and zoom-to-area were exercised by their functions, not by real mouse drags.

## Data additions (bundle)

Per sample: `type`, `raw_reads`, `pre_host_reads`, `viral_reads`, `has_genomad`.
Meta: `run_id`, `db_version` (from the params YAML; the pipeline now writes it), `sample_types`, `host_range`.
