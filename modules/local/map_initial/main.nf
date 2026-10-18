// MAP_INITIAL: align every read to the virus database with EsViritu's minimap2 flags, keep secondary hits,
// filter alignments, count the reads entering (the RPKMF denominator) and extract the virus-hitting reads
// (pairs + singletons) for re-alignment. Standalone: --reads 'r_{1,2}.fq.gz' --sample S --db db/
process MAP_INITIAL {
    tag "$meta.id"
    label 'process_high'
    container params.container

    input:
    tuple val(meta), path(reads)
    path db_index

    output:
    tuple val(meta), path("${prefix}.initial.bam"), path("${prefix}.initial.bam.bai"), emit: bam
    tuple val(meta), path("${prefix}.virus_reads*.fastq.gz"),                          emit: virus_reads
    tuple val(meta), path("${prefix}.readcount.txt"),                                  emit: readcount
    path "versions.yml",                                                               emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    def args = task.ext.args ?: "--secondary=yes --secondary-seq --MD -f 10000 -N 100 -p 0.90"
    prefix   = task.ext.prefix ?: "${meta.id}"
    def extract = meta.single_end
        ? "samtools fastq -F 4 -n -0 ${prefix}.virus_reads.fastq.gz ${prefix}.initial.bam"
        : "samtools collate -u -O ${prefix}.initial.bam | samtools fastq -F 4 -n -1 ${prefix}.virus_reads_1.fastq.gz -2 ${prefix}.virus_reads_2.fastq.gz -s ${prefix}.virus_reads_s.fastq.gz -0 /dev/null -"
    """
    minimap2 -t $task.cpus -ax ${params.mm_preset} $args -K ${params.mm_k} $db_index $reads \\
      | python -m mgviz.pipeline.filter_aln --min-aln-len ${params.min_aln_len} \\
            --min-read-cov ${params.min_read_cov} --min-identity ${params.min_identity} \\
            --count-out ${prefix}.readcount.txt \\
      | samtools sort -@ $task.cpus -o ${prefix}.initial.bam -
    samtools index ${prefix}.initial.bam
    $extract

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        minimap2: \$(minimap2 --version)
        samtools: \$(samtools --version | head -1 | sed "s/samtools //")
        mgviz: \$(mgviz --version | sed "s/mgviz //")
    END_VERSIONS
    """
}

workflow {
    ch = Channel.fromPath(params.reads).collect().map { f -> tuple([id: params.sample, single_end: f.size() == 1], f) }
    MAP_INITIAL(ch, file("${params.db}/virus_pathogen_database.mmi", checkIfExists: true))
}
