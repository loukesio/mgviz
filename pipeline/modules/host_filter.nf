// HOST_FILTER: drop reads mapping to host / spike-in FASTA. Standalone: --reads --sample --filter_fasta
process HOST_FILTER {
    tag "$meta.id"
    container params.container
    input:
    tuple val(meta), path(reads)
    path filter_fasta
    output:
    tuple val(meta), path("${meta.id}.filt*.fastq.gz"), emit: reads
    script:
    def fq = meta.single_end ? "-0 ${meta.id}.filt.fastq.gz" : "-1 ${meta.id}.filt_1.fastq.gz -2 ${meta.id}.filt_2.fastq.gz -0 /dev/null -s /dev/null"
    """
    minimap2 -t $task.cpus -ax ${params.mm_preset} $filter_fasta $reads \\
      | samtools fastq -f 4 $fq -
    """
}

workflow {
    ch = Channel.fromPath(params.reads).collect().map { f -> tuple([id: params.sample, single_end: f.size() == 1], f) }
    HOST_FILTER(ch, file(params.filter_fasta, checkIfExists: true))
}
