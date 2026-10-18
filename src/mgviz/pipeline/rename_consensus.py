"""Rename consensus FASTA records to "<Accession>_<sample>_consensus" (stdin -> stdout)."""
import argparse
import sys


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="mgviz.pipeline.rename_consensus", description=__doc__)
    p.add_argument("--sample", required=True)
    return p.parse_args(argv)


def main(argv=None):
    a = parse_args(argv)
    for line in sys.stdin:
        if line.startswith(">"):
            sys.stdout.write(f">{line[1:].split()[0]}_{a.sample}_consensus\n")
        else:
            sys.stdout.write(line)


if __name__ == "__main__":
    main()
