// MGVIZ_REPORT: one interactive HTML for the whole project; input is the TABLES directories plus optional
// ORF tables and geNomad summaries, and a sample<TAB>type table from the samplesheet.
// Standalone: --sample_dirs 'results/tables/*' [--samples_tsv samples.tsv]
process MGVIZ_REPORT {
    container params.container
    input:
    path sample_dirs
    path samples_tsv
    output:
    path "mgviz_report.html"
    path "mgviz_bundle.json"
    script:
    def st = samples_tsv.name != 'NO_FILE' ? "--samples $samples_tsv" : ""
    """
    mkdir -p project
    for d in $sample_dirs; do if [ -d "\$d" ]; then cp "\$d"/* project/; else cp "\$d" project/; fi; done
    mgviz report project -o mgviz_report.html --title "${params.title}" --json mgviz_bundle.json \\
        --run-id "${workflow.runName}" $st
    """
}

workflow {
    st = params.samples_tsv ? file(params.samples_tsv) : file("${projectDir}/assets/NO_FILE")
    MGVIZ_REPORT(Channel.fromPath(params.sample_dirs, type: 'dir').collect(), st)
}
