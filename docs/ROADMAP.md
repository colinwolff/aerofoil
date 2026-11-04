# Roadmap & Delivery Horizons: `aerofoil`

> **Status:** pre-release (`0.0.0`, nothing published)
> **Scope of record:** [`PROJECT.md`](./PROJECT.md) · **Invariants:** [`SPEC.md`](./SPEC.md)
> **Task backlog:** `storypole` (`.gaugeblock/storypole/`), keys `AF-N`

This file is the single source of truth for sequence and status. A milestone is only moved to `[x]`
when its crates compile, its tests pass and the tiered gates in `AGENTS.md` §3.6 are green.

---

## 0. Bootstrap (current)

- [x] Repository charter, architecture specification, low-level design and MADR records.
- [x] Operating contract (`AGENTS.md`) with the 250/200 line policy, atomic commits, lockstep SemVer,
      Keep a Changelog and the four-tier gate.
- [x] Contributor guide, dual licensing (Apache-2.0 OR MIT), changelog with an `[Unreleased]` section.
- [x] gaugeblock suite state and the canonical 9-document map (`.gaugeblock/docs.toml`).
- [ ] Workspace manifest (`Cargo.toml`) with `[workspace.package]`, shared lints and `rust-version`.
- [ ] CI workflow running Tier 2/3 on every push.
- [ ] Per-crate `verification_commands` registered in `.gaugeblock/config.toml`.

---

## 1. Milestone 1 — Core Primitives & 978 UAT Foundation

- [ ] `aerofoil-common`: `no_std` state models, units, CPR latitude/longitude decoders with the fixed
      60-entry `NL` table (`SPEC.md` Invariant 9).
- [ ] `aerofoil-978`: `GF(2^8)` arithmetic and `RS(48, 34)` decoder validated against DO-282B
      Appendix vectors (`SPEC.md` Invariant 7).
- [ ] `aerofoil-978`: Downlink State Vector (SV) and Mode Status (MS) bitfield parsing.
- [ ] Zero-allocation proof: test suite with a counting allocator asserting zero heap traffic on the
      decode path (`SPEC.md` Invariant 1).

**Exit criteria:** DO-282B vectors decode byte-exactly; every reject path returns a typed error.

---

## 2. Milestone 2 — 1090 Mode S & Error Correction

- [ ] `aerofoil-1090`: CRC-24 syndrome with a precomputed 256-word table and a `pclmulqdq`/`pmull`
      fast path behind a runtime-detected feature.
- [ ] Downlink formats DF0, DF4, DF5, DF11, DF17, DF18, DF20, DF21 (`SPEC.md` Invariant 6).
- [ ] Address-filtered single-bit correction against the tracker's verified address set (ADR-0003).
- [ ] Throughput benchmark targeting `> 2×10^6` frames/sec/core on a single core, tracked in CI.

**Exit criteria:** ICAO Annex 10 test vectors pass; correction never fabricates a new address.

---

## 3. Milestone 3 — Fusion Tracker & CLI

- [ ] `aerofoil-tracker`: sharded track table keyed by `(AddressType, u32)` with TTL expiry
      (`SPEC.md` Invariant 10).
- [ ] ADS-R/TIS-B deduplication within `Δt ≤ 1.0 s`, `Δd ≤ 0.001°`; direct reception always wins.
- [ ] `aerofoil-cli`: Beast and AVR ingestion on `stdin`, JSON-lines on `stdout`, well-behaved under
      `SIGPIPE` (`cat feed.bin | aerofoil-cli | jq`).

**Exit criteria:** a recorded capture replays to identical JSON on two machines; zero allocations per
frame on the hot path.

---

## 4. Milestone 4 — Networking & MCP Agent Integration

- [ ] `aerofoil-server`: TCP Beast ingest (30005/30978), SSE and gRPC streams with backpressure.
- [ ] `aerofoil-mcp`: tools `get_airspace_summary`, `get_track(icao)`, `find_closest(lat, lon)`
      over JSON-RPC 2.0 stdio; logs to stderr only (`SPEC.md` §5).
- [ ] End-to-end test on a recorded high-density airport dataset.

**Exit criteria:** `0.1.0` cut with a tagged release, fresh `Cargo.lock`, and `chalkline docs check`
green.

---

## 5. Horizons (post-`0.1.0`)

- **H1 — Hardening:** fuzzing (`cargo-fuzz`) over every decoder entry point, property tests relating
  the table-driven and CLMUL CRC paths, and a published throughput regression budget.
- **H2 — Breadth:** uplink `RS(92, 72)` and FIS-B APDU disassembly, UAT uplink scheduling, multi-band
  time-synchronised fusion.
- **H3 — Operations:** Prometheus metrics, structured `tracing` spans per pipeline stage, replayable
  recording format, packaging for Raspberry Pi and container images.
- **H4 — Ecosystem:** stable gRPC/protobuf surface, `no_std` embedded example on Cortex-M, and
  long-term wire compatibility guarantees (append-only enums, never-reused field numbers).

Out of scope remains as stated in [`PROJECT.md`](./PROJECT.md) §2: direct SDR sample streaming and
full FIS-B raster rendering.
