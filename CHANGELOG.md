# Changelog

All notable changes to `aerofoil` are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

Every released version carries the same number in `[workspace.package] version` across all
crates — versions move in lockstep, never crate by crate. Entries are written for a user of the
crates, in the imperative, one line each, with the `storypole` task key in parentheses.

## [Unreleased]

### Added

- Add MADR 0014 establishing pluggable `AirspaceMapEngine`, 12-class SVG icon matrix, and map overlay architecture (`AF-54`).

### Changed

- Align architectural decision records with chalkline MADR schema and monotonic date ordering (`AF-47`).

## [0.1.0-beta.1] - 2026-11-10

### Added

- Add `CprResolver` to `aerofoil-server` and `aerofoil-tui` to resolve 1090ES CPR airborne positions into geographic coordinates.
- Add multi-aircraft scenario fixture with 7 Mode S targets and UAT downlink to `datasets/fixtures/dual_band_hub.beast`.
- Add `examples/web-radar/README.md` documenting startup, telemetry streaming, and tile configuration.
- Add end-to-end dataset throughput macrobenchmarks and Criterion microbenchmarks across 1090 and 978 (`AF-46`).
- Implement single-page web radar demo in `examples/web-radar` using Bun, Vite, and Leaflet (`AF-45`).
- Implement TypeScript SDK in `sdk/` using Bun and `ts-rs` type definitions (`AF-44`).
- Implement dual-mode Beast TCP and WebSocket streaming in `aerofoil-tui` (`AF-43`).
- Scaffold and implement standalone `aerofoil-replay` application in `apps/replay` (`AF-42`).
- Add high-density 1090, dual-band hub, and edge-case surveillance fixtures with download script (`AF-41`).
- Add `docs/CONTRACTS.md` and wire-contract verification gate for egress surfaces (`AF-23`).
- Implement `aerofoil-mcp` Model Context Protocol server over stdio (`AF-40`).
- Implement SSE and WebSocket egress streaming in `aerofoil-server` (`AF-39`).
- Scaffold `aerofoil-server` with dual-source TCP Beast ingest on 30005 and 30978 (`AF-38`).
- Add `aerofoil-sdr` with integer magnitude calculation, 1090 MHz PPM correlation, and 978 MHz FSK discrimination (`AF-25`).
- Add `aerofoil-persistence` with bounded drop-oldest `RecordSink` and self-describing JSONL replay format (`AF-24`).
- Implement `aerofoil-tui` Terminal UI dashboard with Ratatui PPI radar and telemetry tables (`AF-37`).
- Implement `aerofoil-cli` with Beast and AVR stream parsing on stdin and JSON-lines on stdout (`AF-36`).
- Implement dual-band ADS-R cross-band deduplication in `aerofoil-tracker` (`AF-35`).
- Implement monotonic per-field target merging and TTL expiry lifecycle in `aerofoil-tracker` (`AF-34`).
- Scaffold `aerofoil-tracker` with 64-shard striped `parking_lot::RwLock` table and `AddressFilter` (`AF-33`).
- Add Criterion throughput benchmarks and counting allocator zero-allocation test harness in `aerofoil-1090` (`AF-32`).
- Implement runtime-detected SIMD CLMUL/PMULL CRC-24 acceleration in `aerofoil-1090` (`AF-31`).
- Implement address-filtered single-bit error correction for Mode S DF11/DF17/DF18 frames in `aerofoil-1090` (`AF-30`).
- Implement zero-copy Mode S Downlink Format bitfield parsers for DF0, DF4, DF5, DF11, DF17, DF18, DF20, and DF21 in `aerofoil-1090` (`AF-29`).
- Scaffold `aerofoil-1090` with Mode S CRC-24 polynomial division and precomputed lookup table (`AF-28`).
- Add Terminal UI dashboard (`aerofoil-tui`), TypeScript SDK (`sdk/`), and web radar demo (`examples/web-radar`) to architecture specifications and delivery roadmap.
- Add optional `export-ts` feature to `aerofoil-common` using `ts-rs` for TypeScript definitions (`AF-27`).
- Implement domain telemetry and aircraft target models in `aerofoil-common` (`AF-26`).
- Add the zero-allocation proof harness asserting zero heap traffic on decode paths (`AF-15`).
- Implement local CPR airborne decoding from a reference position in `aerofoil-common` (`AF-10`).
- Implement UAT downlink State Vector and Mode Status bitfield parsing in `aerofoil-978` (`AF-14`).
- Implement UAT framing, de-interleaving and Reed-Solomon geometry validation in `aerofoil-978` (`AF-13`).
- Implement the DO-282B $RS(48,34)$ Reed-Solomon decoder in `aerofoil-978` (`AF-12`).
- Scaffold `aerofoil-978` with $GF(2^8)$ arithmetic over primitive polynomial `0x11D` (`AF-11`).
- Implement global CPR decoding with a 10-second pair window and zone-anomaly rejection in `aerofoil-common` (`AF-9`).
- Add the CPR `NL` transition table and even/odd zone math to `aerofoil-common` (`AF-8`).
- Add fixed-point micro-degree `Latitude`, `Longitude` and `Position` primitives to `aerofoil-common` (`AF-7`).
- Repository bootstrap: product definition, architecture specification, low-level design notes and
  MADR decision records under `docs/`.
- `AGENTS.md` operating contract: 250-line file ceiling with a 200-line warning band, atomic
  bisectable commits, lockstep SemVer, Keep a Changelog discipline and the four-tier verification
  gate.
- `CONTRIBUTING.md` contributor guide covering the Rust 1.99 / edition 2024 toolchain and the gate
  commands.
- Dual licensing under Apache-2.0 OR MIT (`LICENSE-APACHE`, `LICENSE-MIT`, `NOTICE`).
- gaugeblock suite state under `.gaugeblock/`, including the canonical document map in
  `.gaugeblock/docs.toml`.
- `docs/SPEC.md` (behavioural invariants and wire contracts) and `docs/ROADMAP.md` (milestones and
  horizons) as the single source of truth for the delivery plan.
- `docs/decisions/README.md`: MADR index, status vocabulary (including `Proposed`) and the record
  template, with the `storypole ask-decision` / `decide` handshake documented.
- `ADR-0005` (proposed): the tracker concurrency model is recorded as an open question with four
  options, instead of `ARCHITECTURE.md` hedging between two designs.
- `ADR-0006` (proposed): the server egress transport is recorded as an open question. SSE had been
  asserted in four documents without ever being decided, and the charter's WebSocket mention vanished
  in the rewrite.
- Cargo workspace manifest: edition 2024, MSRV 1.99, lockstep `version`, dual license, and
  workspace-wide lints denying `unwrap_used`, `expect_used` and `unsafe_code`. The first member,
  `aerofoil-common`, is a `#![no_std]` skeleton that the M1 tickets fill in; `Cargo.lock` is tracked.
- `aerofoil-common` gains its first API: `DecodeError`, the rejection model of `docs/SPEC.md`
  Invariant 3 (`Display` without allocation, `core::error::Error`, `Copy`), and the fixed-point unit
  types `Altitude`/`AltitudeKind`, `Squawk` and `Heading`, covered by 18 tests. Tests live in
  `tests/` so the crate keeps an unconditional `#![no_std]`.
- CI (`.github/workflows/ci.yml`): format, clippy, nextest, doc tests, release build, an MSRV 1.99
  build and a `thumbv7em-none-eabi` build that proves the `no_std` guarantee. The suite gates
  (`miter`, `chalkline`) are a visibly disabled job because those tools are not yet installable
  from a registry (`AF-19`).
- `.gaugeblock/config.toml` registers the verification command per crate, so `storypole verify --run`
  executes `cargo nextest run` and records its exit code instead of certifying what an agent claims
  to have run.
- `ADR-0007` (accepted): the namespace-reservation decision — eight free crate names, `aerofoil`
  unavailable as a GitHub organisation (held by a user account since 2023), the `0.1.0-alpha.1`
  reservation / `0.1.0-beta.1` dogfood ladder, and the placeholder mechanics. Names are held from
  the maintainer account; the long-term owner is added later.
- `ADR-0008` (proposed): the long-term organisation handle, with `aerofoil-labs`, `aerofoil-rs` and
  `aerofoil-hq` verified free, the confusion and trademark factors recorded, and the trigger for
  deciding (first satellite repository or second maintainer).
- `ADR-0009` (accepted): persistence gets a seam now (`aerofoil-persistence` with a `RecordSink`
  trait and a dependency-free JSONL implementation recording band-tagged frames) and an engine later,
  chosen on evidence — a benchmark spike on Pi-class hardware plus a real query requirement. Live
  track state is explicitly never persisted across restarts.
- `ADR-0010` (accepted): ingest is frames in, one fusion process over N band-tagged sources.
  Demodulation lives in a feature-gated `aerofoil-sdr` crate that emits Beast and depends on nothing
  in this workspace, so it doubles as a dump1090 replacement; correction stays in `aerofoil-1090`
  because it needs the address filter, and UAT uplink demodulation is deferred.

### Changed

- Support `--sink` as alias for `--tcp`, and `--file` as alias for `--input` in `aerofoil-replay`.
- Switch web radar default basemap from CartoDB to OpenStreetMap with CSS dark filter for zero-API-key operation.
- Ignore `node_modules/` and `dist/` across frontend directories in `.gitignore`.
- Accept ADR-0006 choosing SSE plus WebSocket for server egress transport (`AF-18`).
- Accept ADR-0005 choosing striped parking_lot::RwLock shards for aerofoil-tracker (`AF-17`).
- `ADR-0004`: single-bit correction now consults an `aerofoil_common::AddressFilter` injected by the
  caller instead of reaching up into `aerofoil-tracker`, so `aerofoil-1090` stays `no_std` and the
  crate layering has no cycle. `docs/ARCHITECTURE.md`, `docs/SPEC.md` Invariant 5 and
  `docs/decisions/README.md` follow the decision.

### Fixed

- Correct the UAT uplink frame width in `docs/SPEC.md`: `RS(92, 72)` occupies 92 bytes, not 96.
- Restate Mode S error correction as single-bit only in `docs/PROJECT.md`, matching `ADR-0003` and
  Invariant 5 of `docs/SPEC.md`; the scope section still promised double-bit correction.
- Align the MCP tool name in `docs/DESIGN.md` with the specification: `get_airspace_summary`, as
  named in `docs/SPEC.md` §5 and `docs/ROADMAP.md`.
- Remove the false ownership attribution: `Cargo.toml`, `CONTRIBUTING.md`, `scripts/` and the
  `AGENTS.md`/`docs/PROJECT.md` headers named a `gaugeblock` organisation or URL. `aerofoil` is an
  independent project that *dogfoods* that suite; it is not part of it. The metadata now points at
  the maintainer account, and both headers say plainly that the relationship is tooling only.
- Stop claiming the decoders demodulate. `README.md` described `aerofoil-1090` as a demodulator and
  `docs/PROJECT.md` implied samples entered a demodulator/framer here, while no milestone scheduled
  one; `docs/ARCHITECTURE.md` now states that sources hand the pipeline framed bytes, and the ingest
  stage states the band-tag and multi-source model.

[Unreleased]: https://github.com/colinwolff/aerofoil/compare/v0.1.0-beta.1...HEAD
[0.1.0-beta.1]: https://github.com/colinwolff/aerofoil/releases/tag/v0.1.0-beta.1
