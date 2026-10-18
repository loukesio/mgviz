// FASTP: adapter and quality trimming with duplicate removal; read counts feed the report's QC funnel.
// Standalone: nextflow run modules/local/fastp/main.nf --reads 'r_{1,2}.fq.gz' --sample S
process FASTP {
    tag "$meta.id"
    label 'process_medium'
    container params.container

    input:
    tuple val(meta), path(reads)

    output:
    tuple val(meta), path("${prefix}.trim*.fastq.gz"), emit: reads
    tuple val(meta), path("${prefix}.fastp.json"),     emit: json
    tuple val(meta), path("${prefix}.fastp.html"),     emit: html
    path "versions.yml",                               emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    def args   = task.ext.args ?: "--qualified_quality_phred 15 --dedup"
    prefix     = task.ext.prefix ?: "${meta.id}"
    def paired = meta.single_end ? "" : "-I ${reads[1]} -O ${prefix}.trim_2.fastq.gz"
    def out1   = meta.single_end ? "${prefix}.trim.fastq.gz" : "${prefix}.trim_1.fastq.gz"
    """
    fastp -i ${reads[0]} -o $out1 $paired \\
        --length_required ${params.min_read_len} $args \\
        --thread $task.cpus -j ${prefix}.fastp.json -h ${prefix}.fastp.html

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        fastp: \$(fastp --version 2>&1 | sed "s/fastp //")
    END_VERSIONS
    """
}

workflow {
    ch = Channel.fromPath(params.reads).collect().map { f -> tuple([id: params.sample, single_end: f.size() == 1], f) }
    FASTP(ch)
}
