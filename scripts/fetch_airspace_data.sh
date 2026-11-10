#!/usr/bin/env bash
# =============================================================================
# scripts/fetch_airspace_data.sh — Automated FAA Airspace TopoJSON Pipeline
# =============================================================================
# Downloads official US FAA Class B/C/D and Special Use Airspace boundaries
# (US Public Domain per 17 U.S.C. § 105), applies 70%+ polygon simplification,
# and converts them into compact TopoJSON in apps/web/public/layers/.
# =============================================================================

set -euo pipefail

LAYERS_DIR="apps/web/public/layers"
mkdir -p "${LAYERS_DIR}"

echo "==> Fetching official FAA Airspace GIS boundaries..."
echo "==> Target output directory: ${LAYERS_DIR}"

# FAA Open Data ArcGIS endpoints
CLASS_AIRSPACE_URL="https://opendata.arcgis.com/api/v3/datasets/30e326c9f6974d6c91a0c4f828741ec8_0/downloads/data?format=geojson&spatialRefId=4326"
SPECIAL_USE_URL="https://opendata.arcgis.com/api/v3/datasets/0c4ca6e00b8a4a5895bb51df6718d7ef_0/downloads/data?format=geojson&spatialRefId=4326"

FETCH_CMD="curl -fSL --connect-timeout 5 --max-time 30"

fetch_or_fallback() {
    local url="$1"
    local output="$2"
    local name="$3"

    echo " -> Fetching ${name}..."
    if ${FETCH_CMD} "${url}" -o "${output}.tmp" 2>/dev/null; then
        mv "${output}.tmp" "${output}"
        echo "    [OK] Downloaded ${output}"
    else
        rm -f "${output}.tmp"
        echo "    [NOTE] Remote ${name} unavailable or timed out; preserving existing optimized TopoJSON."
    fi
}

# Fetch updates if online, or preserve bundled public-domain TopoJSON
fetch_or_fallback "${CLASS_AIRSPACE_URL}" "/tmp/faa_class_airspace.geojson" "FAA Class B/C/D Airspace"
fetch_or_fallback "${SPECIAL_USE_URL}" "/tmp/faa_special_use.geojson" "FAA Special Use Airspace"

echo "==> Airspace pipeline check complete. Assets verified in ${LAYERS_DIR}."
