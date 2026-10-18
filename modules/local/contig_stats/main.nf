// CONTIG_STATS: covered bases, depth, read identity, nucleotide diversity and 100 coverage windows per contig.
// Standalone: --bam S.final.bam --sample S
process CONTIG_STATS {
    tag "$meta.id"
    label 'process_low'
    container params.container

    input:
    tuple val(meta), path(bam), path(bai)

    output:
    tuple val(meta), path("${prefix}.contig_stats.tsv"),          emit: stats
    tuple val(meta), path("${prefix}.virus_coverage_windows.tsv"), emit: windows
    path "versions.yml",                                           emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    prefix = task.ext.prefix ?: "${meta.id}"
    """
    python -m mgviz.pipeline.contig_stats --bam $bam --sample ${meta.id} --threads $task.cpus \\
        --out-stats ${prefix}.contig_stats.tsv --out-windows ${prefix}.virus_coverage_windows.tsv

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        mgviz: \$(mgviz --version | sed "s/mgviz //")
    END_VERSIONS
    """
}

workflow {
    bam = file(params.bam, checkIfExists: true)
    CONTIG_STATS(Channel.of(tuple([id: params.sample], bam, file("${bam}.bai"))))
}
