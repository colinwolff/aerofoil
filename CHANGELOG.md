# Changelog

All notable changes to `aerofoil` are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

Every released version carries the same number in `[workspace.package] version` across all
crates — versions move in lockstep, never crate by crate. Entries are written for a user of the
crates, in the imperative, one line each, with the `storypole` task key in parentheses.

## [Unreleased]

### Added

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

### Fixed

- Correct the UAT uplink frame width in `docs/SPEC.md`: `RS(92, 72)` occupies 92 bytes, not 96.
- Restate Mode S error correction as single-bit only in `docs/PROJECT.md`, matching `ADR-0003` and
  Invariant 5 of `docs/SPEC.md`; the scope section still promised double-bit correction.
- Align the MCP tool name in `docs/DESIGN.md` with the specification: `get_airspace_summary`, as
  named in `docs/SPEC.md` §5 and `docs/ROADMAP.md`.

### Changed

- `ADR-0004`: single-bit correction now consults an `aerofoil_common::AddressFilter` injected by the
  caller instead of reaching up into `aerofoil-tracker`, so `aerofoil-1090` stays `no_std` and the
  crate layering has no cycle. `docs/ARCHITECTURE.md`, `docs/SPEC.md` Invariant 5 and
  `docs/decisions/README.md` follow the decision.
