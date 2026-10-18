#!/usr/bin/env nextflow
nextflow.enable.dsl = 2

/*
 * mgviz virus-detection pipeline: every EsViritu step is its own process (see modules/),
 * each runnable on its own; this file only wires them together.
 * Input: samplesheet CSV with columns  sample,fastq_1,fastq_2[,type]  (fastq_2 may be empty;
 *        type is one of stool, nasal, wastewater, clinical and only labels the report).
 */

include { FASTP                          } from './modules/fastp'
include { HOST_FILTER                    } from './modules/host_filter'
include { MAP_INITIAL                    } from './modules/map_initial'
include { CLUSTER_REFS as CLUSTER_R1     } from './modules/cluster_refs'
include { CLUSTER_REFS as CLUSTER_R2     } from './modules/cluster_refs'
include { MAP_REFINED  as MAP_R2         } from './modules/map_refined'
include { MAP_REFINED  as MAP_R3         } from './modules/map_refined'
include { CONSENSUS                      } from './modules/consensus'
include { CONTIG_STATS                   } from './modules/contig_stats'
include { LCA_TAXONOMY                   } from './modules/lca_taxonomy'
include { TABLES                         } from './modules/tables'
include { PREDICT_PROTEINS               } from './modules/predict_proteins'
include { GENOMAD                        } from './modules/genomad'
include { MGVIZ_REPORT                   } from './modules/mgviz_report'

workflow {
    if (!params.samplesheet) error "Provide --samplesheet samples.csv"
    if (!params.db)          error "Provide --db /path/to/virus_db (fna + mmi + all_metadata.tsv)"

    db_fasta = file("${params.db}/virus_pathogen_database.fna", checkIfExists: true)
    db_index = file("${params.db}/virus_pathogen_database.mmi", checkIfExists: true)
    db_meta  = file("${params.db}/virus_pathogen_database.all_metadata.tsv", checkIfExists: true)
    no_file  = file("${projectDir}/assets/NO_FILE")

    reads = Channel.fromPath(params.samplesheet).splitCsv(header: true).map { row ->
        def files = row.fastq_2 ? [file(row.fastq_1), file(row.fastq_2)] : [file(row.fastq_1)]
        tuple([id: row.sample, single_end: !row.fastq_2], files)
    }

    // 1. QC
    FASTP(reads)
    clean = FASTP.out.reads
    if (params.filter_fasta) {
        HOST_FILTER(clean, file(params.filter_fasta, checkIfExists: true))
        clean = HOST_FILTER.out.reads
    }

    // 2. alignment to the full DB
    MAP_INITIAL(clean, db_index)

    // 3./4. two rounds of read-sharing clustering + re-alignment (as EsViritu does)
    CLUSTER_R1(MAP_INITIAL.out.bam.map { m, b, i -> tuple(m, b, i, db_fasta) }, db_meta)
    MAP_R2(MAP_INITIAL.out.virus_reads.join(CLUSTER_R1.out.refs))
    CLUSTER_R2(MAP_R2.out.bam.join(CLUSTER_R1.out.refs), db_meta)
    MAP_R3(MAP_INITIAL.out.virus_reads.join(CLUSTER_R2.out.refs))

    // 5.-7. consensus, stats, taxonomy, tables
    CONSENSUS(MAP_R3.out.bam)
    CONTIG_STATS(MAP_R3.out.bam)
    LCA_TAXONOMY(CONSENSUS.out.fasta, db_fasta, db_meta)
    extras = Channel.empty()
    if (params.predict_proteins) { PREDICT_PROTEINS(CONSENSUS.out.fasta); extras = extras.mix(PREDICT_PROTEINS.out.tsv.map { m, f -> f }) }
    if (params.genomad_db)       { GENOMAD(CONSENSUS.out.fasta, file(params.genomad_db, checkIfExists: true)); extras = extras.mix(GENOMAD.out.summary.map { m, f -> f }) }
    TABLES(
        CONTIG_STATS.out.stats.join(CONTIG_STATS.out.windows).join(LCA_TAXONOMY.out.adj)
            .join(MAP_INITIAL.out.readcount).join(CONSENSUS.out.fasta).join(FASTP.out.json),
        db_meta
    )

    // 8. report
    sample_types = Channel.fromPath(params.samplesheet).splitCsv(header: true)
        .map { row -> "${row.sample}\t${row.type ?: ''}" }
        .collectFile(name: 'samples.tsv', newLine: true)
    MGVIZ_REPORT(TABLES.out.dir.map { m, d -> d }.mix(extras).collect(), sample_types)
}
