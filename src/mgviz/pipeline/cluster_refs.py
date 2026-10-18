"""Read-sharing clustering of reference assemblies (EsViritu step 3).

Builds the assembly-level read-sharing network from a BAM (primary and
secondary alignments), clusters assemblies that share >= threshold of the
smaller assembly's reads, picks the exemplar with most reads (ties broken by
mean read identity, then name), and writes a FASTA holding every accession of
the exemplar assemblies. Run twice with re-alignment in between to match
EsViritu.
"""
import argparse
from collections import defaultdict

from ._common import load_db_meta, read_identity, iter_fasta, write_tsv, log


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="mgviz.pipeline.cluster_refs", description=__doc__.splitlines()[0])
    p.add_argument("--bam", required=True)
    p.add_argument("--db-fasta", required=True, help="FASTA to pull exemplar records from")
    p.add_argument("--db-meta", required=True)
    p.add_argument("--threshold", type=float, default=0.33)
    p.add_argument("--sample", required=True)
    p.add_argument("--out-fasta", required=True)
    p.add_argument("--out-network", required=True)
    p.add_argument("--out-clusters", required=True)
    return p.parse_args(argv)


def read_sharing_table(bam_path, acc_to_asm):
    import pysam
    contig_reads, contig_ids = defaultdict(set), defaultdict(list)
    with pysam.AlignmentFile(bam_path, "rb") as bam:
        for read in bam.fetch(until_eof=True):
            if read.is_unmapped:
                continue
            c = bam.get_reference_name(read.reference_id)
            contig_reads[c].add(read.query_name)
            ident = read_identity(read)
            if ident is not None:
                contig_ids[c].append(ident)
    asm_reads, asm_ids = defaultdict(set), defaultdict(list)
    for c, reads in contig_reads.items():
        asm = acc_to_asm.get(c)
        if asm is None:
            log(f"accession {c} not in metadata; ignored")
            continue
        asm_reads[asm] |= reads
        asm_ids[asm].extend(contig_ids.get(c, []))
    asm_ident = {a: (sum(v) / len(v) if v else float("nan")) for a, v in asm_ids.items()}
    asms = list(asm_reads)
    rows = []
    for i, a in enumerate(asms):
        for b in asms[i:]:
            shared = asm_reads[a] & asm_reads[b]
            if shared:
                rows.append({"assembly_a": a, "assembly_b": b,
                             "total_reads_a": len(asm_reads[a]), "total_reads_b": len(asm_reads[b]),
                             "n_shared_reads": len(shared),
                             "share_of_a": len(shared) / len(asm_reads[a]),
                             "share_of_b": len(shared) / len(asm_reads[b]),
                             "avg_read_identity_a": asm_ident.get(a), "avg_read_identity_b": asm_ident.get(b)})
    return rows


def cluster(rows, threshold=0.33):
    links, total, ident = defaultdict(set), {}, {}
    for r in rows:
        a, b = r["assembly_a"], r["assembly_b"]
        total[a], total[b] = r["total_reads_a"], r["total_reads_b"]
        for asm, key in ((a, "avg_read_identity_a"), (b, "avg_read_identity_b")):
            v = r.get(key)
            if v is not None and v == v and v > ident.get(asm, float("-inf")):
                ident[asm] = v
        m = min(total[a], total[b])
        if m and a != b and r["n_shared_reads"] / m >= threshold:
            links[a].add(b)
            links[b].add(a)
    remaining, assigned, out, cid = set(total), set(), [], 0
    while remaining:
        ex = min(remaining, key=lambda x: (-total.get(x, 0), -ident.get(x, float("-inf")), x))
        cid += 1
        members = [ex] + sorted(m for m in links[ex] if m not in assigned and m != ex)
        for m in members:
            out.append({"cluster_id": f"cluster_{cid}", "assembly": m, "exemplar": ex,
                        "total_reads": total.get(m, 0), "is_exemplar": m == ex})
            assigned.add(m)
        remaining -= assigned
    return out


def main(argv=None):
    a = parse_args(argv)
    rows_meta, acc_meta, _ = load_db_meta(a.db_meta)
    acc_to_asm = {k: v["Assembly"] for k, v in acc_meta.items()}
    net = read_sharing_table(a.bam, acc_to_asm)
    write_tsv(a.out_network, net, ["assembly_a", "assembly_b", "total_reads_a", "total_reads_b", "n_shared_reads",
                                   "share_of_a", "share_of_b", "avg_read_identity_a", "avg_read_identity_b"])
    clusters = cluster(net, a.threshold)
    write_tsv(a.out_clusters, clusters, ["cluster_id", "assembly", "exemplar", "total_reads", "is_exemplar"])
    exemplars = {c["exemplar"] for c in clusters}
    keep = {r["Accession"] for r in rows_meta if r["Assembly"] in exemplars}
    n = 0
    with open(a.out_fasta, "w") as fh:
        for name, seq in iter_fasta(a.db_fasta):
            if name.split()[0] in keep:
                fh.write(f">{name}\n")
                for i in range(0, len(seq), 80):
                    fh.write(seq[i:i + 80] + "\n")
                n += 1
    log(f"{a.sample}: {len(net)} network edges, {len(clusters)} assemblies in {len(exemplars)} clusters, {n} records written")


if __name__ == "__main__":
    main()
