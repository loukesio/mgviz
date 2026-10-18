// CONSENSUS: samtools consensus of the final alignment; records renamed <Accession>_<sample>_consensus.
// Standalone: --bam S.final.bam --sample S
process CONSENSUS {
    tag "$meta.id"
    label 'process_low'
    container params.container

    input:
    tuple val(meta), path(bam), path(bai)

    output:
    tuple val(meta), path("${prefix}_final_consensus.fasta"), emit: fasta
    path "versions.yml",                                      emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    def args = task.ext.args ?: "-m simple -q -c 0.51"
    prefix   = task.ext.prefix ?: "${meta.id}"
    """
    samtools consensus $args $bam \\
      | python -m mgviz.pipeline.rename_consensus --sample ${meta.id} > ${prefix}_final_consensus.fasta

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        samtools: \$(samtools --version | head -1 | sed "s/samtools //")
        mgviz: \$(mgviz --version | sed "s/mgviz //")
    END_VERSIONS
    """
}

workflow {
    bam = file(params.bam, checkIfExists: true)
    CONSENSUS(Channel.of(tuple([id: params.sample], bam, file("${bam}.bai"))))
}
