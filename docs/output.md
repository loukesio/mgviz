# loukesio/mgviz: Output

All results are written to `--outdir` (default `results/`), one folder per step
plus the report at the top level.

## Report

- `mgviz_report.html`: the interactive report, one self-contained file that opens
  offline. Views: Overview, Detections, Taxonomy (tree, radial figure,
  composition), Samples × taxa, and the genome drawer. Every figure exports as
  SVG or PNG, every table as CSV or TSV.
- `mgviz_bundle.json`: the data the report embeds (samples, detections with
  100-window coverage, ORFs, geNomad scores, taxonomy), for downstream use.

## Per-step folders

| Folder | Files | Description |
|---|---|---|
| `fastp/` | `<sample>.trim_{1,2}.fastq.gz`, `<sample>.fastp.{json,html}` | trimmed reads and fastp statistics; the JSON feeds the report's read funnel |
| `host_filter/` | `<sample>.filt_{1,2}.fastq.gz` | reads left after host removal (only with `--filter_fasta`) |
| `map_initial/` | `<sample>.initial.bam(.bai)`, `<sample>.virus_reads*.fastq.gz`, `<sample>.readcount.txt` | alignment of all reads to the full database, the reads that hit a virus, and the read count used as the RPKMF denominator |
| `cluster_r1/`, `cluster_r2/` | `<sample>.<round>.read_sharing.tsv`, `.clusters.tsv`, `.clustered_refs.fasta` | read-sharing network between references, cluster membership with the exemplar, and the exemplar sequences |
| `map_r2/`, `map_r3/` | `<sample>.second.bam`, `<sample>.final.bam` (+ `.bai`) | re-alignments to the exemplars; `final` is the alignment every statistic is computed from |
| `consensus/` | `<sample>_final_consensus.fasta` | consensus per detected genome, records named `<Accession>_<sample>_consensus` |
| `contig_stats/` | `<sample>.contig_stats.tsv`, `<sample>.virus_coverage_windows.tsv` | per-contig reads, covered bases, mean depth, read identity, π; depth in 100 windows |
| `lca_taxonomy/` | `<sample>.consensus_vs_db.paf`, `<sample>.adj_taxonomy.tsv` | consensus-to-database alignment and the taxonomy adjustment per assembly |
| `predict_proteins/` | `<sample>.orfs.tsv`, `.genes.gff`, `.proteins.faa` | pyrodigal-gv gene calls |
| `genomad/` | `<sample>_final_consensus_virus_summary.tsv`, the full geNomad output directory | virus score, hallmark genes, ICTV taxonomy |
| `tables/<sample>/` | see below | EsViritu-compatible tables |
| `pipeline_info/` | `software_versions.yml`, `execution_timeline_*.html`, `execution_report_*.html`, `execution_trace_*.txt`, `pipeline_dag_*.html` | provenance of the run |

## Tables (EsViritu format)

| File | Content |
|---|---|
| `<sample>.detected_virus.info.tsv` | one row per detected contig: accession, name, taxonomy (kingdom to subspecies), `adj_taxonomy`, RPKMF, read count, covered bases, mean coverage, average read identity, consensus identity, π |
| `<sample>.detected_virus.assembly_summary.tsv` | one row per assembly (a segmented virus is one assembly) |
| `<sample>.tax_profile.tsv` | reads and RPKMF per taxon after the species / subspecies thresholds |
| `<sample>.virus_coverage_windows.tsv` | depth in 100 windows per contig |
| `<sample>_esviritu.readstats.yaml` | reads before quality filtering, before host removal, and the denominator |
| `<sample>_esviritu.params.yaml` | parameters and database version of the run |
| `<sample>_final_consensus.fasta` | copy of the consensus |

These files are the input contract of the report, so `mgviz report results/tables/*`
rebuilds it, and the tables of other EsViritu runs can be reported the same way.

## Confidence tiers and flags in the report

| Tier | Rule |
|---|---|
| High | ≥ 80 % covered, ≥ 500 reads, read identity ≥ 90 %, geNomad score ≥ 0.8 |
| Medium | ≥ 40 % covered and ≥ 50 reads |
| Low | ≥ 10 reads |
| Trace | everything else |

| Flag | Rule |
|---|---|
| DIVERGENT | taxonomy adjusted (consensus identity below the species threshold) and at least Low |
| LOW GENOMAD | ≥ 60 % covered and geNomad score < 0.6 |
| CHECK SOURCE | an animal-host virus (host-range table in `src/mgviz/static/host_range.json`) at Medium or better in a stool, nasal or clinical sample; plant viruses outside stool |
