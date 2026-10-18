"""Filter a minimap2 SAM stream to EsViritu-quality alignments.

Reads SAM on stdin, writes SAM on stdout. Keeps a mapped record when
aligned length >= min-aln-len, aligned/read length >= min-read-cov and
(aligned - NM)/aligned >= min-identity. Optionally counts the reads that
entered (primary, non-supplementary records, mapped or not) so the caller
has the abundance denominator without a second pass over the FASTQ.
"""
import argparse


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="mgviz.pipeline.filter_aln", description=__doc__.splitlines()[0])
    p.add_argument("--min-aln-len", type=int, default=100)
    p.add_argument("--min-read-cov", type=float, default=0.90)
    p.add_argument("--min-identity", type=float, default=0.80)
    p.add_argument("--count-out", help="write the number of input reads to this file")
    p.add_argument("--in", dest="inp", default="-")
    p.add_argument("--out", default="-")
    return p.parse_args(argv)


def passes(rec, min_len, min_cov, min_id):
    if rec.is_unmapped:
        return False
    aln = rec.query_alignment_length
    read_len = rec.infer_read_length() or 0
    nm = rec.get_tag("NM") if rec.has_tag("NM") else 100
    if aln < min_len or read_len == 0:
        return False
    return aln / read_len >= min_cov and (aln - nm) / aln >= min_id


def main(argv=None):
    import pysam
    a = parse_args(argv)
    n_reads = kept = 0
    with pysam.AlignmentFile(a.inp, "r") as src, pysam.AlignmentFile(a.out, "w", template=src) as dst:
        for rec in src:
            if not rec.is_secondary and not rec.is_supplementary:
                n_reads += 1
            if passes(rec, a.min_aln_len, a.min_read_cov, a.min_identity):
                dst.write(rec)
                kept += 1
    if a.count_out:
        with open(a.count_out, "w") as fh:
            fh.write(f"{n_reads}\n")


if __name__ == "__main__":
    main()
