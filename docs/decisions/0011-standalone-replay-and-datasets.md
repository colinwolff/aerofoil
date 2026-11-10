---
status: accepted
date: 2026-11-10
---

# 11. Dedicated standalone replay tool (`aerofoil-replay`) and multi-tier datasets

* Deciders: Colin Wolff
* Related: `ADR-0009`, `ADR-0010`, `docs/SPEC.md` §5, `docs/ROADMAP.md` M4

## Context and Problem Statement

Verifying ADS-B / UAT processing pipelines and interactive displays (TUI radar, Web Radar) requires
replaying real-world surveillance traffic. How should dataset replay be structured to support both
high-throughput batch benchmarking and paced, interactive visual testing without coupling frontends
or introducing circular dependencies?

## Considered Options

1. **Subcommand within `aerofoil-cli`:** Adds `aerofoil-cli replay`. While convenient, it entangles
   stream emission with the stdin-to-stdout Unix filter contract.
2. **Dedicated standalone application `aerofoil-replay` (`apps/replay`)** (chosen): An independent
   ecosystem utility that reads Beast binary, AVR hex, JSONL captures, and raw I/Q samples, streaming
   them over TCP sockets (`30005`, `30978`) or stdout with variable playback speed (`1x`, `2x`, `5x`,
   `10x`, `burst`, `--loop`).
3. **Ad-hoc Python/shell scripts (`nc`/`socat`):** Replay using netcat and external tools. Rejected
   due to lack of accurate timing control, no Beast framing awareness, and poor burst throughput.

## Decision Outcome

Chosen option: **Option 2 (Standalone `aerofoil-replay` in `apps/replay`)**.

### Multi-Tier Dataset Strategy:
1. **Repository Datasets Directory (`datasets/`):**
   - Committed test fixtures in `datasets/fixtures/` covering three dedicated scenarios:
     * `1090_dense.beast`: Commercial airline density with multi-altitude vectors and CPR pairs.
     * `dual_band_hub.beast`: Mixed 1090ES and 978 UAT general aviation traffic with ADS-R pairs.
     * `edge_cases.beast`: Single-bit parity errors, Reed-Solomon corruptions, and emergency squawks (`7500`, `7600`, `7700`).
   - Large external public captures stored under `datasets/raw/` (gitignored), fetched via `scripts/download-datasets.sh`.
2. **Pacing Modes:**
   - Real-time and accelerated playback (`1x`, `2x`, `5x`, `10x`) with `--loop` for live UI inspection.
   - Max-speed `burst` mode for macro-benchmarking frames-per-second throughput and zero-allocation assertions.

### Positive Consequences
* `aerofoil-replay` works out-of-the-box with any ADS-B tool in the world (`dump1090`, `readsb`, `aerofoil-server`).
* Clear separation of concerns: replay is an independent feeder; decoders and visualizers remain thin consumers.
* Deterministic CI fixtures ensure automated test reproducibility.

### Negative Consequences
* Additional workspace binary target (`aerofoil-replay`) to maintain and audit.
