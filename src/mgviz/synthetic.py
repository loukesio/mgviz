"""Write a synthetic EsViritu output directory for prototyping the report.

The files follow the column layouts documented in EsViritu's
``docs/data-directory.md`` so the loader exercises the real contract.

Up to four samples use fixed, hand-written profiles (stable for tests).
Larger requests generate typed samples (stool, nasal, wastewater, clinical)
from the catalogue in :mod:`mgviz.synthetic_catalogue`, with read attrition,
segmented genomes, rare divergent calls and geNomad summaries, so the report
can be checked at 100 samples.
"""

from __future__ import annotations

import math
import os
import random

from .synthetic_catalogue import CATALOGUE, HIGHER, SEG_FLU, SEG_ROTA

RANK_PREFIX = {
    "kingdom": "k__", "phylum": "p__", "tclass": "c__", "order": "o__",
    "family": "f__", "genus": "g__", "species": "s__", "subspecies": "t__",
}

# name, accession, assembly, length, segment, lineage (kingdom..subspecies)
_R = ("Orthornavirae", "Pisuviricota", "Pisoniviricetes", "Picornavirales")
VIRUSES = [
    ("Norovirus GII", [("OP690425.1", 7560, None)], "acc:OP690425.1",
     (*_R[:2], "Pisoniviricetes", "Picornavirales", "Caliciviridae", "Norovirus",
      "Norwalk virus", "norovirus GII.P7-GII.6")),
    ("Porcine circovirus 2", [("NC_006232.1", 1767, None)], "GCF_002819625.1",
     ("Shotokuvirae", "Cressdnaviricota", "Arfiviricetes", "Cirlivirales",
      "Circoviridae", "Circovirus", "Circovirus porcine2", "Circovirus porcine2")),
    ("Rotavirus A", [
        ("NC_011507.2", 3302, "1"), ("NC_011506.2", 2690, "2"), ("NC_011505.2", 2591, "3"),
        ("NC_011510.2", 2362, "4"), ("NC_011500.2", 1611, "5"), ("NC_011509.2", 1356, "6"),
        ("NC_011502.2", 1104, "7"), ("NC_011501.2", 1059, "8"), ("NC_011508.2", 1074, "9"),
        ("NC_011503.2", 751, "10"), ("NC_011504.2", 667, "11")], "GCF_000865435.1",
     ("Orthornavirae", "Duplornaviricota", "Resentoviricetes", "Reovirales",
      "Sedoreoviridae", "Rotavirus", "Rotavirus alphagastroenteritidis", "Rotavirus A G1P[8]")),
    ("Influenza A virus (H3N2)", [
        ("CY121680.1", 2341, "PB2"), ("CY121681.1", 2341, "PB1"), ("CY121682.1", 2233, "PA"),
        ("CY121683.1", 1778, "HA"), ("CY121684.1", 1565, "NP"), ("CY121685.1", 1413, "NA"),
        ("CY121686.1", 1027, "M"), ("CY121687.1", 890, "NS")], "GCF_000865085.1",
     ("Orthornavirae", "Negarnaviricota", "Insthoviricetes", "Articulavirales",
      "Orthomyxoviridae", "Alphainfluenzavirus", "Alphainfluenzavirus influenzae", "H3N2")),
    ("Severe acute respiratory syndrome coronavirus 2", [("MN908947.3", 29903, None)], "GCF_009858895.2",
     ("Orthornavirae", "Pisuviricota", "Pisoniviricetes", "Nidovirales",
      "Coronaviridae", "Betacoronavirus", "Betacoronavirus pandemicum", "SARS-CoV-2 JN.1")),
    ("Human adenovirus C", [("AC_000008.1", 35937, None)], "GCF_000846805.1",
     ("Bamfordvirae", "Preplasmiviricota", "Tectiliviricetes", "Rowavirales",
      "Adenoviridae", "Mastadenovirus", "Mastadenovirus caesari", "Human adenovirus 2")),
    ("Torque teno virus", [("AF129887.1", 3739), ], "set:AF129887",
     ("Shotokuvirae", "Cressdnaviricota", "Arfiviricetes", "Cirlivirales",
      "Anelloviridae", "unclassified_Anelloviridae", "Torque teno virus", "Torque teno virus")),
    ("Turnip yellows virus", [("PP503019.1", 5694, None)], "acc:PP503019.1",
     ("Orthornavirae", "Kitrinoviricota", "Tolucaviricetes", "Tolivirales",
      "Solemoviridae", "Polerovirus", "Polerovirus TYV", "Turnip yellows virus")),
    ("Porcine parvovirus", [("NC_001718.1", 5075, None)], "GCF_000839485.1",
     ("Shotokuvirae", "Cossaviricota", "Quintoviricetes", "Piccovirales",
      "Parvoviridae", "Protoparvovirus", "Protoparvovirus ungulate1", "Porcine parvovirus")),
    ("Enterovirus D68", [("KM881710.2", 7332, None)], "acc:KM881710.2",
     ("Orthornavirae", "Pisuviricota", "Pisoniviricetes", "Picornavirales",
      "Picornaviridae", "Enterovirus", "Enterovirus deconjuncti", "Enterovirus D68 B3")),
    ("Hepatitis B virus", [("NC_003977.2", 3215, None)], "GCF_000861825.2",
     ("Pararnavirae", "Artverviricota", "Revtraviricetes", "Blubervirales",
      "Hepadnaviridae", "Orthohepadnavirus", "Orthohepadnavirus hominoidei", "HBV genotype D")),
]

RANKS = list(RANK_PREFIX)

SAMPLE_PROFILES = [
    # (sample name, filtered reads, {virus index: (mean depth, covered fraction, identity)})
    ("stool_A01", 2_450_000, {0: (820, 1.0, 0.952), 1: (28, 0.70, 0.990), 2: (210, 0.97, 0.985),
                              6: (0.6, 0.04, 0.987), 8: (0.4, 0.03, 0.994)}),
    ("stool_A02", 1_980_000, {2: (45, 0.88, 0.912), 9: (150, 0.99, 0.975), 10: (12, 0.55, 0.998),
                              6: (1.2, 0.08, 0.982)}),
    ("wastewater_W1", 5_120_000, {0: (95, 0.98, 0.930), 4: (300, 1.0, 0.996), 3: (18, 0.72, 0.968),
                                  7: (0.9, 0.05, 0.987), 5: (6, 0.42, 0.951), 2: (3, 0.3, 0.995)}),
    ("nasal_N07", 880_000, {3: (640, 1.0, 0.991), 4: (9, 0.61, 0.994), 5: (1.5, 0.11, 0.962)}),
]

TYPE_MIX = [("stool", 0.40), ("nasal", 0.30), ("wastewater", 0.18), ("clinical", 0.12)]


def _smooth_profile(rng: random.Random, n: int, mean_depth: float, covered_frac: float) -> list[float]:
    """Random smooth coverage with contiguous gaps so ``covered_frac`` of windows are > 0."""
    bumps = [(rng.uniform(0, n), rng.uniform(n * 0.05, n * 0.3), rng.uniform(0.3, 1.0))
             for _ in range(rng.randint(3, 7))]
    raw = []
    for i in range(n):
        v = 0.15
        for c, w, a in bumps:
            v += a * math.exp(-((i - c) ** 2) / (2 * w * w))
        raw.append(v)
    scale = mean_depth / (sum(raw) / n)
    prof = [v * scale * rng.uniform(0.85, 1.15) for v in raw]
    n_gap = int(round(n * (1 - covered_frac)))
    if n_gap > 0:
        remaining = n_gap
        while remaining > 0:
            size = min(remaining, rng.randint(2, max(2, n_gap // 2)))
            start = rng.randint(0, n - size)
            for j in range(start, start + size):
                prof[j] = 0.0
            remaining -= size
        # low-depth samples look like isolated spikes
    if mean_depth < 2:
        prof = [v * rng.choice([0, 0, 0, 1, 1, 3]) for v in prof]
        if all(v == 0 for v in prof):
            prof[rng.randint(0, n - 1)] = mean_depth * 4
    return [round(v, 3) for v in prof]


def _lineage_cols(lineage: tuple) -> dict:
    return {rank: RANK_PREFIX[rank] + name for rank, name in zip(RANKS, lineage)}


def _write_orfs(path, contigs, rng):
    """Toy gene calls: tile each genome with ORFs of 300-3000 bp, both strands."""
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("Accession\torf_id\tstart\tend\tstrand\tlength_aa\tpartial\tstart_codon\trbs_motif\tgc_cont\n")
        for acc, length in contigs:
            pos, i = rng.randint(1, 120), 0
            while pos < length - 150:
                size = min(rng.randint(300, 3000), length - pos)
                size -= size % 3
                i += 1
                strand = "+" if rng.random() < 0.7 else "-"
                partial = (pos + size >= length - 3)
                fh.write(f"{acc}\t{acc}_{i}\t{pos}\t{pos + size - 1}\t{strand}\t{size // 3}\t{'true' if partial else 'false'}\tATG\tNone\t{rng.uniform(0.35, 0.55):.3f}\n")
                pos += size + rng.randint(1, 60)


def _genomad_score(rng: random.Random, cov_frac: float, ident: float) -> tuple[float, int]:
    """Virus score and hallmark count: high for well-covered genomes, rarely low."""
    base = 0.55 + 0.44 * min(1.0, cov_frac * 1.1)
    if cov_frac >= 0.6 and rng.random() < 0.03:      # rare "LOW GENOMAD" case
        base = rng.uniform(0.3, 0.55)
    score = max(0.05, min(0.995, base + rng.uniform(-0.04, 0.03)))
    hall = max(0, int(round(score * 5 + rng.uniform(-1, 2))))
    return round(score, 4), hall


def _catalogue_viruses(rng: random.Random):
    """Expand the catalogue into VIRUSES-style entries plus per-entry affinity data."""
    out, meta = [], []
    acc_n = 100000
    for entry in CATALOGUE:
        fam, genus, species, strains, length, aff, prev, level = entry[:8]
        kind = entry[8] if len(entry) > 8 else None
        for strain in strains:
            acc_n += 1
            if kind == "flu":
                contigs = [(f"CY{acc_n}{i}.1", ln, lab) for i, (lab, ln) in enumerate(SEG_FLU)]
                assembly = f"GCF_{acc_n:09d}.1"
            elif kind == "rota":
                contigs = [(f"NC_{acc_n}{i:02d}.2", ln, lab) for i, (lab, ln) in enumerate(SEG_ROTA)]
                assembly = f"GCF_{acc_n:09d}.1"
            else:
                contigs = [(f"MG{acc_n}.1", length, None)]
                assembly = f"acc:MG{acc_n}.1"
            lineage = (*HIGHER[fam], fam, genus, species, strain)
            out.append((strain, contigs, assembly, lineage))
            meta.append((aff, prev / len(strains) * 1.6, level))
    return out, meta


def _generate_profiles(rng: random.Random, n_samples: int, viruses, meta):
    """Typed samples with virus mixes that depend on the sample type."""
    letters = {"stool": "s", "nasal": "n", "wastewater": "w", "clinical": "c"}
    counts = {t: 0 for t, _ in TYPE_MIX}
    names = []
    for i in range(n_samples):
        # deterministic type mix: cumulative share
        t = next(ty for ty, share in _cum(TYPE_MIX) if (i + 0.5) / n_samples < share)
        counts[t] += 1
        names.append((f"{t}_{t[0].upper()}{counts[t]:02d}", t))
    profiles = []
    for name, t in names:
        filtered = int(rng.uniform(0.2, 5.5) * 1e6)
        prof = {}
        for vi, (aff, prev, level) in enumerate(meta):
            p = prev if letters[t] in aff else prev * 0.08
            if t == "wastewater":
                p *= 1.4
            if rng.random() >= p:
                continue
            reads = max(1, int(round(math.exp(level + rng.gauss(0, 1.3)))))
            total_len = sum(c[1] for c in viruses[vi][1])
            depth = reads * 150 / total_len
            cov = min(1.0, (1 - math.exp(-depth * 1.2)) * rng.uniform(0.85, 1.0))
            if cov < 0.02:
                cov = 0.02
            ident = rng.uniform(0.86, 0.895) if rng.random() < 0.025 else rng.uniform(0.956, 0.998)
            prof[vi] = (depth, cov, ident)
        profiles.append((name, filtered, prof))
    return profiles


def _cum(mix):
    acc = 0.0
    for t, share in mix:
        acc += share
        yield t, acc


def write_synthetic_project(directory: str, n_samples: int = 3, seed: int = 7) -> None:
    rng = random.Random(seed)
    os.makedirs(directory, exist_ok=True)
    if n_samples <= len(SAMPLE_PROFILES):
        viruses, profiles = VIRUSES, SAMPLE_PROFILES[:n_samples]
    else:
        viruses, meta = _catalogue_viruses(rng)
        profiles = _generate_profiles(rng, n_samples, viruses, meta)
    for sample, filtered, profile in profiles:
        _write_sample(directory, sample, filtered, profile, viruses, rng)


def _write_sample(directory, sample, filtered, profile, viruses, rng):
    info_cols = ["sample_ID", "Name", "description", "Length", "Segment", "Accession", "Assembly",
                 "Asm_length", *RANKS, "adj_taxonomy", "RPKMF", "read_count", "covered_bases",
                 "mean_coverage", "avg_read_identity", "consensus_ref_identity", "Pi",
                 "filtered_reads_in_sample"]
    asm_cols = ["sample_ID", "filtered_reads_in_sample", "Assembly", "Asm_length", *RANKS,
                "adj_taxonomy", "read_count", "covered_bases", "avg_read_identity",
                "consensus_ref_identity", "Accession", "Segment", "RPKMF"]
    tax_cols = ["sample_ID", "filtered_reads_in_sample", *RANKS, "read_count", "RPKMF",
                "avg_read_identity", "consensus_ref_identity", "assembly_list"]
    win_cols = ["Accession", "window_index", "window_start", "window_end", "average_coverage"]
    gv_cols = ["seq_name", "length", "topology", "coordinates", "n_genes", "genetic_code",
               "virus_score", "fdr", "n_hallmarks", "marker_enrichment", "taxonomy"]

    def tsv(path, cols, rows):
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("\t".join(cols) + "\n")
            for r in rows:
                fh.write("\t".join("" if r.get(c) is None else str(r.get(c)) for c in cols) + "\n")

    info_rows, win_rows, fasta, orf_contigs, gv_rows = [], [], [], [], []
    for vi, (depth, cov_frac, ident) in profile.items():
        name, contigs, assembly, lineage = viruses[vi]
        asm_length = sum(c[1] for c in contigs)
        adj = ident < 0.94 and rng.random() < 0.5
        cons_id = min(1.0, ident + rng.uniform(0.0, 0.03))
        gv_score, hall = _genomad_score(rng, cov_frac, ident)
        for contig in contigs:
            acc, length, seg = (contig + (None,))[:3]
            seg_depth = depth * rng.uniform(0.5, 1.6)
            prof = _smooth_profile(rng, 100, seg_depth, cov_frac * rng.uniform(0.85, 1.0))
            win = max(1, length // 100)
            covered = sum(win if v > 0 else 0 for v in prof)
            covered = min(covered, length)
            mean_cov = sum(prof) / 100
            reads = max(1, int(round(mean_cov * length / 150)))
            rpkmf = reads / (length / 1000) / (filtered / 1e6)
            pi = 0.0 if reads < 50 else round(rng.uniform(0.0005, 0.01) * (1 if ident > 0.95 else 2.5), 4)
            row = {
                "sample_ID": sample, "Name": name + (" [tax adj: " + lineage[6] + "]" if adj else ""),
                "description": f"{name} segment {seg}, complete sequence" if seg else f"{name}, complete genome",
                "Length": length, "Segment": seg, "Accession": acc, "Assembly": assembly,
                "Asm_length": asm_length, **_lineage_cols(lineage),
                "adj_taxonomy": str(adj).lower(), "RPKMF": round(rpkmf, 4), "read_count": reads,
                "covered_bases": covered, "mean_coverage": round(mean_cov, 3),
                "avg_read_identity": round(ident * rng.uniform(0.995, 1.0), 4),
                "consensus_ref_identity": round(cons_id, 4), "Pi": pi,
                "filtered_reads_in_sample": filtered,
            }
            info_rows.append(row)
            for i, v in enumerate(prof):
                start = i * win
                end = length if i == 99 else min((i + 1) * win, length)
                win_rows.append({"Accession": acc, "window_index": i, "window_start": start,
                                 "window_end": end, "average_coverage": v})
            n_frac = 1 - covered / length
            seq = "".join(rng.choice("ACGT") for _ in range(60))
            fasta.append(f">{acc}_{sample}_consensus\n{seq}\n{'N' * int(60 * n_frac)}\n")
            orf_contigs.append((acc, length))
            gv_rows.append({"seq_name": f"{acc}_{sample}_consensus", "length": length, "topology": "No terminal repeats",
                            "coordinates": "NA", "n_genes": max(1, length // 900), "genetic_code": 1,
                            "virus_score": gv_score, "fdr": "NA", "n_hallmarks": hall, "marker_enrichment": round(gv_score * 8, 3),
                            "taxonomy": ";".join(["Viruses", *lineage[:5]])})

    # assembly summary
    asm_rows = []
    by_asm: dict[str, list] = {}
    for r in info_rows:
        by_asm.setdefault(r["Assembly"], []).append(r)
    for assembly, rows in by_asm.items():
        reads = sum(r["read_count"] for r in rows)
        asm_rows.append({
            "sample_ID": sample, "filtered_reads_in_sample": filtered, "Assembly": assembly,
            "Asm_length": rows[0]["Asm_length"], **{k: rows[0][k] for k in RANKS},
            "adj_taxonomy": rows[0]["adj_taxonomy"], "read_count": reads,
            "covered_bases": sum(r["covered_bases"] for r in rows),
            "avg_read_identity": round(sum(r["avg_read_identity"] for r in rows) / len(rows), 4),
            "consensus_ref_identity": rows[0]["consensus_ref_identity"],
            "Accession": ",".join(r["Accession"] for r in rows),
            "Segment": ",".join(str(r["Segment"] or "") for r in rows),
            "RPKMF": round(reads / (rows[0]["Asm_length"] / 1000) / (filtered / 1e6), 4),
        })

    # tax profile with 0.90 / 0.95 thresholds, like esv_funcs.tax_profile
    tax_rows = []
    for a in asm_rows:
        eff = a["consensus_ref_identity"] or a["avg_read_identity"]
        species = a["species"]
        if eff < 0.90:
            species = "s__unclassified_" + a["genus"].replace("g__", "").replace("unclassified_", "")
        subsp = a["subspecies"]
        if eff < 0.95:
            subsp = "t__unclassified_" + species.replace("s__", "").replace("unclassified_", "")
        tax_rows.append({
            "sample_ID": sample, "filtered_reads_in_sample": filtered,
            **{k: a[k] for k in RANKS[:6]}, "species": species, "subspecies": subsp,
            "read_count": a["read_count"], "RPKMF": a["RPKMF"],
            "avg_read_identity": a["avg_read_identity"],
            "consensus_ref_identity": a["consensus_ref_identity"], "assembly_list": a["Assembly"],
        })

    base = os.path.join(directory, sample)
    tsv(base + ".detected_virus.info.tsv", info_cols, info_rows)
    tsv(base + ".detected_virus.assembly_summary.tsv", asm_cols, asm_rows)
    tsv(base + ".tax_profile.tsv", tax_cols, tax_rows)
    tsv(base + ".virus_coverage_windows.tsv", win_cols, win_rows)
    tsv(base + "_final_consensus_virus_summary.tsv", gv_cols, gv_rows)
    stype = sample.split("_")[0]
    host_frac = {"wastewater": 0.96, "stool": rng.uniform(0.55, 0.85), "nasal": rng.uniform(0.08, 0.28),
                 "clinical": rng.uniform(0.05, 0.2)}.get(stype, 0.5)
    pre_host = int(filtered / host_frac)
    pre_q = int(pre_host * rng.uniform(1.04, 1.12))
    with open(base + "_esviritu.readstats.yaml", "w", encoding="utf-8") as fh:
        fh.write(f"reads pre-quality filter: {pre_q}\n")
        fh.write(f"reads pre-host removal: {pre_host}\n")
        fh.write(f"reads for EsViritu denominator: {filtered}\n")
    with open(base + "_esviritu.params.yaml", "w", encoding="utf-8") as fh:
        fh.write("CPU: 8\nDEDUP: false\nFILTER_SEQS: true\nMINAL: 100\nMM_SET: sr\nQUAL: true\n"
                 f"READ_FMT: paired\nSAMPLE: {sample}\nspthresh: 0.9\nsubspthresh: 0.95\n"
                 "version: 1.3.4\ndb_version: v3.2.4\n")
    with open(base + "_final_consensus.fasta", "w", encoding="utf-8") as fh:
        fh.writelines(fasta)
    _write_orfs(base + ".orfs.tsv", orf_contigs, rng)
