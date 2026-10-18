# Single image with every pipeline tool plus mgviz. Build from the repo root:
#   docker build -t ghcr.io/loukesio/mgviz:0.1.0 .
# The conda environment is installed before the source is copied, so code changes rebuild in seconds.
FROM mambaorg/micromamba:1.5.10
LABEL org.opencontainers.image.source="https://github.com/loukesio/mgviz" \
      org.opencontainers.image.description="mgviz virus-detection pipeline tools and report" \
      org.opencontainers.image.licenses="MIT"

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yml /tmp/environment.yml
RUN micromamba install -y -n base -f /tmp/environment.yml \
    && micromamba install -y -n base -c conda-forge procps-ng \
    && micromamba clean --all --yes
# procps gives Nextflow the `ps` it needs for task metrics
ENV PATH=/opt/conda/bin:$PATH

COPY --chown=$MAMBA_USER:$MAMBA_USER . /opt/mgviz
WORKDIR /opt/mgviz
RUN pip install --no-cache-dir --no-deps /opt/mgviz

# sanity check
RUN fastp --version && minimap2 --version && samtools --version | head -1 && mgviz --help >/dev/null
