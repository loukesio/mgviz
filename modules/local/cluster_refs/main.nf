// CLUSTER_REFS: read-sharing network between references -> one exemplar per cluster -> FASTA of the exemplars.
// Standalone: --bam S.bam --sample S --db db/ [--db_fasta refs.fna]
process CLUSTER_REFS {
    tag "$meta.id"
    label 'process_medium'
    container params.container

    input:
    tuple val(meta), path(bam), path(bai), path(ref_fasta)
    path db_meta

    output:
    tuple val(meta), path("${prefix}.${round}.clustered_refs.fasta"), emit: refs
    tuple val(meta), path("${prefix}.${round}.read_sharing.tsv"),     emit: network
    tuple val(meta), path("${prefix}.${round}.clusters.tsv"),         emit: clusters
    path "versions.yml",                                              emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    prefix = task.ext.prefix ?: "${meta.id}"
    round  = task.ext.round  ?: 'r1'
    """
    python -m mgviz.pipeline.cluster_refs --bam $bam --db-fasta $ref_fasta --db-meta $db_meta \\
        --threshold ${params.share_thresh} --sample ${meta.id} \\
        --out-fasta ${prefix}.${round}.clustered_refs.fasta \\
        --out-network ${prefix}.${round}.read_sharing.tsv --out-clusters ${prefix}.${round}.clusters.tsv

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        mgviz: \$(mgviz --version | sed "s/mgviz //")
    END_VERSIONS
    """
}

workflow {
    bam = file(params.bam, checkIfExists: true)
    ch  = Channel.of(tuple([id: params.sample], bam, file("${bam}.bai"), file(params.db_fasta ?: "${params.db}/virus_pathogen_database.fna")))
    CLUSTER_REFS(ch, file("${params.db}/virus_pathogen_database.all_metadata.tsv", checkIfExists: true))
}
