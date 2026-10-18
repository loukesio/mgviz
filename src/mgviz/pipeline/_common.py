"""Shared helpers for the pipeline step CLIs (stdlib + pysam only)."""
import csv
import re
import sys

TAX_RANKS = ["kingdom", "phylum", "tclass", "order", "family", "genus", "species", "subspecies"]
TAX_PREFIXES = {"kingdom": "k__", "phylum": "p__", "tclass": "c__", "order": "o__",
                "family": "f__", "genus": "g__", "species": "s__", "subspecies": "t__"}


def read_tsv(path):
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh, delimiter="\t"))


def write_tsv(path, rows, columns):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=columns, delimiter="\t", extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: _fmt(r.get(k)) for k in columns})


def _fmt(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        return repr(v) if v == v else ""
    return v


def load_db_meta(path):
    """Return (rows, acc_to_row, assembly_lineage) from virus_pathogen_database.all_metadata.tsv."""
    rows = read_tsv(path)
    acc = {r["Accession"]: r for r in rows}
    lineage = {}
    for r in rows:
        lineage.setdefault(r["Assembly"], {k: r.get(k) for k in TAX_RANKS})
    return rows, acc, lineage


def strip_rank_prefix(value):
    if value is None:
        return ""
    return re.sub(r"^unclassified_", "", re.sub(r"^[a-z]__", "", str(value)))


def read_identity(read):
    """(aligned length - NM) / aligned length, or None when NM is absent."""
    aln = read.query_alignment_length
    if aln <= 0 or not read.has_tag("NM"):
        return None
    return (aln - read.get_tag("NM")) / aln


def iter_fasta(path):
    name, seq = None, []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith(">"):
                if name is not None:
                    yield name, "".join(seq)
                name, seq = line[1:].strip(), []
            else:
                seq.append(line.strip())
    if name is not None:
        yield name, "".join(seq)


def log(msg):
    print(f"[mgviz] {msg}", file=sys.stderr)
