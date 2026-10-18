# loukesio/mgviz: Usage

## Samplesheet

The pipeline takes a CSV samplesheet with one row per sample:

```csv
sample,fastq_1,fastq_2,type
stool_S01,/data/stool_S01_R1.fastq.gz,/data/stool_S01_R2.fastq.gz,stool
nasal_N01,/data/nasal_N01.fastq.gz,,nasal
wastewater_W01,reads/wastewater_W01_R1.fastq.gz,reads/wastewater_W01_R2.fastq.gz,wastewater
```

| Column | Description |
|---|---|
| `sample` | Sample name without spaces. It names every output file and appears in the report. |
| `fastq_1` | Gzipped FASTQ, reads 1 or single-end reads. |
| `fastq_2` | Gzipped FASTQ, reads 2. Leave empty for single-end data. |
| `type` | Optional: `stool`, `nasal`, `wastewater` or `clinical`. Groups samples in the report. Inferred from the sample name prefix when absent (`stool_S01` → stool). |

Relative FASTQ paths are resolved against the samplesheet's own directory. The
samplesheet is validated against `assets/schema_input.json` before anything runs.

## Running the pipeline

```bash
nextflow run loukesio/mgviz -profile docker \
    --samplesheet samples.csv --db db/v3.2.4 --genomad_db db/genomad_db --outdir results
```

Nextflow caches every task; add `-resume` to continue an interrupted run. Keep
parameters in a YAML file and pass it with `-params-file params.yml` to make runs
reproducible:

```yaml
samplesheet: samples.csv
db: db/v3.2.4
genomad_db: db/genomad_db
outdir: results
title: 'Wastewater survey 2026'
```

Every parameter is documented by `nextflow run loukesio/mgviz --help`
(`--helpFull` includes the hidden ones).

### Reproducibility

Pin a release so a run can be repeated later:

```bash
nextflow run loukesio/mgviz -r v0.1.0 -profile docker ...
```

The image used by every process is `ghcr.io/loukesio/mgviz:<version>`; tool
versions used by each run are written to `<outdir>/pipeline_info/software_versions.yml`.

## Databases

| Parameter | Content | Source |
|---|---|---|
| `--db` | EsViritu-format virus database: `virus_pathogen_database.fna`, `.mmi`, `.all_metadata.tsv` | [Zenodo 10.5281/zenodo.17716199](https://doi.org/10.5281/zenodo.17716199) |
| `--genomad_db` | geNomad database | `genomad download-database <dir>` |
| `--filter_fasta` | host or spike-in genome | any FASTA |

Build a custom database in the same format with the standalone `BUILD_DB` module:

```bash
nextflow run modules/local/build_db/main.nf -profile docker \
    --db_fasta genomes.fna --db_table accessions.tsv --db_name mydb \
    --taxdump taxdump/ --acc2taxid nucl_gb.accession2taxid.gz --db_outdir db
```

## Profiles

| Profile | Purpose |
|---|---|
| `docker`, `singularity`, `apptainer`, `conda` | software provisioning |
| `local`, `slurm` | executors |
| `test` | bundled test data (`assets/test_data/`) |
| `laptop` | Docker Desktop with a small VM; native arm64 image on Apple silicon |
| `debug` | extra logging, no cleanup |

Profiles combine: `-profile test,docker`, `-profile singularity,slurm`.

## Resources

Processes carry the labels `process_single`, `process_low`, `process_medium` and
`process_high`; `conf/base.config` maps them to CPUs, memory and time, doubled on
each retry and capped by `process.resourceLimits`. Override the limits or any
process in a custom config:

```groovy
// custom.config, passed with -c custom.config
process {
    resourceLimits = [ cpus: 32, memory: '128.GB', time: '72.h' ]
    withName: 'MAP_INITIAL' { cpus = 16; memory = '48.GB' }
    withName: 'FASTP'       { ext.args = '--qualified_quality_phred 20 --dedup' }
}
```

`ext.args` replaces a tool's default flags (see `conf/modules.config` and each
module's `main.nf`); `ext.prefix` changes the output file prefix.

## Running one step at a time

Every module has an entry workflow for standalone use on existing files:

```bash
nextflow run modules/local/fastp/main.nf        -profile docker --reads 'S_R{1,2}.fastq.gz' --sample S
nextflow run modules/local/map_initial/main.nf  -profile docker --reads 'S.trim_{1,2}.fastq.gz' --sample S --db db/v3.2.4
nextflow run modules/local/cluster_refs/main.nf -profile docker --bam S.initial.bam --sample S --db db/v3.2.4
nextflow run modules/local/consensus/main.nf    -profile docker --bam S.final.bam --sample S
nextflow run modules/local/genomad/main.nf      -profile docker --consensus S_final_consensus.fasta --sample S --genomad_db db/genomad_db
nextflow run modules/local/mgviz_report/main.nf -profile docker --sample_dirs 'results/tables/*' --samples_tsv samples.tsv
```

## Report without the pipeline

```bash
pip install git+https://github.com/loukesio/mgviz
mgviz report path/to/esviritu_output --samples samples.tsv --run-id run42 -o report.html
```

See the README for what the report shows.
