"""Turn a loaded project into the compact JSON bundle the report embeds."""

from __future__ import annotations

import datetime as _dt
import re

from . import __version__
from .palettes import load_palettes

RANKS = ["kingdom", "phylum", "tclass", "order", "family", "genus", "species", "subspecies"]
_PREFIX = re.compile(r"^[a-z]__")


def strip_rank(value) -> str | None:
    if value is None:
        return None
    return _PREFIX.sub("", str(value))


def _float(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _int(v):
    try:
        return int(float(v)) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _host_range() -> dict:
    import json
    from importlib import resources

    text = resources.files("mgviz").joinpath("static", "host_range.json").read_text(encoding="utf-8")
    data = json.loads(text)
    data.pop("_comment", None)
    return data


def _window_size(length: int) -> int:
    # Mirrors esv_funcs.bam_coverage_windows: contig_len // 100, at least 1.
    return max(1, int(length) // 100)


SAMPLE_TYPES = ["stool", "nasal", "wastewater", "clinical"]


def infer_sample_type(sample_id: str, given: str | None = None) -> str:
    """Sample type from the samplesheet, else from a known name prefix, else ``sample``."""
    if given:
        return str(given).strip().lower()
    head = re.split(r"[_\-.]", sample_id, 1)[0].lower()
    return head if head in SAMPLE_TYPES else "sample"


def read_sample_table(path: str) -> dict[str, str]:
    """Read ``sample<TAB or ,>type`` rows (header optional) into ``{sample: type}``."""
    out: dict[str, str] = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            parts = re.split(r"[\t,]", line.rstrip("\n"))
            if len(parts) < 2 or parts[0].strip().lower() in ("sample", "sample_id", ""):
                continue
            if parts[1].strip():
                out[parts[0].strip()] = parts[1].strip()
    return out


def build_bundle(project: dict, run_id: str | None = None, sample_types: dict[str, str] | None = None) -> dict:
    samples_out = []
    contigs = []
    assemblies = []
    tax = []
    sample_types = sample_types or {}
    db_version = None

    for sample_id, s in project["samples"].items():
        filtered = None
        if s["info"]:
            filtered = s["info"][0].get("filtered_reads_in_sample")
        if filtered is None:
            filtered = s["readstats"].get("reads for EsViritu denominator")
        rs = s["readstats"]
        raw = next((rs[k] for k in ("reads pre-quality filter", "reads pre-host removal",
                                    "reads for EsViritu denominator") if rs.get(k) is not None), filtered)
        viral = sum(int(r.get("read_count") or 0) for r in s["info"])
        if s["params"].get("db_version"):
            db_version = str(s["params"]["db_version"])

        cov_by_acc: dict[str, list] = {}
        for w in s["windows"]:
            cov_by_acc.setdefault(w["Accession"], []).append(w)
        for acc, rows in cov_by_acc.items():
            rows.sort(key=lambda r: r["window_index"])

        orfs_by_acc: dict[str, list] = {}
        for o in s.get("orfs", []):
            try:
                orfs_by_acc.setdefault(o["Accession"], []).append(
                    [int(o["start"]), int(o["end"]), o["strand"], int(o["length_aa"]), str(o.get("partial")).lower() == "true"])
            except (KeyError, TypeError, ValueError):
                continue
        gv_by_acc = {}
        for g in s.get("genomad", []):
            acc = re.sub(rf"_{re.escape(sample_id)}_consensus(\|.*)?$", "", str(g.get("seq_name", "")))
            gv_by_acc[acc] = g

        consensus_by_acc = {}
        for rec in s["consensus"]:
            # record names look like <Accession>_<sample>_consensus
            acc = re.sub(rf"_{re.escape(sample_id)}_consensus$", "", rec["record"])
            consensus_by_acc[acc] = rec

        samples_out.append({
            "id": sample_id,
            "type": infer_sample_type(sample_id, sample_types.get(sample_id)),
            "filtered_reads": filtered,
            "raw_reads": raw,
            "pre_host_reads": rs.get("reads pre-host removal"),
            "viral_reads": viral,
            "has_genomad": bool(s.get("genomad_present")),
            "readstats": s["readstats"],
            "params": {
                k: s["params"].get(k)
                for k in ("version", "MM_SET", "QUAL", "FILTER_SEQS", "DEDUP",
                          "MINAL", "spthresh", "subspthresh", "READ_FMT")
                if k in s["params"]
            },
            "n_contigs": len(s["info"]),
            "n_assemblies": len(s["assemblies"]),
        })

        for r in s["info"]:
            acc = r["Accession"]
            length = int(r["Length"])
            cov = [float(w["average_coverage"]) for w in cov_by_acc.get(acc, [])]
            cons = consensus_by_acc.get(acc)
            gv = gv_by_acc.get(acc)
            covered = r.get("covered_bases") or 0
            contigs.append({
                "id": f"{sample_id}|{acc}",
                "sample": sample_id,
                "name": r.get("Name"),
                "description": r.get("description"),
                "accession": acc,
                "segment": r.get("Segment"),
                "assembly": r.get("Assembly"),
                "length": length,
                "asm_length": r.get("Asm_length"),
                **{rank: strip_rank(r.get(rank)) for rank in RANKS},
                "adj": bool(r.get("adj_taxonomy")),
                "rpkmf": r.get("RPKMF"),
                "reads": r.get("read_count"),
                "covered": covered,
                "pct_covered": covered / length if length else 0.0,
                "mean_cov": r.get("mean_coverage"),
                "read_id": r.get("avg_read_identity"),
                "cons_id": r.get("consensus_ref_identity"),
                "pi": r.get("Pi"),
                "win": _window_size(length),
                "cov": cov,
                "consensus_n_frac": (cons["n_count"] / cons["length"]) if cons and cons["length"] else None,
                "orfs": sorted(orfs_by_acc.get(acc, [])),
                "gv_score": _float(gv.get("virus_score")) if gv else None,
                "gv_tax": (gv.get("taxonomy") or None) if gv else None,
                "gv_hallmarks": _int(gv.get("n_hallmarks")) if gv else None,
            })

        for r in s["assemblies"]:
            assemblies.append({
                "sample": sample_id,
                "assembly": r.get("Assembly"),
                "asm_length": r.get("Asm_length"),
                **{rank: strip_rank(r.get(rank)) for rank in RANKS},
                "adj": bool(r.get("adj_taxonomy")),
                "reads": r.get("read_count"),
                "covered": r.get("covered_bases"),
                "pct_covered": (r.get("covered_bases") or 0) / r["Asm_length"] if r.get("Asm_length") else None,
                "read_id": r.get("avg_read_identity"),
                "cons_id": r.get("consensus_ref_identity"),
                "rpkmf": r.get("RPKMF"),
                "accessions": str(r.get("Accession") or "").split(","),
                "segments": str(r.get("Segment") or "").split(","),
            })

        for r in s["tax"]:
            tax.append({
                "sample": sample_id,
                **{rank: strip_rank(r.get(rank)) for rank in RANKS},
                "reads": r.get("read_count"),
                "rpkmf": r.get("RPKMF"),
                "read_id": r.get("avg_read_identity"),
                "cons_id": r.get("consensus_ref_identity"),
                "assemblies": str(r.get("assembly_list") or "").split(","),
            })

    return {
        "meta": {
            "project": project["project"],
            "directory": project["directory"],
            "generated": _dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "run_id": run_id or project["project"],
            "db_version": db_version,
            "mgviz_version": __version__,
            "ranks": RANKS,
            "sample_types": SAMPLE_TYPES,
            "host_range": _host_range(),
            "palettes": load_palettes(),
        },
        "samples": samples_out,
        "contigs": contigs,
        "assemblies": assemblies,
        "tax": tax,
    }
