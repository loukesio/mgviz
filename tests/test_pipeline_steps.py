"""End-to-end test of the per-step CLIs on a tiny synthetic BAM (no external tools)."""
import json
import random
import subprocess
import sys
from pathlib import Path

import pysam
import pytest

from mgviz.pipeline import filter_aln, cluster_refs, contig_stats, lca_taxonomy, tables
from mgviz.pipeline._common import read_tsv, write_tsv, TAX_RANKS

META_COLS = ["Accession", "Name", "description", "Length", "Segment", "Assembly", "Asm_length", "TaxID", *TAX_RANKS]


def _lineage(fam, gen, sp, t):
    return {"kingdom": "k__Orthornavirae", "phylum": "p__Pisuviricota", "tclass": "c__Pisoniviricetes",
            "order": "o__Picornavirales", "family": f"f__{fam}", "genus": f"g__{gen}", "species": f"s__{sp}", "subspecies": f"t__{t}"}


@pytest.fixture
def world(tmp_path):
    random.seed(1)
    seqs = {"ACC1.1": "".join(random.choice("ACGT") for _ in range(1200)),
            "ACC2.1": "".join(random.choice("ACGT") for _ in range(900)),
            "ACC3.1": "".join(random.choice("ACGT") for _ in range(1000))}
    meta = [
        {"Accession": "ACC1.1", "Name": "Virus one", "description": "v1", "Length": 1200, "Segment": "", "Assembly": "ASM1", "Asm_length": 1200, "TaxID": "1", **_lineage("FamA", "GenA", "spA", "strainA")},
        {"Accession": "ACC2.1", "Name": "Virus two", "description": "v2", "Length": 900, "Segment": "", "Assembly": "ASM2", "Asm_length": 900, "TaxID": "2", **_lineage("FamA", "GenA", "spA", "strainB")},
        {"Accession": "ACC3.1", "Name": "Virus three", "description": "v3", "Length": 1000, "Segment": "", "Assembly": "ASM3", "Asm_length": 1000, "TaxID": "3", **_lineage("FamB", "GenB", "spB", "strainC")},
    ]
    meta_path = tmp_path / "virus_pathogen_database.all_metadata.tsv"
    write_tsv(meta_path, meta, META_COLS)
    fasta = tmp_path / "virus_pathogen_database.fna"
    with open(fasta, "w") as fh:
        for k, s in seqs.items():
            fh.write(f">{k}\n{s}\n")
    # SAM: reads on ACC1 (40, with 20 also secondary on ACC2 -> shares reads), ACC3 (10), plus junk alignments
    header = {"HD": {"VN": "1.6", "SO": "unsorted"}, "SQ": [{"SN": k, "LN": len(s)} for k, s in seqs.items()]}
    sam = tmp_path / "initial.sam"
    with pysam.AlignmentFile(sam, "w", header=header) as out:
        def rec(name, ref, pos, L=150, nm=2, secondary=False, cigar=None):
            a = pysam.AlignedSegment(out.header)
            a.query_name, a.reference_id, a.reference_start = name, out.get_tid(ref), pos
            a.mapping_quality, a.flag = 60, (256 if secondary else 0)
            a.cigar = cigar or [(0, L)]
            clip = sum(n for op, n in a.cigar if op == 4)
            a.query_sequence = "A" * clip + seqs[ref][pos:pos + L]
            a.set_tag("NM", nm)
            out.write(a)
        for i in range(40):
            rec(f"r{i}", "ACC1.1", (i * 25) % 1000)
            if i < 20:
                rec(f"r{i}", "ACC2.1", (i * 25) % 700, secondary=True)
        for i in range(10):
            rec(f"s{i}", "ACC3.1", i * 80)
        rec("bad_short", "ACC1.1", 10, L=60)                          # aligned < 100
        rec("bad_ident", "ACC1.1", 10, nm=50)                         # identity 0.67
        rec("bad_cov", "ACC1.1", 10, L=150, cigar=[(4, 60), (0, 150)])  # 150/210 read cov < 0.9
    return {"dir": tmp_path, "meta": meta_path, "fasta": fasta, "sam": sam}


def test_filter_aln_and_count(world):
    out = world["dir"] / "filt.sam"
    cnt = world["dir"] / "count.txt"
    filter_aln.main(["--in", str(world["sam"]), "--out", str(out), "--count-out", str(cnt)])
    kept = [r.query_name for r in pysam.AlignmentFile(out)]
    assert len(kept) == 70 and not any(k.startswith("bad") for k in kept)
    assert cnt.read_text().strip() == "53"  # 40 + 10 + 3 primary records


def _bam(world):
    filt = world["dir"] / "filt.sam"
    filter_aln.main(["--in", str(world["sam"]), "--out", str(filt)])
    bam = world["dir"] / "final.bam"
    pysam.sort("-o", str(bam), str(filt))
    pysam.index(str(bam))
    return bam


def test_cluster_refs_picks_exemplar(world):
    bam = _bam(world)
    d = world["dir"]
    cluster_refs.main(["--bam", str(bam), "--db-fasta", str(world["fasta"]), "--db-meta", str(world["meta"]),
                       "--sample", "S", "--out-fasta", str(d / "refs.fa"), "--out-network", str(d / "net.tsv"),
                       "--out-clusters", str(d / "clu.tsv")])
    clu = {r["assembly"]: r for r in read_tsv(d / "clu.tsv")}
    assert clu["ASM2"]["exemplar"] == "ASM1" and clu["ASM1"]["is_exemplar"] == "true"
    assert clu["ASM3"]["is_exemplar"] == "true"
    names = [l[1:].strip() for l in open(d / "refs.fa") if l.startswith(">")]
    assert sorted(names) == ["ACC1.1", "ACC3.1"]


def test_contig_stats_windows(world):
    bam = _bam(world)
    stats, wins = contig_stats.compute(str(bam), threads=2)
    by = {s["Accession"]: s for s in stats}
    assert by["ACC1.1"]["read_count"] == 40 and by["ACC3.1"]["read_count"] == 10
    assert "ACC2.1" not in by  # secondary-only
    assert 0.98 < by["ACC1.1"]["avg_read_identity"] < 1.0
    assert sum(1 for w in wins if w["Accession"] == "ACC1.1") == 100
    assert by["ACC3.1"]["covered_bases"] == 10 * 80 + 70


def test_lca_taxonomy(world):
    d = world["dir"]
    paf = d / "cons.paf"
    # ASM1 consensus ties between ACC1 (spA/strainA) and ACC2 (spA/strainB) -> LCA at species, subspecies unclassified
    rows = ["ACC1.1_S_consensus\t1200\t0\t1200\t+\tACC1.1\t1200\t0\t1200\t1180\t1200\t60\tcs:Z::1180",
            "ACC1.1_S_consensus\t1200\t0\t1200\t+\tACC2.1\t900\t0\t900\t1180\t1200\t60\tcs:Z::1180",
            "ACC3.1_S_consensus\t1000\t0\t1000\t+\tACC3.1\t1000\t0\t1000\t990\t1000\t60\tcs:Z::990"]
    paf.write_text("\n".join(rows) + "\n")
    lca_taxonomy.main(["--paf", str(paf), "--db-meta", str(world["meta"]), "--sample", "S", "--out", str(d / "adj.tsv")])
    adj = {r["Assembly"]: r for r in read_tsv(d / "adj.tsv")}
    assert adj["ASM1"]["adj_taxonomy"] == "true" and adj["ASM1"]["subspecies"] == "t__unclassified_spA"
    assert adj["ASM1"]["species"] == "s__spA"
    assert adj["ASM3"]["adj_taxonomy"] == "false" and float(adj["ASM3"]["consensus_ref_identity"]) == 0.99


def test_tables_then_mgviz_report(world):
    d = world["dir"]
    bam = _bam(world)
    contig_stats.main(["--bam", str(bam), "--sample", "S", "--out-stats", str(d / "st.tsv"), "--out-windows", str(d / "win.tsv")])
    (d / "adj.tsv").write_text("\t".join(lca_taxonomy.OUT_COLS) + "\n")
    (d / "count.txt").write_text("100000\n")
    (d / "fastp.json").write_text(json.dumps({"summary": {"before_filtering": {"total_reads": 120000}, "after_filtering": {"total_reads": 100000}}}))
    tables.main(["--sample", "S", "--stats", str(d / "st.tsv"), "--adj", str(d / "adj.tsv"), "--db-meta", str(world["meta"]),
                 "--readcount", str(d / "count.txt"), "--fastp-json", str(d / "fastp.json"), "--outdir", str(d / "S")])
    info = read_tsv(d / "S" / "S.detected_virus.info.tsv")
    assert {r["Accession"] for r in info} == {"ACC1.1", "ACC3.1"}
    r1 = next(r for r in info if r["Accession"] == "ACC1.1")
    assert abs(float(r1["RPKMF"]) - 40 / 1.2 / 0.1) < 1e-6
    tax = read_tsv(d / "S" / "S.tax_profile.tsv")
    assert len(tax) == 2
    # the produced directory must be a valid mgviz input
    import shutil
    shutil.copy(d / "win.tsv", d / "S" / "S.virus_coverage_windows.tsv")
    (d / "S" / "S_final_consensus.fasta").write_text(">ACC1.1_S_consensus\nACGTN\n")
    from mgviz.loader import load_project
    from mgviz.bundle import build_bundle
    b = build_bundle(load_project(str(d / "S")))
    assert len(b["contigs"]) == 2 and len(b["contigs"][0]["cov"]) == 100


def test_db_build_lineage(tmp_path):
    from mgviz.pipeline import db_build
    (tmp_path / "nodes.dmp").write_text("1\t|\t1\t|\tno rank\t|\n10\t|\t1\t|\tkingdom\t|\n20\t|\t10\t|\tfamily\t|\n30\t|\t20\t|\tgenus\t|\n40\t|\t30\t|\tspecies\t|\n50\t|\t40\t|\tstrain\t|\n")
    (tmp_path / "names.dmp").write_text("1\t|\troot\t|\t\t|\tscientific name\t|\n10\t|\tOrthornavirae\t|\t\t|\tscientific name\t|\n20\t|\tFamA\t|\t\t|\tscientific name\t|\n30\t|\tGenA\t|\t\t|\tscientific name\t|\n40\t|\tspA\t|\t\t|\tscientific name\t|\n50\t|\tspA strain X\t|\t\t|\tscientific name\t|\n")
    parent, rank, name = db_build.load_taxdump(str(tmp_path))
    lin = db_build.lineage("50", parent, rank, name)
    assert lin["family"] == "f__FamA" and lin["species"] == "s__spA" and lin["subspecies"] == "t__spA strain X"
    assert lin["phylum"] == "p__unclassified_Orthornavirae"
    assert db_build.lineage("40", parent, rank, name)["subspecies"] == "t__unclassified_spA"
