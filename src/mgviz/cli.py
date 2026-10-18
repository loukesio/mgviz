"""Command line entry points for mgviz."""

from __future__ import annotations

import argparse
import os
import sys

from . import __version__
from .bundle import build_bundle, read_sample_table
from .loader import load_project
from .render import render_html


def _cmd_report(args: argparse.Namespace) -> int:
    project = load_project(args.esviritu_dir)
    if not project["samples"]:
        print(f"No EsViritu outputs found in {args.esviritu_dir}", file=sys.stderr)
        return 1
    types = read_sample_table(args.samples) if getattr(args, "samples", None) else None
    bundle = build_bundle(project, run_id=getattr(args, "run_id", None), sample_types=types)
    out = args.output or os.path.join(
        args.esviritu_dir, f"{bundle['meta']['project']}_mgviz_report.html"
    )
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(render_html(bundle, title=args.title))
    n = len(bundle["contigs"])
    print(f"Wrote {out} ({len(bundle['samples'])} samples, {n} detected contigs)")
    if args.json:
        import json

        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(bundle, fh, indent=1)
        print(f"Wrote {args.json}")
    return 0


def _cmd_demo(args: argparse.Namespace) -> int:
    from .synthetic import write_synthetic_project

    write_synthetic_project(args.directory, n_samples=args.samples, seed=args.seed)
    print(f"Wrote synthetic EsViritu outputs to {args.directory}")
    ns = argparse.Namespace(
        esviritu_dir=args.directory, output=args.output, title=None, json=None,
        samples=None, run_id=os.path.basename(os.path.normpath(args.directory)),
    )
    return _cmd_report(ns)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="mgviz", description="Interactive d3.js reports for EsViritu outputs."
    )
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)

    rep = sub.add_parser("report", help="build an HTML report from an EsViritu output directory")
    rep.add_argument("esviritu_dir", help="directory containing EsViritu per-sample outputs")
    rep.add_argument("-o", "--output", help="output HTML path")
    rep.add_argument("--title", help="page title")
    rep.add_argument("--json", help="also write the data bundle as JSON to this path")
    rep.add_argument("--samples", help="TSV/CSV with sample and type columns (stool, nasal, wastewater, clinical)")
    rep.add_argument("--run-id", help="run identifier shown in the report header")
    rep.set_defaults(func=_cmd_report)

    demo = sub.add_parser("demo", help="write a synthetic EsViritu output directory and report it")
    demo.add_argument("directory", help="directory to create")
    demo.add_argument("-n", "--samples", type=int, default=3,
                      help="up to 4 uses the fixed profiles; more generates typed samples")
    demo.add_argument("--seed", type=int, default=7)
    demo.add_argument("-o", "--output", help="output HTML path")
    demo.set_defaults(func=_cmd_demo)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
