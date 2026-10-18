// PREDICT_PROTEINS: pyrodigal-gv gene calls on the consensus genomes.
// Standalone: --consensus S_final_consensus.fasta --sample S
process PREDICT_PROTEINS {
    tag "$meta.id"
    label 'process_low'
    container params.container

    input:
    tuple val(meta), path(consensus)

    output:
    tuple val(meta), path("${prefix}.proteins.faa"), emit: faa
    tuple val(meta), path("${prefix}.orfs.tsv"),     emit: tsv
    tuple val(meta), path("${prefix}.genes.gff"),    emit: gff
    path "versions.yml",                             emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    prefix = task.ext.prefix ?: "${meta.id}"
    """
    python -m mgviz.pipeline.predict_proteins --consensus $consensus --sample ${meta.id} \\
        --out-gff ${prefix}.genes.gff --out-faa ${prefix}.proteins.faa --out-tsv ${prefix}.orfs.tsv

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        pyrodigal-gv: \$(python -c "import pyrodigal_gv, sys; print(pyrodigal_gv.__version__)")
        mgviz: \$(mgviz --version | sed "s/mgviz //")
    END_VERSIONS
    """
}

workflow {
    PREDICT_PROTEINS(Channel.of(tuple([id: params.sample], file(params.consensus, checkIfExists: true))))
}
