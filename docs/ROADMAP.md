# Roadmap & Delivery Horizons: `aerofoil`

> **Status:** pre-release (`0.1.0-beta.1` released, Milestones 0–6 completed, lockstep SemVer)
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

## 5. Milestone 5 — Production Web Radar, Multi-Topology Containerization & Cloud Deployment (completed)

> **Target:** `0.1.0-beta.2` (lockstep SemVer) · **Scope:** `ADR-0013`, `ADR-0014`, `ADR-0015`, `ADR-0016`, `ADR-0017`, `ADR-0018`

- [x] Dependency modernization & Leaflet 2.0 sync: audit and upgrade all workspace Cargo crates and npm packages to latest releases; rebase `feat/leaflet-2.0` with OpenStreetMap basemap (`AF-48`).
- [x] Kinematic trajectory simulation & real-world capture: add multi-waypoint flight loops to `dual_band_hub.beast` and live hub capture to `scripts/download-datasets.sh` (`AF-49`).
- [x] Application promotion: migrate `examples/web-radar` to first-class workspace application `apps/web` (`@aerofoil-rs/web-radar`) consuming `@aerofoil-rs/sdk` (`AF-51`).
- [x] Multi-topology API & egress integration: implement unified embedded web UI serving on `aerofoil-server` (`GET /`), alongside decoupled ingress and edge CDN topologies (`AF-52`).
- [x] Containerization & Kubernetes orchestration: multi-stage distroless Dockerfile, Docker Compose stack, and Kubernetes deployment manifests / Helm chart (`AF-53`).
- [x] Best-in-class Web Radar UI/UX & Legal Governance: 12-class SVG aircraft icon matrix, pluggable `AirspaceMapEngine` (Leaflet 2.0 / MapLibre GL), TopoJSON FAA airspace boundaries, FAA VFR/IFR chart tiles with fallback, dynamic range rings and azimuths, RainViewer NEXRAD weather radar with scrubber dock, dynamic attribution control, and legal compliance modal (`AF-54`).
- [x] Multi-tier configuration architecture & avionics glass-cockpit redesign: 3-tier config hierarchy (ENV -> server `GET /api/config` -> UI `localStorage`), collapsible/resizable sidebar, restored glassmorphic modals, and competitive parity matrix in `docs/COMPARISON.md` and `apps/web/DESIGN.md` (`AF-55`).
- [x] Multilateration core solver & clock synchronization: scaffold `aerofoil-mlat` crate with geodetic receiver registry, clock drift synchronization, and closed-form Bancroft / Levenberg-Marquardt TDOA hyperboloid solver (`AF-56`).
- [x] Outbound MLAT feeder & client transport: implement streaming feeder client protocol compatible with community `mlat-server` instances (`AF-57`).
- [x] Multi-source MLAT track fusion & UI badges: integrate `ReceptionSource::Mlat` into `aerofoil-tracker` and render distinct MLAT badges in web radar and TUI (`AF-58`).
- [x] Custom Leaflet map panes & chart stacking: implement explicit z-index panes (basemap 200, charts 250, weather 300, airspace 350, antenna 400, markers 600), maxNativeZoom upscaling, and OpenAIP TMS overlay support (`AF-59`).
- [x] MapLibre GL 3D globe & altitude flight profiles: hardware-accelerated WebGL 3D mode with camera pitch to 85°, multi-tier DEM terrain elevation, and vertical rate climb-colored 3D trajectory ribbons (`AF-60`).
- [x] Configurable polar distance rings & radial azimuths: presets, custom comma-separated radii, and dynamic azimuth intervals in Web Radar (`AF-61`).
- [x] Antenna reception range & signal strength heatmap overlay: empirical polar maximum range contour, RSSI signal strength gradient, and line-of-sight elevation mask (`AF-62`).
- [x] MapLibre 3D terrain overlay draping & synchronized layer controls: drape NEXRAD weather radar with dynamic opacity, FAA VFR/IFR charts, range rings, and antenna coverage contours across 3D DEM terrain (`AF-63`).
- [x] 3D aircraft altitude drop-lines and ground shadow projections: render vertical drop-stems from target 3D altitudes down to terrain surface with soft circular ground shadows (`AF-64`).
- [x] 3D DEM terrain relief bugfixes: CORS-enabled Mapterhorn Terrarium tiles, resilient fallback, and WebGL layer z-ordering (`AF-65`).
- [x] MapLibre GL v6 WebWorker URL resolution for Vite and deterministic whenReady queue mounting (`AF-66`).
- [x] CARTO_API_KEY .env loading with ?key= authentication, CARTO Voyager basemap, and 3D mountain jump presets (`AF-67`).
- [x] Epic: Comprehensive End-to-End Test Suite, Kinematic Airspace Simulation & Live Capture Pipeline (`AF-78`).
- [x] High-fidelity kinematic airspace trajectory synthesizer and realistic terminal hub fixture: model 50+ aircraft across realistic STAR/SID/holding procedures into loopable Beast fixture (`AF-79`).
- [x] Long-run flight kinematic trajectory and continuous tracking regression test suite: multi-minute track continuity tests without heading or CPR discontinuities (`AF-80`).
- [x] Live Beast network feed capture and public dataset downloader script: record live Beast/AVR streams and fetch public traces (`AF-81`).
- [x] Full-pipeline server SSE and WebSocket streaming integration tests: end-to-end ingestion from Beast inputs through tracker to live web clients (`AF-82`).
- [x] Headless browser end-to-end automation test suite with Playwright: automated browser testing of Leaflet 2.0 and MapLibre GL 3D canvases (`AF-83`).
- [x] RTL-SDR DSP demodulation pipeline and direct hardware receiver interface: direct USB/rtl_tcp streaming into PPM/FSK demodulators (`AF-84`).
- [x] Raw IQ modulated sample capture and RF replay engine: capture .cu8/.cf32 raw samples and replay into DSP demodulator (`AF-85`).

**Exit criteria:** `0.1.0-beta.2` tagged with lockstep SemVer; `apps/web` operating cleanly under unified Docker container and decoupled Kubernetes Ingress; dynamic multi-waypoint replay verified across TUI, 2D Leaflet, and 3D MapLibre viewports; MLAT TDOA solver verified against multi-receiver synthetic vectors; comprehensive E2E test suites passing.

---

## 6. Milestone 6 — Advanced Surveillance Avionics, Clean-Room Parity & 3D Spatial Airspace (in progress)

> **Target:** `0.1.0-beta.3` (lockstep SemVer) · **Scope:** `ADR-0019`
> **Specification of reference:** Clean-room functional parity with `tar1090` (17 U.S.C. § 102(b), zero GPL contamination) translated into native spatial 3D.

- [x] Epic: Milestone 6 — Advanced Surveillance Avionics, Clean-Room Parity & 3D Spatial Airspace (`AF-68`).
- [x] Glassmorphic Aircraft Inspector Pane: floating avionics card displaying registration, airframe type, operator, squawk, TAS/IAS, Mach, roll angle, selected MCP altitude, RSSI, message rate, and dynamic 3D altitude profile sparkline (`AF-69`).
- [x] LOD-aware aircraft callsign and altitude flight level map labels: collision-tested callsign/FL/speed text badges beside aircraft markers with zoom-level density decluttering in 2D and 3D (`AF-70`).
- [x] Persistent multi-aircraft track trails and global track toggle hotkey (`T`): keyboard shortcut `T` to toggle all flight trails, individual selection persistence, and multiselect inspection mode (`AF-71`).
- [x] Dynamic regex callsign search and spatial altitude/speed/provenance filtering: interactive search bar supporting callsign regex (`^UAL|DAL`), altitude bounds slider ($FL_{min} \dots FL_{max}$), speed boundaries, and data source toggle (`adsb`, `uat`, `mlat`) (`AF-72`).
- [x] Bidirectional URL search/hash state persistence: deep-linking query parameters for map center, zoom, pitch, bearing, viewport mode, isolated ICAO hexes (`?icao=...`), and active filter criteria (`AF-73`).
- [x] 3D extruded polygonal airspace volumes: render FAA Class B/C/D and Special Use Airspace (SUA) as semi-transparent 3D polygonal columns extruded from aeronautical floor to ceiling MSL (`AF-74`).
- [x] Smooth 3D chase camera tracking and follow mode: camera locks behind selected aircraft along its kinematic velocity vector with interpolated pitch/heading tracking (`AF-75`).
- [x] Instanced 3D aircraft models with true pitch, roll, and heading orientation in MapLibre GL: replace flat 2D icons in 3D mode with low-poly 3D models (Jet, Heavy, Turboprop, Heli, Light GA) oriented dynamically in WebGL (`AF-76`).
- [x] Elevated 3D range rings and volumetric surveillance dome: render elevated concentric 3D range rings and dome tiers (e.g., FL100, FL200, FL300) with elevated distance and altitude labels using MapLibre 3D symbol elevation (`AF-77`).
- [x] 3D mode performance & WebGL pipeline optimization: throttle telemetry table DOM updates, eliminate view-change feedback loops, cache marker HTML, and convert 3D dome disks into hollow rings (`AF-86`).
- [x] Toggleable aircraft map labels & single-aircraft telemetry list highlighting: add toolbar toggle and hotkey (`K`) for callsign/FL labels, stabilize table row click selection during live streaming, and highlight selected targets in 2D and 3D (`AF-87`).
- [x] Interactive airspace section selection & popup labels in 2D and 3D: restore 2D airspace polygon click popups and add interactive 3D airspace volume click popups in MapLibre GL (`AF-88`).
- [x] Fix MapLibre GL v6 `CustomLayerInterface.render` matrix input, WebGL2 VAO state, and layer z-order for 3D aircraft models (`AF-89`).
- [x] Eliminate 3D terrain drape tile invalidation (`4 FPS` to `60 FPS`) and throttle 3D DOM marker updates (`AF-90`).
- [x] Fix tile caching, duplicate DEM sources, source cache eviction on mode/theme toggle, and tile request storms (`AF-91`).
- [x] Fix `aerofoil-server` TCP ingest `O_NONBLOCK` busy-spin loop, WebSocket broadcast flood, and missing CORS/`Cache-Control` headers (`AF-92`).
- [x] Zero-DOM 3D/2D target rendering, precompiled filter regex, and CSS label LOD toggle (`AF-93`).
- [x] WebGL2 instanced 3D aircraft rendering, terrain elevation cache, and dirty-flagged line VBOs (`AF-94`).
- [x] 60 FPS client-side kinematic dead-reckoning and frame-synced Chase Camera (`AF-95`).
- [x] Coalesced batch WebSocket frames, keyed TelemetryTableRenderer DOM updates, and throttled AircraftInspector (`AF-96`).
- [x] Hide redundant 2D draped vector lines in 3D, optimize AntennaCoverageLayer, and gzip HTTP static assets (`AF-97`).

**Exit criteria:** Complete clean-room feature parity with `tar1090` without GPL code contamination; full 3D spatial airspace extrusion, instanced 3D aircraft models, elevated 3D surveillance dome rings, and chase camera verified in MapLibre GL; deep linking and regex filtering verified in test suites.

---

## 7. Horizons (post-`0.1.0`)

- **H1 — Hardening:** fuzzing (`cargo-fuzz`) over every decoder entry point, property tests relating the table-driven and CLMUL CRC paths, and a published throughput regression budget.
- **H2 — Breadth:** uplink `RS(92, 72)` and FIS-B APDU disassembly, UAT uplink scheduling, multi-band time-synchronised fusion.
- **H3 — Operations:** Prometheus metrics, structured `tracing` spans per pipeline stage, packaging for Raspberry Pi and container images (Docker, K8s Akri discovery).
- **H4 — Ecosystem:** stable gRPC/protobuf surface, `no_std` embedded example on Cortex-M, and long-term wire compatibility guarantees (append-only enums, never-reused field numbers).
