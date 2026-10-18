// FASTP: adapter/quality trimming and dedup. Standalone: nextflow run modules/fastp.nf --reads 'r_{1,2}.fq.gz' --sample S
process FASTP {
    tag "$meta.id"
    container params.container
    input:
    tuple val(meta), path(reads)
    output:
    tuple val(meta), path("${meta.id}.trim*.fastq.gz"), emit: reads
    tuple val(meta), path("${meta.id}.fastp.json"),     emit: json
    path "${meta.id}.fastp.html"
    script:
    def paired = meta.single_end ? "" : "-I ${reads[1]} -O ${meta.id}.trim_2.fastq.gz"
    def out1   = meta.single_end ? "${meta.id}.trim.fastq.gz" : "${meta.id}.trim_1.fastq.gz"
    """
    fastp -i ${reads[0]} -o $out1 $paired \\
        --length_required ${params.min_read_len} --qualified_quality_phred 15 --dedup \\
        --thread $task.cpus -j ${meta.id}.fastp.json -h ${meta.id}.fastp.html
    """
}

workflow {
    ch = Channel.fromPath(params.reads).collect().map { f -> tuple([id: params.sample, single_end: f.size() == 1], f) }
    FASTP(ch)
}
