/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    MGVIZ workflow: QC -> mapping -> read-sharing clustering (x2) -> consensus -> statistics,
    taxonomy, annotation -> tables -> report. Every step is a module in modules/local/.
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/

include { FASTP            } from '../modules/local/fastp/main'
include { HOST_FILTER      } from '../modules/local/host_filter/main'
include { MAP_INITIAL      } from '../modules/local/map_initial/main'
include { CLUSTER_REMAP    } from '../subworkflows/local/cluster_remap/main'
include { CONSENSUS        } from '../modules/local/consensus/main'
include { CONTIG_STATS     } from '../modules/local/contig_stats/main'
include { LCA_TAXONOMY     } from '../modules/local/lca_taxonomy/main'
include { ANNOTATE         } from '../subworkflows/local/annotate/main'
include { TABLES           } from '../modules/local/tables/main'
include { MGVIZ_REPORT     } from '../modules/local/mgviz_report/main'

workflow MGVIZ {
    take:
    reads           // channel: [ meta, [fastq] ]
    sample_types    // path: sample<TAB>type

    main:
    db_fasta = file("${params.db}/virus_pathogen_database.fna", checkIfExists: true)
    db_index = file("${params.db}/virus_pathogen_database.mmi", checkIfExists: true)
    db_meta  = file("${params.db}/virus_pathogen_database.all_metadata.tsv", checkIfExists: true)
    no_file  = file("${projectDir}/assets/NO_FILE")
    versions = Channel.empty()

    // 1. QC
    FASTP(reads)
    versions = versions.mix(FASTP.out.versions)
    clean = FASTP.out.reads
    if (params.filter_fasta) {
        HOST_FILTER(clean, file(params.filter_fasta, checkIfExists: true))
        versions = versions.mix(HOST_FILTER.out.versions)
        clean = HOST_FILTER.out.reads
    }

    // 2. alignment to the full database
    MAP_INITIAL(clean, db_index)
    versions = versions.mix(MAP_INITIAL.out.versions)

    // 3. two rounds of read-sharing clustering and re-alignment
    CLUSTER_REMAP(MAP_INITIAL.out.bam, MAP_INITIAL.out.virus_reads, db_fasta, db_meta)
    versions = versions.mix(CLUSTER_REMAP.out.versions)

    // 4. consensus, statistics, taxonomy
    CONSENSUS(CLUSTER_REMAP.out.bam)
    CONTIG_STATS(CLUSTER_REMAP.out.bam)
    LCA_TAXONOMY(CONSENSUS.out.fasta, db_fasta, db_meta)
    versions = versions.mix(CONSENSUS.out.versions, CONTIG_STATS.out.versions, LCA_TAXONOMY.out.versions)

    // 5. optional annotation: proteins and geNomad
    ANNOTATE(CONSENSUS.out.fasta)
    versions = versions.mix(ANNOTATE.out.versions)

    // 6. per-sample tables
    TABLES(
        CONTIG_STATS.out.stats.join(CONTIG_STATS.out.windows).join(LCA_TAXONOMY.out.adj)
            .join(MAP_INITIAL.out.readcount).join(CONSENSUS.out.fasta).join(FASTP.out.json),
        db_meta
    )
    versions = versions.mix(TABLES.out.versions)

    // 7. report
    MGVIZ_REPORT(TABLES.out.dir.map { m, d -> d }.mix(ANNOTATE.out.extras).collect(), sample_types)
    versions = versions.mix(MGVIZ_REPORT.out.versions)

    versions.unique().collectFile(name: 'software_versions.yml', storeDir: "${params.outdir}/pipeline_info")

    emit:
    report   = MGVIZ_REPORT.out.html
    bundle   = MGVIZ_REPORT.out.json
    versions
}
