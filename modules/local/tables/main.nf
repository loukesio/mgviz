// TABLES: EsViritu-compatible per-sample tables and the readstats / params YAML, in a directory named after the sample.
// Standalone: --stats --windows --adj --readcount --consensus --sample --db [--fastp_json]
process TABLES {
    tag "$meta.id"
    label 'process_single'
    container params.container

    input:
    tuple val(meta), path(stats), path(windows), path(adj), path(readcount), path(consensus), path(fastp_json)
    path db_meta

    output:
    tuple val(meta), path("${meta.id}"), emit: dir
    path "versions.yml",                 emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    def fj = fastp_json.name != 'NO_FILE' ? "--fastp-json $fastp_json" : ""
    """
    mkdir -p ${meta.id}
    python -m mgviz.pipeline.tables --sample ${meta.id} --stats $stats --adj $adj --readcount $readcount $fj \\
        --db-meta $db_meta --sp-thresh ${params.sp_thresh} --subsp-thresh ${params.subsp_thresh} \\
        --params-json '${groovy.json.JsonOutput.toJson(params.findAll { k, v -> !(v instanceof Map) })}' \\
        --db-version "\$(basename ${params.db})" --outdir ${meta.id}
    cp $consensus ${meta.id}/
    cp $windows ${meta.id}/${meta.id}.virus_coverage_windows.tsv

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        mgviz: \$(mgviz --version | sed "s/mgviz //")
    END_VERSIONS
    """
}

workflow {
    fj = params.fastp_json ? file(params.fastp_json) : file("${projectDir}/assets/NO_FILE")
    ch = Channel.of(tuple([id: params.sample], file(params.stats), file(params.windows), file(params.adj),
                          file(params.readcount), file(params.consensus), fj))
    TABLES(ch, file("${params.db}/virus_pathogen_database.all_metadata.tsv", checkIfExists: true))
}
