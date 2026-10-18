# Single image with every pipeline tool plus mgviz. Build from the repo root:
#   docker build -t ghcr.io/loukesio/mgviz:0.1.0 .
FROM mambaorg/micromamba:1.5.10
LABEL org.opencontainers.image.source="https://github.com/loukesio/mgviz" \
      org.opencontainers.image.description="mgviz virus-detection pipeline tools and report"
COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yml /tmp/environment.yml
COPY --chown=$MAMBA_USER:$MAMBA_USER . /opt/mgviz
WORKDIR /opt/mgviz
RUN micromamba install -y -n base -f /tmp/environment.yml && micromamba clean --all --yes
ENV PATH=/opt/conda/bin:$PATH
RUN pip install --no-cache-dir --no-deps /opt/mgviz
# procps gives Nextflow the `ps` it needs for task metrics
RUN micromamba install -y -n base -c conda-forge procps-ng && micromamba clean --all --yes
# sanity check
RUN fastp --version && minimap2 --version && samtools --version | head -1 && mgviz --help >/dev/null
