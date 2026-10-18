// GENOMAD: neural-network virus score, marker-based gene annotation and ICTV taxonomy of the consensus genomes.
// Standalone: --consensus S_final_consensus.fasta --sample S --genomad_db /path
process GENOMAD {
    tag "$meta.id"
    label 'process_high'
    container params.container

    input:
    tuple val(meta), path(consensus)
    path genomad_db

    output:
    tuple val(meta), path("${prefix}_genomad/*_summary/*_virus_summary.tsv"), emit: summary
    tuple val(meta), path("${prefix}_genomad/*_annotate/*_genes.tsv"),        emit: genes
    tuple val(meta), path("${prefix}_genomad"),                                emit: dir
    path "versions.yml",                                                       emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    def args = task.ext.args ?: "--cleanup --relaxed"
    prefix   = task.ext.prefix ?: "${meta.id}"
    """
    genomad end-to-end $args --threads $task.cpus --splits ${params.genomad_splits} $consensus ${prefix}_genomad $genomad_db

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        genomad: \$(genomad --version | sed "s/.*version //")
    END_VERSIONS
    """
}

workflow {
    GENOMAD(Channel.of(tuple([id: params.sample], file(params.consensus, checkIfExists: true))),
            file(params.genomad_db, checkIfExists: true))
}
