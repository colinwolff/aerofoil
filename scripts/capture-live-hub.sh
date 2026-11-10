#!/usr/bin/env bash
# =============================================================================
# scripts/capture-live-hub.sh — Live Beast TCP surveillance capture utility
# =============================================================================
# Connects to a live Mode S / Beast TCP feed (e.g. dump1090, readsb, aerofoil-server)
# and records raw Beast frames into datasets/raw/ for high-fidelity replay.
# Usage: ./scripts/capture-live-hub.sh [host] [port] [duration_seconds] [output_file]
# =============================================================================

set -euo pipefail

HOST="${1:-127.0.0.1}"
PORT="${2:-30005}"
DURATION="${3:-60}"
OUTPUT="${4:-datasets/raw/live_capture.beast}"

mkdir -p "$(dirname "${OUTPUT}")"

echo "==> Recording live Beast stream from ${HOST}:${PORT} for ${DURATION}s..."
echo "==> Output destination: ${OUTPUT}"

if command -v nc >/dev/null 2>&1; then
    # Use netcat with timeout
    if command -v timeout >/dev/null 2>&1; then
        timeout "${DURATION}" nc "${HOST}" "${PORT}" > "${OUTPUT}" || true
    else
        # macOS fallback without coreutils timeout
        perl -e 'alarm shift; exec @ARGV' "${DURATION}" nc "${HOST}" "${PORT}" > "${OUTPUT}" || true
    fi
elif command -v socat >/dev/null 2>&1; then
    timeout "${DURATION}" socat -u "TCP:${HOST}:${PORT}" - > "${OUTPUT}" || true
else
    echo "Error: Neither nc nor socat found in PATH." >&2
    exit 1
fi

BYTES=$(wc -c < "${OUTPUT}" | tr -d ' ')
echo "==> Captured ${BYTES} bytes into ${OUTPUT}."
