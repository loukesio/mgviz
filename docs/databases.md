# loukesio/mgviz: Databases

mgviz maps reads to a reference database in the EsViritu format: a directory
with `virus_pathogen_database.fna` (genomes, one record per accession),
`virus_pathogen_database.mmi` (the minimap2 index) and
`virus_pathogen_database.all_metadata.tsv` (one row per accession with name,
segment, assembly, taxonomy and length). The method is reference-based: a virus
that is not in the database cannot be found, and a divergent relative is found
only as a lower-identity match to its nearest reference.

## The default: EsViritu database v3.2.4

Curated for viruses of humans and animals, dereplicated so the read-sharing
clustering behaves, segment-aware (the segments of one influenza or rotavirus
genome share one assembly), with full taxonomy and a Zenodo DOI
([10.5281/zenodo.17716199](https://doi.org/10.5281/zenodo.17716199)). About
31,000 records. This is the right choice for clinical, respiratory and most
stool samples, and the one the report's confidence tiers were tuned on.

```bash
wget https://zenodo.org/records/17716199/files/esviritu_db_v3.2.4.tar.gz
tar xzf esviritu_db_v3.2.4.tar.gz          # -> v3.2.4/
nextflow run loukesio/mgviz ... --db v3.2.4
```

Its limits are scope, not quality: phages, plant, insect and environmental
viruses are thin, so in wastewater most of the viral signal is not represented.

## Building your own

`BUILD_DB` turns any FASTA plus an accession table into the same format, with
lineages from the NCBI taxdump:

```bash
nextflow run modules/local/build_db/main.nf -profile docker \
    --db_fasta genomes.fna --db_table accessions.tsv --db_name mydb \
    --taxdump taxdump/ --acc2taxid nucl_gb.accession2taxid.gz --db_outdir db
```

The accession table has the columns `Accession, Organism_Name, Length` and
optionally `Assembly` (group the segments of one genome), `Segment`,
`description`, `TaxID` (saves the accession2taxid lookup).

`mgviz.pipeline.db_sources` prepares such tables from public sources:

```bash
# RefSeq viral release -> accession table (TaxID looked up, segments grouped by taxon)
wget https://ftp.ncbi.nlm.nih.gov/refseq/release/viral/viral.1.1.genomic.fna.gz
python -m mgviz.pipeline.db_sources refseq --fasta viral.1.1.genomic.fna.gz \
    --acc2taxid nucl_gb.accession2taxid.gz --out refseq_viral.tsv

# union of sources: the first copy of an accession wins, EsViritu metadata is accepted as a table
python -m mgviz.pipeline.db_sources merge \
    --source v3.2.4/virus_pathogen_database.all_metadata.tsv,v3.2.4/virus_pathogen_database.fna \
    --source refseq_viral.tsv,viral.1.1.genomic.fna.gz \
    --outdir merged
python -m mgviz.pipeline.db_build --table merged/accessions.tsv --fasta merged/genomes.fna \
    --taxdump taxdump/ --outdir mgviz_db
minimap2 -x sr -d mgviz_db/virus_pathogen_database.mmi mgviz_db/virus_pathogen_database.fna
```

NCBI taxonomy files: `https://ftp.ncbi.nlm.nih.gov/pub/taxonomy/taxdump.tar.gz`
and `https://ftp.ncbi.nlm.nih.gov/pub/taxonomy/accession2taxid/nucl_gb.accession2taxid.gz`.

## The extended database (EsViritu + RefSeq viral)

The recipe above is how the `mgviz_db` extension is built: every EsViritu
record plus every RefSeq viral genome that is not already there. Built from
EsViritu v3.2.4 and RefSeq release 237 it holds 45,514 records in 32,997
assemblies and 357 families (1.7 GB with the index), against 30,907 records in
the EsViritu database alone. RefSeq adds the
phages, plant and environmental viruses that wastewater and stool are full of
(crAss-like phages, Microviridae, pepper mild mottle virus and the other
tobamoviruses, insect viruses), at the price of a larger index and more
candidates for the read-sharing clustering to sort out.

Before replacing the default with it, benchmark on your own data: run both
databases on the same samples and compare the detections and the "Needs
checking" flags. The simulator gives a controlled check of recovery:

```bash
python -m mgviz.pipeline.simulate_reads --db mgviz_db --sample sim --accessions random:20 --outdir reads/
```

Known limits of the RefSeq import: segments are grouped by taxon, which is right
for RefSeq's one-reference-per-species rule but merges strains when a species
carries several RefSeq genomes; records without a taxid are dropped; there is no
dereplication across the two sources beyond identical accessions, so a genome
present in both at different accessions keeps both copies (the clustering step
then picks one exemplar at run time).
