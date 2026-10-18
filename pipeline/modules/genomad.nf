// GENOMAD: neural-network virus scoring, marker-based gene annotation and ICTV taxonomy of the consensus genomes.
// Needs the geNomad database (params.genomad_db). Standalone: --consensus S_final_consensus.fasta --sample S --genomad_db /path
process GENOMAD {
    tag "$meta.id"
    container params.container
    cpus 8
    memory '16 GB'
    input:
    tuple val(meta), path(consensus)
    path genomad_db
    output:
    tuple val(meta), path("${meta.id}_genomad/*_summary/*_virus_summary.tsv"),       emit: summary
    tuple val(meta), path("${meta.id}_genomad/*_annotate/*_genes.tsv"),              emit: genes
    path "${meta.id}_genomad"
    script:
    """
    genomad end-to-end --cleanup --threads $task.cpus --relaxed --splits ${params.genomad_splits} $consensus ${meta.id}_genomad $genomad_db
    """
}

workflow {
    GENOMAD(Channel.of(tuple([id: params.sample], file(params.consensus, checkIfExists: true))),
            file(params.genomad_db, checkIfExists: true))
}
