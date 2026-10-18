#!/usr/bin/env nextflow
/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    loukesio/mgviz
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Virus detection from metagenomic reads with an interactive d3 report.
    Github : https://github.com/loukesio/mgviz
----------------------------------------------------------------------------------------
*/

nextflow.enable.dsl = 2

include { validateParameters; paramsSummaryLog } from 'plugin/nf-schema'
include { MGVIZ                                } from './workflows/mgviz'

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    SAMPLESHEET
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Columns: sample, fastq_1, fastq_2 (may be empty), type (optional). Relative FASTQ paths
    are resolved against the samplesheet's own directory, so the bundled test data works
    from any working directory.
*/
def readSamplesheet(path) {
    def sheet = file(path, checkIfExists: true)
    def base  = sheet.parent
    def resolve = { p -> (p.startsWith('/') || p.contains('://')) ? file(p, checkIfExists: true) : file("${base}/${p}", checkIfExists: true) }
    Channel.fromPath(sheet).splitCsv(header: true, strip: true).map { row ->
        if (!row.sample || !row.fastq_1) error "Samplesheet row without sample or fastq_1: ${row}"
        def files = row.fastq_2 ? [resolve(row.fastq_1), resolve(row.fastq_2)] : [resolve(row.fastq_1)]
        tuple([id: row.sample, single_end: !row.fastq_2, type: row.type ?: ''], files)
    }
}

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    RUN
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/
workflow {
    validateParameters()
    log.info paramsSummaryLog(workflow)

    reads = readSamplesheet(params.samplesheet)
    sample_types = reads.map { meta, f -> "${meta.id}\t${meta.type}" }.collectFile(name: 'samples.tsv', newLine: true)

    MGVIZ(reads, sample_types)
}

workflow.onComplete {
    def msg = workflow.success ? "Report: ${params.outdir}/mgviz_report.html" : "Pipeline failed, see .nextflow.log"
    log.info "-- mgviz ${workflow.manifest.version} finished in ${workflow.duration} -- ${msg}"
}
