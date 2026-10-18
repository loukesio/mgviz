// ANNOTATE: optional gene prediction (pyrodigal-gv) and geNomad scoring of the consensus genomes.
// Emits the extra per-sample files the report picks up (ORF tables, geNomad summaries).

include { PREDICT_PROTEINS } from '../../../modules/local/predict_proteins/main'
include { GENOMAD          } from '../../../modules/local/genomad/main'

workflow ANNOTATE {
    take:
    consensus    // channel: [ meta, fasta ]

    main:
    extras   = Channel.empty()
    versions = Channel.empty()
    if (params.predict_proteins) {
        PREDICT_PROTEINS(consensus)
        extras   = extras.mix(PREDICT_PROTEINS.out.tsv.map { m, f -> f })
        versions = versions.mix(PREDICT_PROTEINS.out.versions)
    }
    if (params.genomad_db) {
        GENOMAD(consensus, file(params.genomad_db, checkIfExists: true))
        extras   = extras.mix(GENOMAD.out.summary.map { m, f -> f })
        versions = versions.mix(GENOMAD.out.versions)
    }

    emit:
    extras
    versions
}
