#!/usr/bin/env bash
# Reserve the aerofoil crate names on crates.io (ADR-0007).
#
# crates.io has no reservation API: a name is held only by publishing a version, and a published
# version can be yanked but never deleted. This publishes `0.1.0-alpha.1` placeholders from a
# throwaway staging tree, mirroring the gaugeblock suite convention: a reservation is never a
# `beta`, and the real crates publish `0.1.0-beta.1` from this workspace when they are
# dogfood-ready. Each placeholder is then yanked.
#
# Usage:
#   scripts/reserve-namespaces.sh check              # are the names free? (read-only)
#   scripts/reserve-namespaces.sh scaffold           # write reserve-staging/<crate>/
#   scripts/reserve-namespaces.sh publish --yes      # publish each placeholder (irreversible)
set -euo pipefail

VERSION="0.1.0-alpha.1"
REPO="https://github.com/colinwolff/aerofoil"
AUTHOR="Colin Wolff"
AUTHOR_EMAIL="1562545+colinwolff@users.noreply.github.com"
LICENSE="Apache-2.0 OR MIT"
UA="aerofoil-reservations/0.1 (${REPO})"
STAGING="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/reserve-staging"

# Shell 3.2 on macOS has no associative arrays, so these two arrays are indexed in parallel.
CRATES=(
  "aerofoil"
  "aerofoil-common"
  "aerofoil-1090"
  "aerofoil-978"
  "aerofoil-tracker"
  "aerofoil-server"
  "aerofoil-cli"
  "aerofoil-mcp"
)
DESCRIPTIONS=(
  "Umbrella namespace for the aerofoil ADS-B and UAT decoding suite."
  "Core aircraft state models, CPR math, units and shared decoder traits for aerofoil."
  "1090 MHz Mode S and 1090ES (DO-260B) demodulation, CRC-24 and downlink format parsing."
  "978 MHz UAT (DO-282B) framing, Reed-Solomon FEC and payload disassembly."
  "Multi-band aircraft track table with ADS-R deduplication for aerofoil."
  "Streaming daemon exposing aerofoil tracks over Beast, AVR, JSON-lines and gRPC."
  "Unix-friendly CLI for decoding ADS-B and UAT feeds into JSON."
  "Model Context Protocol server exposing aerofoil airspace queries to agents."
)

# 404 means the name is free; 200 means somebody already holds it.
is_free() {
  local code
  code=$(curl -s -A "$UA" -o /dev/null -w "%{http_code}" "https://crates.io/api/v1/crates/$1")
  [[ "$code" == "404" ]]
}

cmd_check() {
  echo "crates.io availability (404 = free):"
  echo "-------------------------------------------------------------"
  local i crate verdict free=0 taken=0
  for i in "${!CRATES[@]}"; do
    crate="${CRATES[$i]}"
    if is_free "$crate"; then
      verdict="FREE"
      free=$((free + 1))
    else
      verdict="TAKEN"
      taken=$((taken + 1))
    fi
    printf '  %-18s %s\n' "$crate" "$verdict"
  done
  echo "-------------------------------------------------------------"
  echo "$free free, $taken taken"
  [[ "$taken" -eq 0 ]]
}

cmd_scaffold() {
  rm -rf "$STAGING"
  local i crate description dir
  for i in "${!CRATES[@]}"; do
    crate="${CRATES[$i]}"
    description="${DESCRIPTIONS[$i]}"
    dir="$STAGING/$crate"
    mkdir -p "$dir/src"

    cat > "$dir/Cargo.toml" <<EOF
[package]
name = "$crate"
version = "$VERSION"
edition = "2024"
rust-version = "1.99"
authors = ["$AUTHOR <$AUTHOR_EMAIL>"]
description = "$description"
license = "$LICENSE"
repository = "$REPO"
homepage = "$REPO"

[dependencies]

# Standalone workspace of one: the placeholder lives inside the aerofoil workspace directory, so
# without this Cargo would try to enrol it as a member of the real workspace.
[workspace]
EOF

    cat > "$dir/src/lib.rs" <<EOF
//! Namespace reservation for the \`$crate\` crate (ADR-0007).
//!
//! This release exists only to hold the name on crates.io. The crate is implemented in
//! <$REPO> and publishes as \`0.1.0-beta.1\` or later once it is dogfood-ready; this
//! release is then yanked.
#![no_std]
EOF

    cat > "$dir/README.md" <<EOF
# $crate

> $description

**Namespace reservation.** Version \`$VERSION\` contains no API. The implementation lives in
<$REPO> and publishes under this name once it is dogfood-ready.
EOF
    echo "  scaffolded $crate"
  done
  echo "Staged in $STAGING (gitignored). Next: scripts/reserve-namespaces.sh publish --yes"
}

# crates.io's 429 names the moment the window reopens. A fixed guess sent the retry into the same
# window twice and burned attempts, so honour the timestamp when it is present.
rate_limit_delay() {
  local output="$1" stamp target now delay
  stamp=$(printf '%s' "$output" \
    | grep -oE '[A-Za-z]{3}, [0-9]{2} [A-Za-z]{3} [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT' \
    | head -n1)
  if [ -n "$stamp" ]; then
    target=$(date -j -f '%a, %d %b %Y %H:%M:%S %Z' "$stamp" +%s 2>/dev/null \
          || date -d "$stamp" +%s 2>/dev/null \
          || echo "")
    now=$(date +%s)
    if [ -n "$target" ] && [ "$target" -gt "$now" ]; then
      delay=$((target - now + 15))
      echo "$delay"
      return
    fi
  fi
  # No usable timestamp: wait out the window we know about, then try again.
  echo 305
}

publish_one() {
  local crate="$1" dir="$2" attempt=1 output delay
  while [ "$attempt" -le 8 ]; do
    if output=$(cd "$dir" && cargo publish 2>&1); then
      echo "  published $crate@$VERSION"
      return 0
    fi
    case "$output" in
      *429*|*"Too Many Requests"*|*"try again after"*)
        delay=$(rate_limit_delay "$output")
        echo "  rate limited on $crate (attempt $attempt/8); waiting ${delay}s"
        sleep "$delay"
        attempt=$((attempt + 1))
        ;;
      *)
        echo "$output" >&2
        return 1
        ;;
    esac
  done
  echo "  gave up on $crate after 8 attempts" >&2
  return 1
}

cmd_publish() {
  if [[ "${1:-}" != "--yes" ]]; then
    echo "refusing to publish without --yes: a published version is permanent" >&2
    exit 1
  fi
  if [[ -z "${CARGO_REGISTRY_TOKEN:-}" && ! -f "${HOME}/.cargo/credentials.toml" ]]; then
    echo "no crates.io credentials: run 'cargo login' or export CARGO_REGISTRY_TOKEN" >&2
    exit 1
  fi
  local i crate dir
  local -a failed
  failed=()
  for i in "${!CRATES[@]}"; do
    crate="${CRATES[$i]}"
    dir="$STAGING/$crate"
    [[ -d "$dir" ]] || { echo "missing $dir; run scaffold first" >&2; exit 1; }
    if ! is_free "$crate"; then
      echo "  $crate already exists on crates.io; skipping"
      continue
    fi
    # One crate failing must not abandon the rest of the set: a partially reserved namespace is
    # still better than one that stopped at the first rate limit.
    if ! publish_one "$crate" "$dir"; then
      failed+=("$crate")
    fi
  done
  if [ "${#failed[@]}" -gt 0 ]; then
    echo "not published: ${failed[*]}" >&2
    exit 1
  fi
  echo "all ${#CRATES[@]} names reserved"
}

case "${1:-check}" in
  check) cmd_check ;;
  scaffold) cmd_scaffold ;;
  publish) shift; cmd_publish "$@" ;;
  *)
    echo "usage: $0 {check|scaffold|publish --yes}" >&2
    exit 2
    ;;
esac
