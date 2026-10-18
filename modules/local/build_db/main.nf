// BUILD_DB: make an EsViritu-format database directory from a FASTA, an accession table and the NCBI taxdump.
// Standalone: nextflow run modules/local/build_db/main.nf --db_table accessions.tsv --db_fasta genomes.fna --db_name mydb --taxdump taxdump/
process BUILD_DB {
    tag "$name"
    label 'process_high'
    container params.container
    publishDir "${params.db_outdir}", mode: 'copy'

    input:
    val name
    path table
    path fasta
    path taxdump
    path acc2taxid

    output:
    path "${name}",      emit: db
    path "versions.yml", emit: versions

    script:
    def a2t = acc2taxid.name != 'NO_FILE' ? "--acc2taxid $acc2taxid" : ""
    """
    python -m mgviz.pipeline.db_build --table $table --fasta $fasta --taxdump $taxdump $a2t --outdir ${name}
    minimap2 -t $task.cpus -x sr -d ${name}/virus_pathogen_database.mmi ${name}/virus_pathogen_database.fna

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        minimap2: \$(minimap2 --version)
        mgviz: \$(mgviz --version | sed "s/mgviz //")
    END_VERSIONS
    """
}

workflow {
    BUILD_DB(params.db_name ?: 'custom_db', file(params.db_table, checkIfExists: true), file(params.db_fasta, checkIfExists: true),
             file(params.taxdump, checkIfExists: true),
             params.acc2taxid ? file(params.acc2taxid, checkIfExists: true) : file("${projectDir}/assets/NO_FILE"))
}
