// MGVIZ_REPORT: one interactive HTML for the whole run from the TABLES directories plus the optional ORF tables and
// geNomad summaries, and a sample<TAB>type table from the samplesheet.
// Standalone: --sample_dirs 'results/tables/*' [--samples_tsv samples.tsv]
process MGVIZ_REPORT {
    label 'process_single'
    container params.container

    input:
    path sample_dirs
    path samples_tsv

    output:
    path "mgviz_report.html", emit: html
    path "mgviz_bundle.json", emit: json
    path "versions.yml",      emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    def st = samples_tsv.name != 'NO_FILE' ? "--samples $samples_tsv" : ""
    """
    mkdir -p project
    for d in $sample_dirs; do if [ -d "\$d" ]; then cp "\$d"/* project/; else cp "\$d" project/; fi; done
    mgviz report project -o mgviz_report.html --title "${params.title}" --json mgviz_bundle.json \\
        --run-id "${workflow.runName}" $st

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        mgviz: \$(mgviz --version | sed "s/mgviz //")
    END_VERSIONS
    """
}

workflow {
    st = params.samples_tsv ? file(params.samples_tsv) : file("${projectDir}/assets/NO_FILE")
    MGVIZ_REPORT(Channel.fromPath(params.sample_dirs, type: 'dir').collect(), st)
}
