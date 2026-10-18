"""End-to-end check: synthetic EsViritu outputs -> loader -> bundle -> HTML."""

import json

from mgviz.bundle import build_bundle
from mgviz.loader import load_project
from mgviz.render import render_html
from mgviz.synthetic import write_synthetic_project


def test_roundtrip(tmp_path):
    out = tmp_path / "proj_esv"
    write_synthetic_project(str(out), n_samples=3, seed=1)
    project = load_project(str(out))
    assert sorted(project["samples"]) == ["stool_A01", "stool_A02", "wastewater_W1"]

    bundle = build_bundle(project)
    assert bundle["meta"]["project"] == "proj_esv"
    assert len(bundle["samples"]) == 3
    assert bundle["contigs"], "no contigs loaded"
    for c in bundle["contigs"]:
        assert len(c["cov"]) == 100, c["id"]
        assert 0 <= c["pct_covered"] <= 1
        assert c["genus"] is not None and not c["genus"].startswith("g__")
    rota = [c for c in bundle["contigs"] if c["assembly"] == "GCF_000865435.1" and c["sample"] == "stool_A01"]
    assert len(rota) == 11
    assert bundle["tax"] and bundle["assemblies"]

    html = render_html(bundle)
    assert "<title>proj_esv · mgviz</title>" in html
    assert "window.__MGVIZ__" in html
    assert "d3js.org v7" in html
    # embedded JSON is still parseable after the </ escape
    start = html.index("window.__MGVIZ__ = ") + len("window.__MGVIZ__ = ")
    end = html.index(";</script>", start)
    data = json.loads(html[start:end].replace("<\\/", "</"))
    assert data["meta"]["project"] == "proj_esv"


def test_merged_project_tables_are_deduplicated(tmp_path):
    out = tmp_path / "proj"
    write_synthetic_project(str(out), n_samples=2, seed=3)
    # Simulate summarize_esv_runs writing merged tables into the same directory.
    merged = []
    for s in ("stool_A01", "stool_A02"):
        lines = (out / f"{s}.detected_virus.info.tsv").read_text().splitlines()
        merged.append(lines if not merged else lines[1:])
    (out / "proj.detected_virus.info.tsv").write_text("\n".join(l for part in merged for l in part) + "\n")
    project = load_project(str(out))
    n_direct = sum(1 for _ in (out / "stool_A01.detected_virus.info.tsv").read_text().splitlines()) - 1
    assert len(project["samples"]["stool_A01"]["info"]) == n_direct
