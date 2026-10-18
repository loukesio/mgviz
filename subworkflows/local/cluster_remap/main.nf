// CLUSTER_REMAP: EsViritu's two rounds of read-sharing clustering, each followed by re-alignment of the
// virus-hitting reads to the surviving exemplars. The second-round alignment is the final one.

include { CLUSTER_REFS as CLUSTER_R1 } from '../../../modules/local/cluster_refs/main'
include { CLUSTER_REFS as CLUSTER_R2 } from '../../../modules/local/cluster_refs/main'
include { MAP_REFINED  as MAP_R2     } from '../../../modules/local/map_refined/main'
include { MAP_REFINED  as MAP_R3     } from '../../../modules/local/map_refined/main'

workflow CLUSTER_REMAP {
    take:
    bam          // channel: [ meta, bam, bai ] from MAP_INITIAL
    virus_reads  // channel: [ meta, [fastq] ]
    db_fasta     // path
    db_meta      // path

    main:
    CLUSTER_R1(bam.map { m, b, i -> tuple(m, b, i, db_fasta) }, db_meta)
    MAP_R2(virus_reads.join(CLUSTER_R1.out.refs))
    CLUSTER_R2(MAP_R2.out.bam.join(CLUSTER_R1.out.refs), db_meta)
    MAP_R3(virus_reads.join(CLUSTER_R2.out.refs))

    emit:
    bam      = MAP_R3.out.bam
    refs     = CLUSTER_R2.out.refs
    versions = CLUSTER_R1.out.versions.mix(MAP_R2.out.versions, CLUSTER_R2.out.versions, MAP_R3.out.versions)
}
