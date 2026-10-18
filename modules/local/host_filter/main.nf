// HOST_FILTER: drop reads that map to a host or spike-in FASTA.
// Standalone: --reads 'r_{1,2}.fq.gz' --sample S --filter_fasta host.fna
process HOST_FILTER {
    tag "$meta.id"
    label 'process_high'
    container params.container

    input:
    tuple val(meta), path(reads)
    path filter_fasta

    output:
    tuple val(meta), path("${prefix}.filt*.fastq.gz"), emit: reads
    path "versions.yml",                               emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    prefix = task.ext.prefix ?: "${meta.id}"
    def fq = meta.single_end ? "-0 ${prefix}.filt.fastq.gz" : "-1 ${prefix}.filt_1.fastq.gz -2 ${prefix}.filt_2.fastq.gz -0 /dev/null -s /dev/null"
    """
    minimap2 -t $task.cpus -ax ${params.mm_preset} $filter_fasta $reads \\
      | samtools fastq -f 4 $fq -

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        minimap2: \$(minimap2 --version)
        samtools: \$(samtools --version | head -1 | sed "s/samtools //")
    END_VERSIONS
    """
}

workflow {
    ch = Channel.fromPath(params.reads).collect().map { f -> tuple([id: params.sample, single_end: f.size() == 1], f) }
    HOST_FILTER(ch, file(params.filter_fasta, checkIfExists: true))
}
