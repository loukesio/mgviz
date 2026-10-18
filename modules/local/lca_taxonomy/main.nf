// LCA_TAXONOMY: align the consensus genomes back to the database FASTA (sensitive k=11, w=10, so the .mmi is not used)
// and assign the lineage / lowest common ancestor of the best-matching assemblies.
// Standalone: --consensus S_final_consensus.fasta --sample S --db db/
process LCA_TAXONOMY {
    tag "$meta.id"
    label 'process_medium'
    container params.container

    input:
    tuple val(meta), path(consensus)
    path db_fasta
    path db_meta

    output:
    tuple val(meta), path("${prefix}.adj_taxonomy.tsv"),    emit: adj
    tuple val(meta), path("${prefix}.consensus_vs_db.paf"), emit: paf
    path "versions.yml",                                    emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    def args = task.ext.args ?: "-c --cs -x sr -k 11 -w 10 --secondary=yes -f 10000 -N 100 -p 0.90"
    prefix   = task.ext.prefix ?: "${meta.id}"
    """
    minimap2 -t $task.cpus $args -K ${params.mm_k} $db_fasta $consensus > ${prefix}.consensus_vs_db.paf
    python -m mgviz.pipeline.lca_taxonomy --paf ${prefix}.consensus_vs_db.paf --db-meta $db_meta \\
        --sample ${meta.id} --out ${prefix}.adj_taxonomy.tsv

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        minimap2: \$(minimap2 --version)
        mgviz: \$(mgviz --version | sed "s/mgviz //")
    END_VERSIONS
    """
}

workflow {
    LCA_TAXONOMY(Channel.of(tuple([id: params.sample], file(params.consensus, checkIfExists: true))),
                 file("${params.db}/virus_pathogen_database.fna", checkIfExists: true),
                 file("${params.db}/virus_pathogen_database.all_metadata.tsv", checkIfExists: true))
}
