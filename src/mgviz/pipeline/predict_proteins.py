"""Predict genes on consensus genomes with pyrodigal-gv (virus-tuned Prodigal).

Writes a GFF3, a protein FASTA and a TSV (one row per ORF) that the report draws
as arrows under each coverage chart. Runs in meta mode, so each genome is
scored independently and ambiguous (N) stretches are tolerated.
"""
import argparse

from ._common import iter_fasta, write_tsv, log

ORF_COLS = ["Accession", "orf_id", "start", "end", "strand", "length_aa", "partial", "start_codon", "rbs_motif", "gc_cont"]


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="mgviz.pipeline.predict_proteins", description=__doc__.splitlines()[0])
    p.add_argument("--consensus", required=True)
    p.add_argument("--sample", required=True)
    p.add_argument("--min-length", type=int, default=30, help="minimum protein length (aa)")
    p.add_argument("--out-gff", required=True)
    p.add_argument("--out-faa", required=True)
    p.add_argument("--out-tsv", required=True)
    return p.parse_args(argv)


def main(argv=None):
    import pyrodigal_gv
    a = parse_args(argv)
    finder = pyrodigal_gv.ViralGeneFinder(meta=True, mask=True)
    rows, n_prot = [], 0
    with open(a.out_gff, "w") as gff, open(a.out_faa, "w") as faa:
        gff.write("##gff-version 3\n")
        for name, seq in iter_fasta(a.consensus):
            rid = name.split()[0]
            acc = rid.replace(f"_{a.sample}_consensus", "")
            genes = finder.find_genes(seq)
            genes.write_gff(gff, sequence_id=rid)
            genes.write_translations(faa, sequence_id=rid)
            for i, g in enumerate(genes, 1):
                if (g.end - g.begin + 1) // 3 < a.min_length:
                    continue
                rows.append({"Accession": acc, "orf_id": f"{rid}_{i}", "start": g.begin, "end": g.end,
                             "strand": "+" if g.strand == 1 else "-", "length_aa": (g.end - g.begin + 1) // 3,
                             "partial": bool(g.partial_begin or g.partial_end), "start_codon": g.start_type,
                             "rbs_motif": g.rbs_motif, "gc_cont": round(g.gc_cont, 3)})
                n_prot += 1
    write_tsv(a.out_tsv, rows, ORF_COLS)
    log(f"{a.sample}: {n_prot} proteins predicted")


if __name__ == "__main__":
    main()
