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

include { validateParameters; paramsSummaryLog; paramsHelp } from 'plugin/nf-schema'
include { MGVIZ                                } from './workflows/mgviz'

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    SAMPLESHEET
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Columns: sample, fastq_1, fastq_2 (may be empty), type (optional). Relative FASTQ paths
    are resolved against the samplesheet's own directory, so the bundled test data works
    from any working directory.
*/
def resolvePath(base, p) {
    return (p.startsWith('/') || p.contains('://')) ? file(p, checkIfExists: true) : file("${base}/${p}", checkIfExists: true)
}

def readSamplesheet(path) {
    def sheet = file(path, checkIfExists: true)
    def base  = sheet.parent
    return Channel.fromPath(sheet).splitCsv(header: true, strip: true).map { row ->
        if (!row.sample || !row.fastq_1) error "Samplesheet row without sample or fastq_1: ${row}"
        def files = row.fastq_2 ? [resolvePath(base, row.fastq_1), resolvePath(base, row.fastq_2)] : [resolvePath(base, row.fastq_1)]
        tuple([id: row.sample, single_end: !row.fastq_2, type: row.type ?: ''], files)
    }
}

def schemaHelp() {
    def schema = new groovy.json.JsonSlurper().parse(file("${projectDir}/nextflow_schema.json"))
    def lines = ["", "Typical pipeline command:", "", "  nextflow run loukesio/mgviz -profile docker --samplesheet samples.csv --db db/v3.2.4 --outdir results", ""]
    schema['$defs'].each { name, group ->
        def shown = group.properties.findAll { k, v -> !v.hidden }
        if (!shown) return
        lines << group.title
        shown.each { k, v -> lines << String.format("  --%-18s %-9s %s%s", k, "[${v.type}]", v.description ?: '', v.default != null ? " [default: ${v.default}]" : '') }
        lines << ""
    }
    return lines.join("\n")
}

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    RUN
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/
workflow {
    if (params.help) {
        // nf-schema prints the help on the Nextflow versions it recognises; otherwise print it from the schema
        try { log.info paramsHelp("nextflow run loukesio/mgviz -profile docker --samplesheet samples.csv --db db/v3.2.4 --outdir results") }
        catch (Exception e) { log.info schemaHelp() }
        exit 0
    }
    validateParameters()
    log.info paramsSummaryLog(workflow)

    reads = readSamplesheet(params.samplesheet)
    sample_types = reads.map { meta, f -> "${meta.id}\t${meta.type}" }.collectFile(name: 'samples.tsv', newLine: true)

    MGVIZ(reads, sample_types)
    MGVIZ.out.report.subscribe { f -> log.info "Report written: ${params.outdir}/${f.name}" }
}
