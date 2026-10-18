"""Render a JSON bundle into a single self-contained HTML report.

The page is assembled from ``templates/report.html``, ``templates/report.css``
and the JavaScript parts in ``templates/js/`` (concatenated in file-name order),
with d3 v7 inlined from ``static/``. No build step and no network access.
"""

from __future__ import annotations

import json
from importlib import resources


def _asset(folder: str, name: str) -> str:
    return resources.files("mgviz").joinpath(folder, name).read_text(encoding="utf-8")


def _js_parts() -> str:
    folder = resources.files("mgviz").joinpath("templates", "js")
    names = sorted(p.name for p in folder.iterdir() if p.name.endswith(".js"))
    return "\n".join(f"// ---- {n}\n" + folder.joinpath(n).read_text(encoding="utf-8") for n in names)


def render_html(bundle: dict, title: str | None = None) -> str:
    """Return the full HTML text for a report built from ``bundle``."""
    html = _asset("templates", "report.html")
    css = _asset("templates", "report.css")
    js = _js_parts()
    d3 = _asset("static", "d3.v7.min.js")

    # Embedded JSON must not be able to close the script tag.
    data = json.dumps(bundle, separators=(",", ":")).replace("</", "<\\/")
    page_title = title or f"{bundle['meta']['project']} · mgviz"

    return (
        html.replace("/*__TITLE__*/", page_title)
        .replace("/*__CSS__*/", css)
        .replace("/*__D3__*/", d3)
        .replace("/*__DATA__*/", data)
        .replace("/*__JS__*/", js)
    )
