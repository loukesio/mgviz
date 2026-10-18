"""ltc colour palettes (https://github.com/loukesio/ltc), vendored from pyltc.

Regenerate ``static/ltc_palettes.json`` from pyltc when the upstream
package changes; mgviz stays stdlib-only and never imports pyltc at run time.
"""
import json
from pathlib import Path

_JSON = Path(__file__).parent / "static" / "ltc_palettes.json"

MGVIZ_DEFAULT = {
    "colors": ["#2f6db5", "#d9822b", "#3a9a6e", "#c2457a", "#7b63b8", "#a69b22", "#cf5a3c", "#4b9fc6"],
    "bio": "mgviz default: eight categorical family colours, colour-blind safe",
}


def load_palettes() -> dict:
    """Return ``{name: {"colors": [...], "bio": str}}`` with the mgviz default first."""
    pal = {"mgviz": MGVIZ_DEFAULT}
    with open(_JSON, encoding="utf-8") as fh:
        pal.update(json.load(fh))
    return pal
