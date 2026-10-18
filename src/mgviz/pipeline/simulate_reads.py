"""Simulate paired-end reads from chosen genomes of an EsViritu-format database (test data only).

Writes <sample>_R1.fastq.gz / <sample>_R2.fastq.gz plus <sample>.truth.tsv with
the accessions and read counts used, so a pipeline run can be checked against
known content.
"""
import argparse
import gzip
import os
import random

from ._common import iter_fasta, read_tsv, write_tsv, log

COMP = str.maketrans("ACGTN", "TGCAN")


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="mgviz.pipeline.simulate_reads", description=__doc__.splitlines()[0])
    p.add_argument("--db", required=True, help="database directory")
    p.add_argument("--sample", required=True)
    p.add_argument("--accessions", required=True, help="comma-separated accessions to sample, or 'random:N'")
    p.add_argument("--reads-per-genome", default="2000", help="int or comma list matching --accessions")
    p.add_argument("--background", type=int, default=20000, help="random non-viral reads to add")
    p.add_argument("--read-len", type=int, default=150)
    p.add_argument("--error-rate", type=float, default=0.005)
    p.add_argument("--divergence", type=float, default=0.0, help="per-genome SNP rate to introduce before sampling")
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--outdir", required=True)
    return p.parse_args(argv)


def mutate(seq, rate, rng):
    if rate <= 0:
        return seq
    s = list(seq)
    for i in range(len(s)):
        if rng.random() < rate:
            s[i] = rng.choice([b for b in "ACGT" if b != s[i]])
    return "".join(s)


def read_pair(seq, rng, L, err):
    ins = rng.randint(max(L + 50, 300), max(L + 50, 500))
    ins = min(ins, len(seq))
    start = rng.randint(0, len(seq) - ins)
    frag = seq[start:start + ins]
    r1, r2 = frag[:L], frag[-L:].translate(COMP)[::-1]

    def noisy(r):
        return "".join(rng.choice("ACGT") if rng.random() < err else b for b in r)
    return noisy(r1), noisy(r2)


def main(argv=None):
    a = parse_args(argv)
    rng = random.Random(a.seed)
    meta = {r["Accession"]: r for r in read_tsv(os.path.join(a.db, "virus_pathogen_database.all_metadata.tsv"))}
    if a.accessions.startswith("random:"):
        n = int(a.accessions.split(":")[1])
        accs = rng.sample([k for k, r in meta.items() if int(r["Length"]) > 3000], n)
    else:
        accs = a.accessions.split(",")
    counts = [int(x) for x in a.reads_per_genome.split(",")]
    counts = counts * len(accs) if len(counts) == 1 else counts
    want = set(accs)
    seqs = {}
    for name, seq in iter_fasta(os.path.join(a.db, "virus_pathogen_database.fna")):
        acc = name.split()[0]
        if acc in want:
            seqs[acc] = mutate(seq.upper(), a.divergence, rng)
        if len(seqs) == len(want):
            break
    os.makedirs(a.outdir, exist_ok=True)
    pairs = []
    truth = []
    for acc, n in zip(accs, counts):
        if acc not in seqs:
            log(f"{acc} not found in FASTA; skipped")
            continue
        for _ in range(n):
            pairs.append((acc, *read_pair(seqs[acc], rng, a.read_len, a.error_rate)))
        truth.append({"Accession": acc, "Name": meta[acc]["Name"], "Assembly": meta[acc]["Assembly"], "reads": n})
    for i in range(a.background):
        r1 = "".join(rng.choice("ACGT") for _ in range(a.read_len))
        r2 = "".join(rng.choice("ACGT") for _ in range(a.read_len))
        pairs.append(("bg", r1, r2))
    rng.shuffle(pairs)
    q = "I" * a.read_len
    with gzip.open(os.path.join(a.outdir, f"{a.sample}_R1.fastq.gz"), "wt") as f1, \
            gzip.open(os.path.join(a.outdir, f"{a.sample}_R2.fastq.gz"), "wt") as f2:
        for i, (src, r1, r2) in enumerate(pairs):
            f1.write(f"@{a.sample}_{i}_{src}/1\n{r1}\n+\n{q}\n")
            f2.write(f"@{a.sample}_{i}_{src}/2\n{r2}\n+\n{q}\n")
    write_tsv(os.path.join(a.outdir, f"{a.sample}.truth.tsv"), truth, ["Accession", "Name", "Assembly", "reads"])
    log(f"{a.sample}: {len(pairs)} pairs written ({len(truth)} genomes + {a.background} background)")


if __name__ == "__main__":
    main()
