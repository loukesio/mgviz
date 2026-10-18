"""Bundle fields and page assembly for the redesigned report."""

import shutil
import subprocess
from importlib import resources

import pytest

from mgviz.bundle import build_bundle, infer_sample_type, read_sample_table
from mgviz.loader import load_project
from mgviz.render import render_html
from mgviz.synthetic import write_synthetic_project


def test_sample_type_inference(tmp_path):
    assert infer_sample_type("stool_S01") == "stool"
    assert infer_sample_type("Nasal-7") == "nasal"
    assert infer_sample_type("patient42") == "sample"
    assert infer_sample_type("patient42", "clinical") == "clinical"
    tbl = tmp_path / "samples.tsv"
    tbl.write_text("sample\ttype\npatient42\tclinical\nx\t\n")
    assert read_sample_table(str(tbl)) == {"patient42": "clinical"}


def test_bundle_has_report_fields(tmp_path):
    out = tmp_path / "esv"
    write_synthetic_project(str(out), n_samples=4, seed=3)
    b = build_bundle(load_project(str(out)), run_id="run42", sample_types={"nasal_N07": "clinical"})
    assert b["meta"]["run_id"] == "run42"
    assert b["meta"]["db_version"] == "v3.2.4"
    assert b["meta"]["host_range"]["rules"]
    by = {s["id"]: s for s in b["samples"]}
    assert by["stool_A01"]["type"] == "stool" and by["nasal_N07"]["type"] == "clinical"
    s = by["stool_A01"]
    assert s["raw_reads"] >= s["pre_host_reads"] >= s["filtered_reads"] > s["viral_reads"] > 0
    assert s["has_genomad"]
    assert all(c["gv_score"] is not None for c in b["contigs"])


def test_large_fixture_scales(tmp_path):
    out = tmp_path / "big"
    write_synthetic_project(str(out), n_samples=60, seed=5)
    b = build_bundle(load_project(str(out)))
    types = {s["type"] for s in b["samples"]}
    assert types == {"stool", "nasal", "wastewater", "clinical"}
    assert len(b["samples"]) == 60
    assert len({c["family"] for c in b["contigs"]}) > 10
    html = render_html(b)
    assert "VIEWS.tree" in html and "VIEWS.heat" in html and "VIEWS.drawer" in html


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_js_parts_parse():
    folder = resources.files("mgviz").joinpath("templates", "js")
    for p in sorted(folder.iterdir()):
        if p.name.endswith(".js"):
            subprocess.run(["node", "--check", str(p)], check=True)
