// PREDICT_PROTEINS: pyrodigal-gv gene calls on the consensus genomes. Standalone: --consensus S_final_consensus.fasta --sample S
process PREDICT_PROTEINS {
    tag "$meta.id"
    container params.container
    input:
    tuple val(meta), path(consensus)
    output:
    tuple val(meta), path("${meta.id}.proteins.faa"), emit: faa
    tuple val(meta), path("${meta.id}.orfs.tsv"),     emit: tsv
    path "${meta.id}.genes.gff"
    script:
    """
    python -m mgviz.pipeline.predict_proteins --consensus $consensus --sample ${meta.id} \\
        --out-gff ${meta.id}.genes.gff --out-faa ${meta.id}.proteins.faa --out-tsv ${meta.id}.orfs.tsv
    """
}

workflow {
    PREDICT_PROTEINS(Channel.of(tuple([id: params.sample], file(params.consensus, checkIfExists: true))))
}
