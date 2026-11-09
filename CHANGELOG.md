# Changelog

All notable changes to `aerofoil` are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

Every released version carries the same number in `[workspace.package] version` across all
crates — versions move in lockstep, never crate by crate. Entries are written for a user of the
crates, in the imperative, one line each, with the `storypole` task key in parentheses.

## [Unreleased]

### Added

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

### Changed

- `ADR-0004`: single-bit correction now consults an `aerofoil_common::AddressFilter` injected by the
  caller instead of reaching up into `aerofoil-tracker`, so `aerofoil-1090` stays `no_std` and the
  crate layering has no cycle. `docs/ARCHITECTURE.md`, `docs/SPEC.md` Invariant 5 and
  `docs/decisions/README.md` follow the decision.
