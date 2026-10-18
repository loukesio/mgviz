"""Per-step CLIs used by the Nextflow processes in ``pipeline/modules``.

Each module is runnable as ``python -m mgviz.pipeline.<step>`` and re-implements
one piece of EsViritu's in-script logic (MIT, Mike Tisza). Heavy dependencies
(pysam, polars) are imported lazily so ``mgviz report`` stays stdlib-only.
"""
