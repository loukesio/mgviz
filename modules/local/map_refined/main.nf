// MAP_REFINED: re-align the virus-hitting reads (pairs, then singletons) to a reduced reference FASTA; used twice.
// Standalone: --reads 'S.virus_reads*.fastq.gz' --sample S --refs S.clustered_refs.fasta
process MAP_REFINED {
    tag "$meta.id"
    label 'process_high'
    container params.container

    input:
    tuple val(meta), path(reads), path(refs)

    output:
    tuple val(meta), path("${prefix}.${round}.bam"), path("${prefix}.${round}.bam.bai"), emit: bam
    path "versions.yml",                                                                emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    def args = task.ext.args ?: "--secondary=yes --secondary-seq --MD -f 10000 -N 100 -p 0.90"
    prefix   = task.ext.prefix ?: "${meta.id}"
    round    = task.ext.round  ?: 'refined'
    def files   = reads instanceof List ? reads : [reads]
    def pairs   = files.findAll { it.name ==~ /.*_[12]\.fastq\.gz/ }.sort { it.name }
    def singles = files.findAll { !(it.name ==~ /.*_[12]\.fastq\.gz/) }
    def runs = []
    if (pairs.size() == 2) runs << pairs.join(' ')
    singles.each { runs << it.toString() }
    def filt = "python -m mgviz.pipeline.filter_aln --min-aln-len ${params.min_aln_len} --min-read-cov ${params.min_read_cov} --min-identity ${params.min_identity}"
    def cmds = runs.withIndex().collect { r, i ->
        "minimap2 -t $task.cpus -ax ${params.mm_preset} $args -K ${params.mm_k} $refs $r | $filt | samtools sort -@ $task.cpus -o part${i}.bam -"
    }.join('\n    ')
    """
    $cmds
    samtools merge -f -@ $task.cpus ${prefix}.${round}.bam part*.bam
    samtools index ${prefix}.${round}.bam

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        minimap2: \$(minimap2 --version)
        samtools: \$(samtools --version | head -1 | sed "s/samtools //")
        mgviz: \$(mgviz --version | sed "s/mgviz //")
    END_VERSIONS
    """
}

workflow {
    ch = Channel.fromPath(params.reads).collect().map { f -> tuple([id: params.sample], f, file(params.refs, checkIfExists: true)) }
    MAP_REFINED(ch)
}
