// CONSENSUS: samtools consensus of the final BAM, records renamed <Accession>_<sample>_consensus.
// Standalone: --bam S.final.bam --sample S
process CONSENSUS {
    tag "$meta.id"
    container params.container
    input:
    tuple val(meta), path(bam), path(bai)
    output:
    tuple val(meta), path("${meta.id}_final_consensus.fasta"), emit: fasta
    script:
    """
    samtools consensus -m simple -q -c 0.51 $bam \\
      | python -m mgviz.pipeline.rename_consensus --sample ${meta.id} > ${meta.id}_final_consensus.fasta
    """
}

workflow {
    bam = file(params.bam, checkIfExists: true)
    CONSENSUS(Channel.of(tuple([id: params.sample], bam, file("${bam}.bai"))))
}
