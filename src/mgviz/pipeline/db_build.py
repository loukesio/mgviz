"""Build an EsViritu-format database (fna + all_metadata.tsv) from a FASTA and an accession table.

Pure-Python replacement for esv_create_taxonomy: lineages come straight from the
NCBI taxdump (nodes.dmp / names.dmp) and accession->taxid from
nucl_gb.accession2taxid.gz, so no taxonkit is needed. The minimap2 index is
built by the BUILD_DB process afterwards.

Input table (TSV): Accession, Organism_Name, Length [, Assembly, Segment, description, TaxID]
Output columns match EsViritu: Accession, description, Name, Segment, kingdom, phylum, tclass,
order, family, genus, species, subspecies, Length, TaxID, Assembly, Asm_length
"""
import argparse
import gzip
import os
from collections import defaultdict

from ._common import TAX_RANKS, TAX_PREFIXES, read_tsv, write_tsv, iter_fasta, log

OUT_COLS = ["Accession", "description", "Name", "Segment", *TAX_RANKS, "Length", "TaxID", "Assembly", "Asm_length"]
NCBI_RANK = {"kingdom": "kingdom", "phylum": "phylum", "tclass": "class", "order": "order",
             "family": "family", "genus": "genus", "species": "species"}
BELOW_SPECIES = {"subspecies", "strain", "isolate", "serotype", "genotype", "serogroup", "forma", "varietas", "no rank", "clade"}


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="mgviz.pipeline.db_build", description=__doc__.splitlines()[0])
    p.add_argument("--table", required=True, help="accession table TSV")
    p.add_argument("--fasta", required=True, help="genome FASTA (headers start with the accession)")
    p.add_argument("--taxdump", required=True, help="directory with nodes.dmp and names.dmp")
    p.add_argument("--acc2taxid", help="nucl_gb.accession2taxid.gz (not needed when the table has TaxID)")
    p.add_argument("--outdir", required=True)
    return p.parse_args(argv)


def load_taxdump(d):
    parent, rank, name = {}, {}, {}
    with open(os.path.join(d, "nodes.dmp")) as fh:
        for line in fh:
            f = [x.strip() for x in line.split("|")]
            parent[f[0]], rank[f[0]] = f[1], f[2]
    with open(os.path.join(d, "names.dmp")) as fh:
        for line in fh:
            f = [x.strip() for x in line.split("|")]
            if f[3] == "scientific name":
                name[f[0]] = f[1]
    return parent, rank, name


def lineage(taxid, parent, rank, name):
    """EsViritu-style labels: k__..s__ from the ranked ancestors, t__ = the leaf when it sits below species."""
    chain, t = [], taxid
    while t and t in parent and t != "1":
        chain.append(t)
        t = parent[t]
    by_rank = {rank[t]: name[t] for t in chain}
    out, last = {}, ""
    for r in TAX_RANKS[:7]:
        v = by_rank.get(NCBI_RANK[r])
        if v:
            out[r] = f"{TAX_PREFIXES[r]}{v}"
            last = v
        else:
            out[r] = f"{TAX_PREFIXES[r]}unclassified_{last}" if last else f"{TAX_PREFIXES[r]}unclassified"
    if rank.get(taxid, "") in BELOW_SPECIES and "species" in by_rank and name.get(taxid) != by_rank["species"]:
        out["subspecies"] = f"t__{name[taxid]}"
    else:
        out["subspecies"] = f"t__unclassified_{last}" if last else "t__unclassified"
    return out


def acc_to_taxid(acc2taxid_gz, wanted):
    found, bare = {}, {a.split(".")[0] for a in wanted}
    with gzip.open(acc2taxid_gz, "rt") as fh:
        next(fh)
        for line in fh:
            f = line.split("\t")
            if f[0] in bare:
                found[f[1]] = f[2]
                found[f[0]] = f[2]
    return found


def main(argv=None):
    a = parse_args(argv)
    rows = read_tsv(a.table)
    if not rows:
        raise SystemExit("empty accession table")
    need = [r["Accession"] for r in rows if not r.get("TaxID")]
    acc_tax = {}
    if need:
        if not a.acc2taxid:
            raise SystemExit("table lacks TaxID for some rows; pass --acc2taxid")
        log(f"looking up taxids for {len(need)} accessions (streams the whole accession2taxid file)")
        acc_tax = acc_to_taxid(a.acc2taxid, need)
    parent, rank, name = load_taxdump(a.taxdump)
    os.makedirs(a.outdir, exist_ok=True)
    out, asm_len, missing = [], defaultdict(int), 0
    for r in rows:
        tid = r.get("TaxID") or acc_tax.get(r["Accession"]) or acc_tax.get(r["Accession"].split(".")[0])
        if not tid or tid not in parent:
            missing += 1
            continue
        asm = r.get("Assembly") or f"set:{r['Accession']}"
        asm_len[asm] += int(r["Length"])
        out.append({"Accession": r["Accession"], "description": r.get("description") or r["Organism_Name"],
                    "Name": r["Organism_Name"], "Segment": r.get("Segment") or "", **lineage(tid, parent, rank, name),
                    "Length": int(r["Length"]), "TaxID": tid, "Assembly": asm})
    for r in out:
        r["Asm_length"] = asm_len[r["Assembly"]]
    keep, n = {r["Accession"] for r in out}, 0
    with open(os.path.join(a.outdir, "virus_pathogen_database.fna"), "w") as fh:
        for hdr, seq in iter_fasta(a.fasta):
            acc = hdr.split()[0]
            if acc in keep:
                fh.write(f">{acc}\n")
                for i in range(0, len(seq), 80):
                    fh.write(seq[i:i + 80] + "\n")
                n += 1
    write_tsv(os.path.join(a.outdir, "virus_pathogen_database.all_metadata.tsv"), out, OUT_COLS)
    log(f"{len(out)} records annotated ({missing} without taxid skipped), {n} sequences written")


if __name__ == "__main__":
    main()
