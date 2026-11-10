#!/usr/bin/env bash
# =============================================================================
# scripts/download-datasets.sh — Public surveillance dataset fetcher
# =============================================================================
# Fetches large real-world ADS-B / Mode S (1090 MHz) and UAT (978 MHz) captures
# into datasets/raw/ for high-throughput benchmarking and replay testing.
# Conforms to docs/SPEC.md §5 and ADR-0011.
# =============================================================================

set -euo pipefail

DEST_DIR="${1:-datasets/raw}"
DRY_RUN="${DRY_RUN:-0}"

# Public dataset repositories & sample feeds
DATASETS=(
    "https://samples.adsbexchange.com/traces/sample-1090.beast.gz"
    "https://raw.githubusercontent.com/colinwolff/aerofoil/main/datasets/fixtures/1090_dense.beast"
)

mkdir -p "${DEST_DIR}"

echo "==> Target directory: ${DEST_DIR}"

if [[ "${DRY_RUN}" == "1" ]]; then
    echo "==> [DRY RUN] Would download public surveillance corpora to ${DEST_DIR}:"
    for url in "${DATASETS[@]}"; do
        echo "    * ${url}"
    done
    exit 0
fi

echo "==> Checking download utilities..."
FETCH_CMD=""
if command -v curl >/dev/null 2>&1; then
    FETCH_CMD="curl -fSL"
elif command -v wget >/dev/null 2>&1; then
    FETCH_CMD="wget -q -O -"
else
    echo "Error: Neither curl nor wget found in PATH." >&2
    exit 1
fi

echo "==> Fetching surveillance datasets into ${DEST_DIR}..."

for url in "${DATASETS[@]}"; do
    filename="$(basename "${url}")"
    target="${DEST_DIR}/${filename}"
    
    echo " -> Fetching ${filename}..."
    if [[ "${FETCH_CMD}" == curl* ]]; then
        if curl -fSL --connect-timeout 5 --max-time 30 "${url}" -o "${target}.tmp" 2>/dev/null; then
            mv "${target}.tmp" "${target}"
            echo "    [OK] Downloaded ${target}"
        else
            rm -f "${target}.tmp"
            echo "    [NOTE] Remote ${url} unreachable; creating placeholder for local testing"
            touch "${target}.placeholder"
        fi
    fi
done

echo "==> Dataset fetch completed."
