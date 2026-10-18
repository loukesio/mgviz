// BUILD_DB: make an EsViritu-format database directory from a FASTA + accession table.
// Standalone: nextflow run modules/build_db.nf --db_table accessions.tsv --db_fasta genomes.fna --db_name mydb
process BUILD_DB {
    tag "$name"
    container params.container
    cpus 8
    memory '16 GB'
    publishDir "${params.db_outdir}", mode: 'copy'
    input:
    val name
    path table
    path fasta
    path taxdump
    path acc2taxid
    output:
    path "${name}", emit: db
    script:
    def a2t = acc2taxid.name != 'NO_FILE' ? "--acc2taxid $acc2taxid" : ""
    """
    python -m mgviz.pipeline.db_build --table $table --fasta $fasta --taxdump $taxdump $a2t --outdir ${name}
    minimap2 -t $task.cpus -x sr -d ${name}/virus_pathogen_database.mmi ${name}/virus_pathogen_database.fna
    """
}

workflow {
    BUILD_DB(params.db_name ?: 'custom_db', file(params.db_table, checkIfExists: true), file(params.db_fasta, checkIfExists: true),
             file(params.taxdump, checkIfExists: true),
             params.acc2taxid ? file(params.acc2taxid, checkIfExists: true) : file("${projectDir}/assets/NO_FILE"))
}
