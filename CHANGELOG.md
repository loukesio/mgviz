# loukesio/mgviz: Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## v0.1.0 - 2026-10-19

Initial release.

### Pipeline

- EsViritu's analysis as independent Nextflow processes: fastp, optional host filtering, minimap2 mapping with alignment filters, two rounds of read-sharing clustering and re-alignment, samtools consensus, per-contig statistics, LCA taxonomy, pyrodigal-gv ORFs, geNomad scoring, EsViritu-compatible tables.
- nf-core style layout: `workflows/`, `subworkflows/local/`, `modules/local/`, `conf/`, parameter schema with `--help` and validation, samplesheet schema, resource labels, `ext.args`/`ext.prefix`, `versions.yml` per process collected into `pipeline_info/software_versions.yml`.
- Bundled `test` profile: two simulated samples against a 53-record database.
- One container image for every step, published to `ghcr.io/loukesio/mgviz` by GitHub Actions.
- Standalone entry workflow in every module; `BUILD_DB` module for custom databases, `db_sources` to prepare accession tables from RefSeq viral and to merge sources (docs/databases.md).

### Report

- Four views with one shared focus: Overview, Detections, Taxonomy (rectangular tree, radial figure, composition), Samples × taxa heatmap; genome drawer with coverage, ORFs, geNomad and sample comparison.
- Confidence tiers, "Needs checking" flags (DIVERGENT, LOW GENOMAD, CHECK SOURCE), per-sample QC funnel.
- SVG/PNG export of every figure, CSV/TSV export of every table; light and dark themes; family colours from the ltc palettes.
- `mgviz report` accepts any EsViritu output directory; `mgviz demo` generates synthetic data up to hundreds of samples.
