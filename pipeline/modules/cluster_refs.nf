// CLUSTER_REFS: read-sharing network -> exemplar assemblies -> FASTA of their records.
// Standalone: --bam S.bam --sample S --db_fasta refs.fna --db (for metadata)
process CLUSTER_REFS {
    tag "$meta.id"
    container params.container
    input:
    tuple val(meta), path(bam), path(bai), path(ref_fasta)
    path db_meta
    output:
    tuple val(meta), path("${meta.id}.${round}.clustered_refs.fasta"), emit: refs
    tuple val(meta), path("${meta.id}.${round}.read_sharing.tsv"),     emit: network
    tuple val(meta), path("${meta.id}.${round}.clusters.tsv"),         emit: clusters
    script:
    round = task.ext.round ?: 'r1'
    """
    python -m mgviz.pipeline.cluster_refs --bam $bam --db-fasta $ref_fasta --db-meta $db_meta \\
        --threshold ${params.share_thresh} --sample ${meta.id} \\
        --out-fasta ${meta.id}.${round}.clustered_refs.fasta \\
        --out-network ${meta.id}.${round}.read_sharing.tsv --out-clusters ${meta.id}.${round}.clusters.tsv
    """
}

workflow {
    bam = file(params.bam, checkIfExists: true)
    ch  = Channel.of(tuple([id: params.sample], bam, file("${bam}.bai"), file(params.db_fasta ?: "${params.db}/virus_pathogen_database.fna")))
    CLUSTER_REFS(ch, file("${params.db}/virus_pathogen_database.all_metadata.tsv", checkIfExists: true))
}
