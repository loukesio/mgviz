"""Prepare source tables for a custom mgviz database (EsViritu format).

Two steps, both pure Python, both writing to a directory of your choice (keep
it on a large drive):

    refseq   turn an NCBI RefSeq viral release FASTA into an accession table
             (Accession, Organism_Name, Length, Assembly, Segment, description,
             TaxID) with the TaxID looked up in nucl_gb.accession2taxid.gz
    merge    union one or more (table, FASTA) pairs, keeping the first copy of
             every accession, so an existing EsViritu database can be extended

The result feeds ``mgviz.pipeline.db_build`` (or the BUILD_DB Nextflow module),
which adds the lineage columns and writes the final database.

Segmented genomes: RefSeq FASTA gives no assembly accession, so records of the
same TaxID whose description mentions a segment, chromosome or RNA number are
grouped into one assembly ``set:tax<TaxID>``. RefSeq carries one reference per
species in almost every case, so this matches the assembly grouping EsViritu
uses; check the few multi-isolate species by hand if they matter to you.
"""
import argparse
import gzip
import os
import re
from collections import defaultdict

from ._common import read_tsv, write_tsv, log

TABLE_COLS = ["Accession", "Organism_Name", "Length", "Assembly", "Segment", "description", "TaxID"]
_SEG = re.compile(r"\b(segment|chromosome|RNA|DNA)[\s_-]*([A-Za-z0-9]+)", re.IGNORECASE)
_TRIM = re.compile(r",?\s*(complete (genome|sequence|cds)|genomic sequence|partial genome).*$", re.IGNORECASE)


def _open(path):
    return gzip.open(path, "rt") if path.endswith(".gz") else open(path, "rt")


def iter_fasta_headers(path):
    """Yield (accession, description, length) without holding sequences."""
    acc, desc, n = None, "", 0
    with _open(path) as fh:
        for line in fh:
            if line.startswith(">"):
                if acc is not None:
                    yield acc, desc, n
                parts = line[1:].strip().split(None, 1)
                acc, desc, n = parts[0], (parts[1] if len(parts) > 1 else ""), 0
            else:
                n += len(line.strip())
    if acc is not None:
        yield acc, desc, n


def acc_to_taxid(acc2taxid_gz, wanted):
    bare = {a.split(".")[0] for a in wanted}
    found = {}
    with gzip.open(acc2taxid_gz, "rt") as fh:
        next(fh)
        for line in fh:
            f = line.split("\t")
            if f[0] in bare:
                found[f[0]] = f[2]
    return found


def organism_and_segment(desc):
    """'Influenza A virus (A/x) segment 4, complete sequence' -> ('Influenza A virus (A/x)', '4')."""
    seg = ""
    m = _SEG.search(desc)
    if m:
        seg = m.group(2)
        name = desc[: m.start()].rstrip(" ,;:")
    else:
        name = desc
    name = _TRIM.sub("", name).strip(" ,;:")
    return name or desc, seg


def cmd_refseq(a):
    rows = list(iter_fasta_headers(a.fasta))
    log(f"{len(rows)} records in {a.fasta}")
    tax = acc_to_taxid(a.acc2taxid, [r[0] for r in rows])
    log(f"taxids found for {len(tax)} accessions")
    by_tax = defaultdict(list)
    out = []
    for acc, desc, length in rows:
        tid = tax.get(acc.split(".")[0])
        if not tid:
            continue
        name, seg = organism_and_segment(desc)
        out.append({"Accession": acc, "Organism_Name": name, "Length": length, "Assembly": "",
                    "Segment": seg, "description": desc, "TaxID": tid})
        by_tax[tid].append(out[-1])
    for tid, rs in by_tax.items():
        segmented = [r for r in rs if r["Segment"]]
        if len(rs) > 1 and len(segmented) == len(rs):
            for r in rs:
                r["Assembly"] = f"set:tax{tid}"
        else:
            for r in rs:
                r["Assembly"] = f"acc:{r['Accession']}"
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    write_tsv(a.out, out, TABLE_COLS)
    log(f"wrote {len(out)} rows ({len(rows) - len(out)} without taxid dropped) to {a.out}")


def _esviritu_to_table(rows):
    """EsViritu all_metadata.tsv rows -> source-table rows."""
    return [{"Accession": r["Accession"], "Organism_Name": r.get("Name") or r.get("description"),
             "Length": r["Length"], "Assembly": r.get("Assembly") or "", "Segment": r.get("Segment") or "",
             "description": r.get("description") or "", "TaxID": r.get("TaxID") or ""} for r in rows]


def cmd_merge(a):
    seen, out = set(), []
    fastas = []
    for pair in a.source:
        table, fasta = pair.split(",", 1)
        rows = read_tsv(table)
        if rows and "Name" in rows[0] and "kingdom" in rows[0]:
            rows = _esviritu_to_table(rows)
        n = 0
        for r in rows:
            key = str(r["Accession"]).split(".")[0]
            if key in seen:
                continue
            seen.add(key)
            out.append({c: r.get(c, "") for c in TABLE_COLS})
            n += 1
        fastas.append(fasta)
        log(f"{table}: {n} new accessions")
    os.makedirs(a.outdir, exist_ok=True)
    write_tsv(os.path.join(a.outdir, "accessions.tsv"), out, TABLE_COLS)
    keep = {str(r["Accession"]) for r in out}
    written = set()
    with open(os.path.join(a.outdir, "genomes.fna"), "w") as w:
        for fasta in fastas:
            on = False
            with _open(fasta) as fh:
                for line in fh:
                    if line.startswith(">"):
                        acc = line[1:].split()[0]
                        on = acc in keep and acc not in written
                        if on:
                            written.add(acc)
                            line = f">{acc}\n"
                    if on:
                        w.write(line)
    log(f"merged database: {len(out)} accessions in table, {len(written)} sequences written to {a.outdir}")


def main(argv=None):
    p = argparse.ArgumentParser(prog="mgviz.pipeline.db_sources", description=__doc__.splitlines()[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("refseq", help="accession table from a RefSeq viral FASTA")
    r.add_argument("--fasta", required=True, help="viral.*.genomic.fna(.gz) from the RefSeq release")
    r.add_argument("--acc2taxid", required=True, help="nucl_gb.accession2taxid.gz")
    r.add_argument("--out", required=True, help="output table TSV")
    r.set_defaults(func=cmd_refseq)
    m = sub.add_parser("merge", help="union of (table,FASTA) sources; first copy of an accession wins")
    m.add_argument("--source", action="append", required=True, help="TABLE,FASTA; EsViritu all_metadata.tsv is accepted as TABLE")
    m.add_argument("--outdir", required=True)
    m.set_defaults(func=cmd_merge)
    a = p.parse_args(argv)
    a.func(a)


if __name__ == "__main__":
    main()
