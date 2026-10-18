"""Lowest-common-ancestor taxonomy adjustment of consensus genomes (EsViritu step 5b).

Input is a PAF (with cs tags) of the sample's consensus FASTA aligned to the
reference database. Matching canonical residues are summed per
(consensus assembly, reference assembly); reference assemblies tied for the
maximum define the lineage, or their LCA when they disagree.
"""
import argparse
import re
from collections import defaultdict

from ._common import TAX_RANKS, TAX_PREFIXES, load_db_meta, strip_rank_prefix, write_tsv, log

OUT_COLS = ["Assembly", *TAX_RANKS, "best_ref_assemblies", "matching_residues", "consensus_ref_identity", "adj_taxonomy"]


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="mgviz.pipeline.lca_taxonomy", description=__doc__.splitlines()[0])
    p.add_argument("--paf", required=True)
    p.add_argument("--db-meta", required=True)
    p.add_argument("--sample", required=True)
    p.add_argument("--out", required=True)
    return p.parse_args(argv)


def lca_lineage(lineages):
    lca, diverged, last = {}, False, ""
    for rank in TAX_RANKS:
        if not diverged:
            vals = {lin.get(rank) for lin in lineages}
            if len(vals) == 1:
                v = next(iter(vals))
                lca[rank] = v
                if strip_rank_prefix(v):
                    last = strip_rank_prefix(v)
                continue
            diverged = True
        lca[rank] = f"{TAX_PREFIXES[rank]}unclassified_{last}" if last else f"{TAX_PREFIXES[rank]}unclassified"
    return lca


def cs_matches(cs):
    return sum(int(m) for m in re.findall(r":(\d+)", cs or ""))


def adjust(paf_path, sample, acc_meta, assembly_lineage):
    acc_to_asm = {k: v["Assembly"] for k, v in acc_meta.items()}
    pair_m, pair_len = defaultdict(int), defaultdict(int)
    with open(paf_path) as fh:
        for raw in fh:
            f = raw.rstrip("\n").split("\t")
            if len(f) < 12:
                continue
            cs = next((t[5:] for t in f[12:] if t.startswith("cs:Z:")), None)
            m = cs_matches(cs) if cs is not None else int(f[9])
            if m > 0:
                pair_m[(f[0], f[5])] += m
                pair_len[(f[0], f[5])] += int(f[10])
    suffix = re.compile(rf"_{re.escape(sample)}_consensus$")
    asm_m, asm_len = defaultdict(int), defaultdict(int)
    for (q, t), m in pair_m.items():
        c_asm, r_asm = acc_to_asm.get(suffix.sub("", q)), acc_to_asm.get(t)
        if c_asm is None or r_asm is None:
            continue
        asm_m[(c_asm, r_asm)] += m
        asm_len[(c_asm, r_asm)] += pair_len[(q, t)]
    per_cons = defaultdict(dict)
    for (c, r), m in asm_m.items():
        per_cons[c][r] = m
    out = []
    for c_asm, refs in per_cons.items():
        best = max(refs.values())
        best_refs = sorted(r for r, m in refs.items() if m == best)
        lins = [assembly_lineage[r] for r in best_refs if r in assembly_lineage]
        if not lins:
            continue
        assigned = lins[0] if len({tuple(l[r] for r in TAX_RANKS) for l in lins}) == 1 else lca_lineage(lins)
        orig = assembly_lineage.get(c_asm, {})
        msum = sum(refs[r] for r in best_refs)
        lsum = sum(asm_len[(c_asm, r)] for r in best_refs)
        out.append({"Assembly": c_asm, **{r: assigned[r] for r in TAX_RANKS},
                    "best_ref_assemblies": ",".join(best_refs), "matching_residues": best,
                    "consensus_ref_identity": min(msum / lsum, 1.0) if lsum else None,
                    "adj_taxonomy": any(assigned.get(r) != orig.get(r) for r in TAX_RANKS)})
    return out


def main(argv=None):
    a = parse_args(argv)
    _, acc_meta, lineage = load_db_meta(a.db_meta)
    rows = adjust(a.paf, a.sample, acc_meta, lineage)
    write_tsv(a.out, rows, OUT_COLS)
    log(f"{a.sample}: {len(rows)} consensus assemblies, {sum(r['adj_taxonomy'] for r in rows)} adjusted")


if __name__ == "__main__":
    main()
