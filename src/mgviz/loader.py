"""Read an EsViritu output directory into plain Python structures.

The input contract is the set of files EsViritu writes per sample:

    <SAMPLE>.detected_virus.info.tsv
    <SAMPLE>.detected_virus.assembly_summary.tsv
    <SAMPLE>.tax_profile.tsv
    <SAMPLE>.virus_coverage_windows.tsv
    <SAMPLE>_esviritu.readstats.yaml
    <SAMPLE>_esviritu.params.yaml
    <SAMPLE>_final_consensus.fasta

Project-level files produced by ``summarize_esv_runs`` use the same suffixes
and carry a ``sample_ID`` column, so every table is grouped by that column
rather than by file name. Only the standard library (plus PyYAML) is needed.
"""

from __future__ import annotations

import csv
import glob
import os
from collections import defaultdict

try:
    import yaml
except ImportError:  # pragma: no cover - exercised only when PyYAML is absent
    yaml = None

SUFFIX_INFO = ".detected_virus.info.tsv"
SUFFIX_ASM = ".detected_virus.assembly_summary.tsv"
SUFFIX_TAX = ".tax_profile.tsv"
SUFFIX_WIN = ".virus_coverage_windows.tsv"
SUFFIX_READSTATS = "_esviritu.readstats.yaml"
SUFFIX_ORFS = ".orfs.tsv"                      # mgviz PREDICT_PROTEINS (optional)
SUFFIX_GENOMAD = "_final_consensus_virus_summary.tsv"  # mgviz GENOMAD (optional)
SUFFIX_PARAMS = "_esviritu.params.yaml"
SUFFIX_CONSENSUS = "_final_consensus.fasta"


def _coerce(value: str):
    """Turn a TSV cell into int, float, bool or None where that is unambiguous."""
    if value is None:
        return None
    v = value.strip()
    # Polars writes nulls as empty cells. "NA" is a real value (influenza segment).
    if v == "":
        return None
    low = v.lower()
    if low == "true":
        return True
    if low == "false":
        return False
    try:
        if v.lstrip("-").isdigit():
            return int(v)
        return float(v)
    except ValueError:
        return v


def read_tsv(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh, delimiter="\t")
        return [{k: _coerce(v) for k, v in row.items()} for row in reader]


def _read_yaml(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    if yaml is not None:
        return yaml.safe_load(text) or {}
    # Minimal fallback for the flat ``key: value`` files EsViritu writes.
    out = {}
    for line in text.splitlines():
        if ":" in line and not line.startswith("#"):
            k, v = line.split(":", 1)
            out[k.strip()] = _coerce(v)
    return out


def read_fasta_summary(path: str) -> list[dict]:
    """Return per-record length and N count without keeping sequences."""
    records = []
    name, length, n_count = None, 0, 0
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith(">"):
                if name is not None:
                    records.append({"record": name, "length": length, "n_count": n_count})
                name, length, n_count = line[1:].split()[0], 0, 0
            else:
                seq = line.strip()
                length += len(seq)
                n_count += seq.upper().count("N")
    if name is not None:
        records.append({"record": name, "length": length, "n_count": n_count})
    return records


def _sample_from_filename(path: str, suffix: str) -> str:
    return os.path.basename(path)[: -len(suffix)]


def _group_tables(directory: str, suffix: str) -> dict[str, list[dict]]:
    """Read every file with ``suffix`` and group rows by sample_ID."""
    grouped: dict[str, list[dict]] = defaultdict(list)
    seen: set[tuple] = set()
    for path in sorted(glob.glob(os.path.join(directory, f"*{suffix}"))):
        fallback = _sample_from_filename(path, suffix)
        for row in read_tsv(path):
            sample = row.get("sample_ID") or fallback
            row["sample_ID"] = sample
            key = (sample, row.get("Accession"), row.get("window_index"),
                   row.get("Assembly"), row.get("subspecies"))
            if key in seen:
                continue
            seen.add(key)
            grouped[sample].append(row)
    return grouped


def load_project(directory: str) -> dict:
    """Load every sample found in ``directory``.

    Returns ``{"project": <dir basename>, "directory": <abs path>,
    "samples": {sample_id: {...}}}``.
    """
    directory = os.path.abspath(directory)
    info = _group_tables(directory, SUFFIX_INFO)
    asm = _group_tables(directory, SUFFIX_ASM)
    tax = _group_tables(directory, SUFFIX_TAX)
    win = _group_tables(directory, SUFFIX_WIN)

    # every sample with any per-sample file, so samples without detections still appear
    names = set(info) | set(asm) | set(tax)
    for suffix in (SUFFIX_INFO, SUFFIX_READSTATS, SUFFIX_PARAMS, SUFFIX_CONSENSUS):
        for path in glob.glob(os.path.join(directory, f"*{suffix}")):
            names.add(_sample_from_filename(path, suffix))
    samples: dict[str, dict] = {}
    for sample in sorted(names):
        entry = {
            "info": info.get(sample, []),
            "assemblies": asm.get(sample, []),
            "tax": tax.get(sample, []),
            "windows": win.get(sample, []),
            "readstats": {},
            "params": {},
            "consensus": [],
            "orfs": [],
            "genomad": [],
            "genomad_present": False,
        }
        rs = os.path.join(directory, sample + SUFFIX_READSTATS)
        if os.path.isfile(rs):
            entry["readstats"] = _read_yaml(rs)
        pr = os.path.join(directory, sample + SUFFIX_PARAMS)
        if os.path.isfile(pr):
            entry["params"] = _read_yaml(pr)
        fa = os.path.join(directory, sample + SUFFIX_CONSENSUS)
        if os.path.isfile(fa):
            entry["consensus"] = read_fasta_summary(fa)
        for key, suffix in (("orfs", SUFFIX_ORFS), ("genomad", SUFFIX_GENOMAD)):
            fp = os.path.join(directory, sample + suffix)
            if os.path.isfile(fp):
                entry[key] = read_tsv(fp)
                if key == "genomad":
                    entry["genomad_present"] = True
        samples[sample] = entry

    return {
        "project": os.path.basename(directory.rstrip(os.sep)) or "project",
        "directory": directory,
        "samples": samples,
    }
