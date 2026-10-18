// LCA_TAXONOMY: align consensus genomes back to the DB FASTA (sensitive k=11,w=10, so the .mmi is NOT used)
// and assign lineage / LCA of the best-matching assemblies. Standalone: --consensus S_final_consensus.fasta --sample S --db
process LCA_TAXONOMY {
    tag "$meta.id"
    container params.container
    input:
    tuple val(meta), path(consensus)
    path db_fasta
    path db_meta
    output:
    tuple val(meta), path("${meta.id}.adj_taxonomy.tsv"),     emit: adj
    tuple val(meta), path("${meta.id}.consensus_vs_db.paf"),  emit: paf
    script:
    """
    minimap2 -t $task.cpus -c --cs -x sr -k 11 -w 10 --secondary=yes -f 10000 -N 100 -p 0.90 -K ${params.mm_k} \\
        $db_fasta $consensus > ${meta.id}.consensus_vs_db.paf
    python -m mgviz.pipeline.lca_taxonomy --paf ${meta.id}.consensus_vs_db.paf --db-meta $db_meta \\
        --sample ${meta.id} --out ${meta.id}.adj_taxonomy.tsv
    """
}

workflow {
    LCA_TAXONOMY(Channel.of(tuple([id: params.sample], file(params.consensus, checkIfExists: true))),
                 file("${params.db}/virus_pathogen_database.fna", checkIfExists: true),
                 file("${params.db}/virus_pathogen_database.all_metadata.tsv", checkIfExists: true))
}
