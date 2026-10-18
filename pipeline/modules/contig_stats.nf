// CONTIG_STATS: breadth, depth, read identity, Pi and 100 coverage windows per contig.
// Standalone: --bam S.final.bam --sample S
process CONTIG_STATS {
    tag "$meta.id"
    container params.container
    input:
    tuple val(meta), path(bam), path(bai)
    output:
    tuple val(meta), path("${meta.id}.contig_stats.tsv"),          emit: stats
    tuple val(meta), path("${meta.id}.virus_coverage_windows.tsv"), emit: windows
    script:
    """
    python -m mgviz.pipeline.contig_stats --bam $bam --sample ${meta.id} --threads $task.cpus \\
        --out-stats ${meta.id}.contig_stats.tsv --out-windows ${meta.id}.virus_coverage_windows.tsv
    """
}

workflow {
    bam = file(params.bam, checkIfExists: true)
    CONTIG_STATS(Channel.of(tuple([id: params.sample], bam, file("${bam}.bai"))))
}
