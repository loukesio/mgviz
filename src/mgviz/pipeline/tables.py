"""Write the per-sample EsViritu-compatible output tables (step 6).

Produces <sample>.detected_virus.info.tsv, <sample>.detected_virus.assembly_summary.tsv,
<sample>.tax_profile.tsv, <sample>_esviritu.readstats.yaml and <sample>_esviritu.params.yaml
from the contig stats, the LCA adjustment, the database metadata and the read counts.
"""
import argparse
import json
import os
from collections import defaultdict

from ._common import TAX_RANKS, load_db_meta, read_tsv, write_tsv, strip_rank_prefix, log

INFO_COLS = ["sample_ID", "Name", "description", "Length", "Segment", "Accession", "Assembly", "Asm_length",
             *TAX_RANKS, "adj_taxonomy", "RPKMF", "read_count", "covered_bases", "mean_coverage",
             "avg_read_identity", "consensus_ref_identity", "Pi", "filtered_reads_in_sample"]
ASM_COLS = ["sample_ID", "filtered_reads_in_sample", "Assembly", "Asm_length", *TAX_RANKS, "adj_taxonomy",
            "read_count", "covered_bases", "avg_read_identity", "consensus_ref_identity", "Accession", "Segment", "RPKMF"]
TAX_COLS = ["sample_ID", "filtered_reads_in_sample", *TAX_RANKS, "read_count", "RPKMF",
            "avg_read_identity", "consensus_ref_identity", "assembly_list"]
FINE_TO_COARSE = list(reversed(TAX_RANKS))


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="mgviz.pipeline.tables", description=__doc__.splitlines()[0])
    p.add_argument("--sample", required=True)
    p.add_argument("--stats", required=True)
    p.add_argument("--adj", required=True)
    p.add_argument("--db-meta", required=True)
    p.add_argument("--readcount", required=True, help="file holding the number of reads entering alignment")
    p.add_argument("--fastp-json", help="fastp JSON of the trimming step (for read attrition)")
    p.add_argument("--sp-thresh", type=float, default=0.90)
    p.add_argument("--subsp-thresh", type=float, default=0.95)
    p.add_argument("--params-json", default="{}")
    p.add_argument("--db-version", help="database version label written to the params YAML")
    p.add_argument("--outdir", required=True)
    return p.parse_args(argv)


def _f(v):
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def _mean(vals):
    vals = [v for v in vals if v is not None]
    return sum(vals) / len(vals) if vals else None


def build(sample, stats, adj, meta_rows, acc_meta, filtered_reads, sp=0.90, subsp=0.95):
    adj_by_asm = {r["Assembly"]: r for r in adj}
    info = []
    for s in stats:
        m = acc_meta.get(s["Accession"])
        if m is None:
            log(f"{s['Accession']} missing from metadata; skipped")
            continue
        row = {"sample_ID": sample, "Name": m.get("Name"), "description": m.get("description"),
               "Length": int(m["Length"]), "Segment": m.get("Segment"), "Accession": s["Accession"],
               "Assembly": m["Assembly"], "Asm_length": int(m.get("Asm_length") or m["Length"]),
               **{r: m.get(r) for r in TAX_RANKS},
               "read_count": int(s["read_count"]), "covered_bases": int(s["covered_bases"]),
               "mean_coverage": _f(s["mean_coverage"]), "avg_read_identity": _f(s.get("avg_read_identity")),
               "Pi": _f(s["Pi"]), "filtered_reads_in_sample": filtered_reads}
        a = adj_by_asm.get(m["Assembly"])
        row["adj_taxonomy"] = bool(a and str(a["adj_taxonomy"]).lower() == "true")
        row["consensus_ref_identity"] = _f(a["consensus_ref_identity"]) if a else None
        if a:
            for r in TAX_RANKS:
                row[r] = a.get(r) or row[r]
        if row["adj_taxonomy"]:
            finest = next((strip_rank_prefix(row[r]) for r in FINE_TO_COARSE
                           if row[r] and "unclassified" not in row[r]), "unclassified")
            row["Name"] = f"{row['Name']} [tax adj: {finest}]"
        row["RPKMF"] = row["read_count"] / (row["Length"] / 1000) / (filtered_reads / 1e6) if filtered_reads else None
        if row["read_count"] >= 1:
            info.append(row)
    info.sort(key=lambda r: tuple(str(r.get(k) or "") for k in ("family", "genus", "species", "Assembly", "Segment")))

    groups = defaultdict(list)
    for r in info:
        groups[r["Assembly"]].append(r)
    asm = []
    for asm_id, rows in groups.items():
        f = rows[0]
        reads = sum(r["read_count"] for r in rows)
        asm.append({"sample_ID": sample, "filtered_reads_in_sample": filtered_reads, "Assembly": asm_id,
                    "Asm_length": f["Asm_length"], **{r: f[r] for r in TAX_RANKS}, "adj_taxonomy": f["adj_taxonomy"],
                    "read_count": reads, "covered_bases": sum(r["covered_bases"] for r in rows),
                    "avg_read_identity": _mean([r["avg_read_identity"] for r in rows]),
                    "consensus_ref_identity": f["consensus_ref_identity"],
                    "Accession": ",".join(r["Accession"] for r in rows),
                    "Segment": ",".join(str(r["Segment"] or "") for r in rows),
                    "RPKMF": reads / (f["Asm_length"] / 1000) / (filtered_reads / 1e6) if filtered_reads else None})

    tax_groups = defaultdict(list)
    for r in asm:
        eff = r["consensus_ref_identity"] if r["consensus_ref_identity"] is not None else r["avg_read_identity"]
        species, subspecies = r["species"], r["subspecies"]
        if eff is not None and eff < sp:
            species = "s__unclassified_" + strip_rank_prefix(r["genus"])
        if eff is not None and eff < subsp:
            subspecies = "t__unclassified_" + strip_rank_prefix(species)
        key = tuple(r[k] for k in TAX_RANKS[:6]) + (species, subspecies)
        tax_groups[key].append(r)
    tax = []
    for key, rows in tax_groups.items():
        tax.append({"sample_ID": sample, "filtered_reads_in_sample": filtered_reads,
                    **dict(zip(TAX_RANKS, key)),
                    "read_count": sum(r["read_count"] for r in rows), "RPKMF": sum(r["RPKMF"] or 0 for r in rows),
                    "avg_read_identity": _mean([r["avg_read_identity"] for r in rows]),
                    "consensus_ref_identity": _mean([r["consensus_ref_identity"] for r in rows]),
                    "assembly_list": ",".join(sorted({r["Assembly"] for r in rows}))})
    tax.sort(key=lambda r: tuple(str(r.get(k) or "") for k in ("family", "genus", "species", "subspecies")))
    return info, asm, tax


def main(argv=None):
    import yaml
    a = parse_args(argv)
    meta_rows, acc_meta, _ = load_db_meta(a.db_meta)
    with open(a.readcount) as fh:
        filtered_reads = int(fh.read().split()[0])
    info, asm, tax = build(a.sample, read_tsv(a.stats), read_tsv(a.adj), meta_rows, acc_meta,
                           filtered_reads, a.sp_thresh, a.subsp_thresh)
    os.makedirs(a.outdir, exist_ok=True)
    write_tsv(os.path.join(a.outdir, f"{a.sample}.detected_virus.info.tsv"), info, INFO_COLS)
    write_tsv(os.path.join(a.outdir, f"{a.sample}.detected_virus.assembly_summary.tsv"), asm, ASM_COLS)
    write_tsv(os.path.join(a.outdir, f"{a.sample}.tax_profile.tsv"), tax, TAX_COLS)

    readstats = {}
    if a.fastp_json and os.path.isfile(a.fastp_json):
        with open(a.fastp_json) as fh:
            s = json.load(fh)["summary"]
        readstats["reads pre-quality filter"] = s["before_filtering"]["total_reads"]
        readstats["reads pre-host removal"] = s["after_filtering"]["total_reads"]
    readstats["reads for EsViritu denominator"] = filtered_reads
    with open(os.path.join(a.outdir, f"{a.sample}_esviritu.readstats.yaml"), "w") as fh:
        yaml.safe_dump(readstats, fh, default_flow_style=False)
    p = json.loads(a.params_json) if a.params_json else {}
    params = {"version": "mgviz-pipeline", "MM_SET": p.get("mm_preset", "sr"), "QUAL": True,
              "FILTER_SEQS": bool(p.get("filter_fasta")), "DEDUP": True, "MINAL": p.get("min_aln_len", 100),
              "spthresh": a.sp_thresh, "subspthresh": a.subsp_thresh, "READ_FMT": "paired", "sample": a.sample,
              "db_version": a.db_version or os.path.basename(os.path.dirname(os.path.abspath(a.db_meta)))}
    with open(os.path.join(a.outdir, f"{a.sample}_esviritu.params.yaml"), "w") as fh:
        yaml.safe_dump(params, fh, default_flow_style=False)
    log(f"{a.sample}: {len(info)} contigs, {len(asm)} assemblies, {len(tax)} taxa")


if __name__ == "__main__":
    main()
