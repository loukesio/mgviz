"""Per-contig coverage, read identity, nucleotide diversity and 100 coverage windows from a BAM.

Primary alignments only. Per-base depth and base counts come from
pysam.count_coverage (quality threshold 0); Pi per covered position is
(total - majority)/total, averaged over covered positions, as in EsViritu.
"""
import argparse
from concurrent.futures import ProcessPoolExecutor

from ._common import read_identity, write_tsv, log

STAT_COLS = ["Accession", "contig_length", "covered_bases", "read_count", "mean_coverage", "Pi",
             "avg_read_identity", "avg_align_len"]
WIN_COLS = ["Accession", "window_index", "window_start", "window_end", "average_coverage"]


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="mgviz.pipeline.contig_stats", description=__doc__.splitlines()[0])
    p.add_argument("--bam", required=True)
    p.add_argument("--sample", required=True)
    p.add_argument("--threads", type=int, default=1)
    p.add_argument("--out-stats", required=True)
    p.add_argument("--out-windows", required=True)
    return p.parse_args(argv)


def contig_windows(depth):
    n = len(depth)
    size = max(1, n // 100)
    out = []
    for i in range(100):
        start = i * size
        if start >= n:
            break
        end = n if i == 99 else min((i + 1) * size, n)
        seg = depth[start:end]
        out.append({"window_index": i, "window_start": start, "window_end": end,
                    "average_coverage": (sum(seg) / len(seg)) if seg else 0.0})
    return out


def _batch(args):
    import pysam
    bam_path, contigs = args
    stats, wins = [], []
    with pysam.AlignmentFile(bam_path, "rb") as bam:
        for c in contigs:
            n = bam.get_reference_length(c)
            reads = [r for r in bam.fetch(c) if not r.is_unmapped and not r.is_secondary and not r.is_supplementary]
            if not reads:
                continue
            acgt = bam.count_coverage(c, 0, n, quality_threshold=0, read_callback="all")
            depth = [sum(col) for col in zip(*acgt)]
            pis = []
            for col in zip(*acgt):
                t = sum(col)
                if t:
                    pis.append((t - max(col)) / t)
            ids = [i for i in (read_identity(r) for r in reads) if i is not None]
            lens = [r.query_alignment_length for r in reads]
            stats.append({"Accession": c, "contig_length": n, "covered_bases": sum(1 for d in depth if d),
                          "read_count": len(reads), "mean_coverage": sum(depth) / n,
                          "Pi": round(sum(pis) / len(pis), 3) if pis else 0.0,
                          "avg_read_identity": sum(ids) / len(ids) if ids else None,
                          "avg_align_len": sum(lens) / len(lens)})
            for w in contig_windows(depth):
                wins.append({"Accession": c, **w})
    return stats, wins


def compute(bam_path, threads=1):
    import pysam
    with pysam.AlignmentFile(bam_path, "rb") as bam:
        contigs = [c for c in bam.references if bam.count(c) > 0]
    if not contigs:
        return [], []
    threads = max(1, min(threads, len(contigs)))
    size = max(1, len(contigs) // (threads * 4))
    batches = [(bam_path, contigs[i:i + size]) for i in range(0, len(contigs), size)]
    stats, wins = [], []
    if threads == 1:
        results = map(_batch, batches)
    else:
        with ProcessPoolExecutor(max_workers=threads) as ex:
            results = list(ex.map(_batch, batches))
    for s, w in results:
        stats.extend(s)
        wins.extend(w)
    return stats, wins


def main(argv=None):
    a = parse_args(argv)
    stats, wins = compute(a.bam, a.threads)
    write_tsv(a.out_stats, stats, STAT_COLS)
    write_tsv(a.out_windows, wins, WIN_COLS)
    log(f"{a.sample}: {len(stats)} contigs with primary alignments")


if __name__ == "__main__":
    main()
