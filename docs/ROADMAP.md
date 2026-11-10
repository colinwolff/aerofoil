# Roadmap & Delivery Horizons: `aerofoil`

> **Status:** pre-release (`0.1.0-beta.1` released, `0.1.0-beta.2` in progress, lockstep SemVer)
> **Scope of record:** [`PROJECT.md`](./PROJECT.md) · **Invariants:** [`SPEC.md`](./SPEC.md)
> **Task backlog:** `storypole` (`.gaugeblock/storypole/`), keys `AF-N`

This file is the single source of truth for sequence and status. A milestone is only moved to `[x]`
when its crates compile, its tests pass and the tiered gates in `AGENTS.md` §3.6 are green.

---

## 0. Bootstrap (completed)

- [x] Repository charter, architecture specification, low-level design and MADR records.
- [x] Operating contract (`AGENTS.md`) with the 250/200 line policy, atomic commits, lockstep SemVer, Keep a Changelog and the four-tier gate.
- [x] Contributor guide, dual licensing (Apache-2.0 OR MIT), changelog with an `[Unreleased]` section.
- [x] gaugeblock suite state and the canonical 9-document map (`.gaugeblock/docs.toml`).
- [x] Workspace manifest (`Cargo.toml`) with `[workspace.package]`, shared lints and `rust-version`, plus `aerofoil-common` as the first member so the workspace is buildable (`AF-2`).
- [x] CI workflow running Tier 2/3 on every push (`AF-3`).
- [x] Per-crate `verification_commands` registered in `.gaugeblock/config.toml` (`AF-4`).

---

## 1. Milestone 1 — Core Primitives & 978 UAT Foundation (completed)

- [x] `aerofoil-common`: `no_std` state models, units, CPR latitude/longitude decoders with the fixed 60-entry `NL` table (`SPEC.md` Invariant 9), domain telemetry models (`SPEC.md` Invariant 10), and optional `ts-rs` TypeScript export (`AF-6`, `AF-7`, `AF-8`, `AF-9`, `AF-10`, `AF-26`, `AF-27`).
- [x] `aerofoil-978`: `GF(2^8)` arithmetic and `RS(48, 34)` decoder validated against DO-282B Appendix vectors (`SPEC.md` Invariant 7) (`AF-11`, `AF-12`).
- [x] `aerofoil-978`: Downlink State Vector (SV) and Mode Status (MS) bitfield parsing (`AF-13`, `AF-14`).
- [x] Zero-allocation proof: test suite with a counting allocator asserting zero heap traffic on the decode path (`SPEC.md` Invariant 1) (`AF-15`).

**Exit criteria:** DO-282B vectors decode byte-exactly; every reject path returns a typed error; verified under `AF-5`.

---

## 2. Milestone 2 — 1090 Mode S & Error Correction (completed)

- [x] `aerofoil-1090`: CRC-24 syndrome with precomputed table and runtime-detected SIMD CLMUL/PMULL acceleration (`AF-28`, `AF-31`).
- [x] Downlink formats DF0, DF4, DF5, DF11, DF17, DF18, DF20, DF21 zero-copy bitfield parsing (`AF-29`).
- [x] Address-filtered single-bit correction against the tracker's verified address set (`AF-30`).
- [x] Criterion throughput benchmarks and zero-allocation harness on decode hot paths (`AF-32`).

**Exit criteria:** ICAO Annex 10 test vectors pass; correction never fabricates a new address; verified under `AF-16`.

---

## 3. Milestone 3 — Fusion Tracker, CLI & TUI Dashboard (completed)

- [x] `aerofoil-tracker`: 64-shard striped `parking_lot::RwLock` table keyed by `(AddressType, u32)` with monotonic field merging and TTL expiry (`SPEC.md` Invariant 10) (`AF-33`, `AF-34`).
- [x] ADS-R cross-band deduplication prioritizing direct reception (`Δt ≤ 1.0 s`, `Δd ≤ 0.001°`) (`AF-35`).
- [x] `aerofoil-cli`: Beast and AVR stream ingestion on `stdin`, JSON-lines on `stdout` (`AF-36`).
- [x] `aerofoil-tui` (`apps/tui`): Terminal UI dashboard using Ratatui with a canvas-based PPI radar display, range rings, heading vectors, interactive airspace filters, and emergency squawk alerts (`AF-37`).

**Exit criteria:** capture replays to identical JSON; zero allocations per frame on hot path; interactive TUI displays live radar without frame drop; verified under `AF-17`.

---

## 4. Milestone 4 — Networking, MCP Agent Integration & Client Ecosystem (completed)

- [x] `aerofoil-server`: Dual-source TCP Beast ingest on 30005 (1090) and 30978 (978) (`AF-38`).
- [x] `aerofoil-server`: SSE (`GET /events`) and WebSocket (`GET /ws`) egress streaming with Last-Event-ID resume and subscription filters (`AF-39`).
- [x] `aerofoil-mcp`: Stdio JSON-RPC 2.0 MCP server with tools `get_airspace_summary`, `get_track`, and `find_closest` (`AF-40`).
- [x] Wire contracts: `docs/CONTRACTS.md` single source of truth and `miter contracts --check` gate (`AF-23`).
- [x] `datasets/`: High-density public scenario captures (1090 commercial hub, mixed dual-band, edge-case bitflips) and download script (`AF-41`).
- [x] `aerofoil-replay` (`apps/replay`): Standalone multi-tier surveillance replay engine for Beast, AVR, JSONL, and raw I/Q datasets with variable pacing (`1x`, `2x`, `5x`, `10x`, `burst`, `--loop`) (`AF-42`).
- [x] `aerofoil-tui`: Dual-mode client streaming from Beast TCP sockets (default 30005/30978) or server WebSocket (`--ws`) (`AF-43`).
- [x] `sdk/`: TypeScript client SDK package (`AerofoilClient`) built with Bun, consuming `ts-rs` definitions with auto-reconnecting WebSocket/SSE streaming (`AF-44`).
- [x] `examples/web-radar/`: Single-page Bun + Vite + Leaflet web demo with dark mode, rotated aircraft markers, and telemetry table (`AF-45`).
- [x] End-to-end dataset throughput macrobenchmarks and Criterion microbenchmarks across 1090 & 978 (`AF-46`).

**Exit criteria:** `0.1.0-beta.1` release tagged with lockstep SemVer, verified multi-band ingestion, dual-mode TUI and web radar verified against recorded high-density traffic.

---

## 5. Milestone 5 — Production Web Radar, Multi-Topology Containerization & Cloud Deployment (in progress)

> **Target:** `0.1.0-beta.2` (lockstep SemVer) · **Scope:** `ADR-0013`

- [ ] Dependency modernization & Leaflet 2.0 sync: audit and upgrade all workspace Cargo crates and npm packages to latest releases; rebase `feat/leaflet-2.0` with OpenStreetMap basemap (`AF-48`).
- [ ] Kinematic trajectory simulation & real-world capture: add multi-waypoint flight loops to `dual_band_hub.beast` and live hub capture to `scripts/download-datasets.sh` (`AF-49`).
- [ ] Application promotion: migrate `examples/web-radar` to first-class workspace application `apps/web` (`@aerofoil/web-radar`) consuming `@aerofoil/sdk` (`AF-51`).
- [ ] Multi-topology API & egress integration: implement unified embedded web UI serving on `aerofoil-server` (`GET /`), alongside decoupled ingress and edge CDN topologies (`AF-52`).
- [ ] Containerization & Kubernetes orchestration: multi-stage distroless Dockerfile, Docker Compose stack, and Kubernetes deployment manifests / Helm chart (`AF-53`).
- [ ] Best-in-class Web Radar UI/UX: full interactive radar interface with altitude filtering, historical breadcrumb trails, track details drawer, and audio alert system (scoped under handoff prompt).

**Exit criteria:** `0.1.0-beta.2` tagged with lockstep SemVer; `apps/web` operating cleanly under unified Docker container and decoupled Kubernetes Ingress; dynamic multi-waypoint replay verified across TUI and browser.

---

## 6. Horizons (post-`0.1.0`)

- **H1 — Hardening:** fuzzing (`cargo-fuzz`) over every decoder entry point, property tests relating the table-driven and CLMUL CRC paths, and a published throughput regression budget.
- **H2 — Breadth:** uplink `RS(92, 72)` and FIS-B APDU disassembly, UAT uplink scheduling, multi-band time-synchronised fusion.
- **H3 — Operations:** Prometheus metrics, structured `tracing` spans per pipeline stage, packaging for Raspberry Pi and container images (Docker, K8s Akri discovery).
- **H4 — Ecosystem:** stable gRPC/protobuf surface, `no_std` embedded example on Cortex-M, and long-term wire compatibility guarantees (append-only enums, never-reused field numbers).
