# AGENTS.md — aerofoil

Operational instructions and runtime guardrails for autonomous coding agents working in this
repository. Read this before touching a file: it is the contract every change is verified against.

> **Maintainer:** Colin Wolff
> **Built with (dogfooding only):** the `gaugeblock` suite — `miter`, `storypole`, `chalkline`,
> `dado`, `batten`, `joiner`, `benchwork`, `rabbet`, `outfeed`, `sawhorse`. `aerofoil` is an
> independent project: it is not part of, owned by, governed by, or released under that suite or its
> organisation. Those tools are used here as a consumer, because they are good ones.
> **Language:** Rust, edition 2024, MSRV **1.99** (`edition`/`rust-version` pinned in
> `[workspace.package]` once the manifest lands — edition 2024's own floor is 1.85, so 1.99 is a
> deliberate choice, not the edition requirement)
> **Versioning:** Lockstep SemVer across the whole workspace; git tags `v<version>`

---

## 1. Project Mission

`aerofoil` decodes, forward-error-corrects and correlates 1090 MHz Mode S / 1090ES (DO-260B) and
978 MHz UAT (DO-282B) surveillance broadcasts. It is a Unix-philosophy suite: strict typed
primitives, zero-allocation decode hot paths, composable streams, and thin frontends (CLI, socket
daemon, gRPC, MCP). The specification of record is `docs/PROJECT.md` (product), `docs/SPEC.md`
(invariants and wire contracts), `docs/ARCHITECTURE.md` (components), `docs/DESIGN.md` (algorithms),
`docs/ROADMAP.md` (delivery order) and `docs/decisions/` (ADRs); this file only governs *how* work
is done.

## 2. Workspace Layout & Crate Boundaries

Cargo virtual workspace. Do not blur crate responsibilities:

| Crate | Path | Owns |
| :--- | :--- | :--- |
| `aerofoil-common` | `crates/common` | Aircraft state models, CPR coordinate math, units, shared decoder traits. `no_std`. |
| `aerofoil-1090` | `crates/1090` | Mode S / 1090ES demodulation, CRC-24 parity division, burst error correction, DF0..DF24 parsing. |
| `aerofoil-978` | `crates/978` | DO-282B framing, $RS(48,34)$ / $RS(92,72)$ Reed-Solomon FEC, de-interleaving, FIS-B/TIS-B payload disassembly. |
| `aerofoil-tracker` | `crates/tracker` | Sharded aircraft state table, ADS-R deduplication, track lifecycle. |
| `aerofoil-server` | `crates/server` | Streaming daemon: Beast, AVR, JSON-lines, SSE, gRPC. Transport only. |
| `aerofoil-cli` | `apps/cli` | Unix pipeline frontend (`stdin` bytes to `stdout` JSON). |
| `aerofoil-mcp` | `apps/mcp` | JSON-RPC MCP server over stdio. Tool surface only. |

Dependency edges point one way only — foundation (`common`) → domain (`1090`, `978`, `tracker`) →
integrator (`server`, `cli`, `mcp`). No lateral edges between protocol engines, and no frontend
logic leaking downward. `miter deps --path . --unused` proves declared dependencies are used.

---

## 3. Invariant Rules (DO NOT BREAK)

### 3.1 Zero Allocation on Decode Hot Paths

- Frames are fixed-size values (`[u8; 14]`, `[u8; 48]`), never `Vec<u8>`/`String`, on the parse and
  FEC path. `no_std` cores with an optional `alloc` feature.
- Decoders return typed errors (`DecodeError::ChecksumMismatch`, `DecodeError::UncorrectableRs`).
  They never panic on hostile input, never `unwrap()`/`expect()` in production code.
- Pure functions: fixed slices in, typed frame out, no hidden state, no I/O, no clock.
- Benchmarks are part of the contract. A change that regresses throughput is a bug, not a trade-off.

### 3.2 Modularity: 250-Line Ceiling, 200-Line Warning

- **Hard ceiling — 250 lines per file.** No `.rs` file may reach 250 lines, comments and inline
  tests included. At 250 the file cannot land.
- **Warning threshold — 200 lines.** A file at 200+ lines is on notice: the next change to it
  starts by splitting it into focused submodules (`mod.rs`, `types.rs`, `error.rs`, `cases.rs`),
  moving unit tests into a sibling `tests.rs`. Do not grow a file past the warning band.
- Decomposition must be behaviour-preserving: re-export historical items via `pub use` so existing
  callers compile unchanged. Zero breaking changes on decomposition.

### 3.3 Atomic, Bisectable Commits

- One logical change per commit. Never bundle a refactor with a behaviour change, never bundle two
  crates' fixes, never "while I was in here" cleanups — those go to `storypole defer` (§3.7).
- Conventional Commits v1.0.0: `<type>(<scope>): <summary>`.
  - Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `chore`, `ci`, `build`.
  - Scopes: a crate name (`common`, `1090`, `978`, `tracker`, `server`, `cli`, `mcp`), a
    documentation area (`product`, `spec`, `design`, `architecture`, `roadmap`, `decisions`,
    `readme`, `agents`, `contributing`, `changelog`), or `workspace` / `deps`. Omit the scope for a
    repo-wide change that touches no single area.
  - Footers: `Task: <KEY>` when the commit closes a backlog item, `BREAKING CHANGE:` when it breaks
    a public interface.
- Every commit must pass the Tier 2 gate (§3.6) on the crates it touches, and `git bisect` must
  never land on a non-compiling commit. A commit that needs the next commit to build is not atomic.
- Work on feature branches (`feat/<key-or-slug>`); `main` only ever receives commits that pass Tier 3.

### 3.4 Lockstep SemVer

- **Single source of truth:** `[workspace.package] version` in the root `Cargo.toml`. Every member
  inherits `version.workspace = true`; every intra-workspace pin is
  `{ path = "...", version = "<that same version>" }`. Member versions never diverge.
- **Bump policy** (pre-1.0, `0.y.z`): breaking public change → bump `y`; new backwards-compatible
  API → bump `z`; fixes and internal changes → bump `z`. After `1.0.0`, standard SemVer applies.
- A release is one commit plus one annotated tag `v<version>`: root manifest bump, refreshed
  intra-workspace pins, `CHANGELOG.md` promotion (§3.5), and `Cargo.lock` regenerate — nothing else.
- Never bump a version inside a feature commit. Never tag a commit that has not passed Tier 4.
- `outfeed plan -d . --no-llm` previews the bump computed from unreleased commits; `outfeed
  apply -d . --dry-run` shows the manifest/changelog diff before anything is written.

### 3.5 Keep a Changelog

- `CHANGELOG.md` lives at the repository root and follows [Keep a Changelog
  1.1.0](https://keepachangelog.com/en/1.1.0/).
- `## [Unreleased]` is always the first version heading. Sub-section order is fixed: `Added`,
  `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Omit empty sections.
- **The changelog entry lands in the same commit as the change.** A commit that alters observable
  behaviour without a changelog line is incomplete — this is a review-blocking defect, not a
  follow-up.
- Entries are written for a user of the crate, in the imperative, one line, with the task key in
  parentheses: `- Reject DF17 frames whose CRC-24 syndrome is non-zero before bit correction (<KEY>)`.
- Promotion at release: rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, leave a fresh empty
  `## [Unreleased]` above it, and add the comparison links at the foot of the file.
- `chalkline docs check -d .` enforces `enforce_changelog_unreleased` (declared in
  `.gaugeblock/docs.toml`), so a missing `[Unreleased]` heading is a hard failure.

### 3.6 Tiered Verification & Gate Policy

Four tiers, strictly escalating. **Do not run a higher tier to compensate for a lower one**, and do
not skip a tier because "the change is small". In sandboxes where `sccache` cannot run, prefix
commands with `RUSTC_WRAPPER=""`.

**Tier 1 — Inner loop (every edit, seconds).** Fast, targeted, proves the unit you are editing:

```bash
RUSTC_WRAPPER="" cargo check -p <crate> --all-targets
cargo nextest run -p <crate> --lib <module>     # fallback: cargo test -p <crate> <module>
miter verify --path crates/<dir>                # isolated compiler check, sliced diagnostics
miter impact <Symbol> --depth 2                 # before changing a shared/exported symbol
```

**Tier 2 — Atomic commit gate (every commit, per touched crate).** A commit that fails this is not
committed:

```bash
cargo fmt --check -p <crate>
cargo clippy -p <crate> --all-targets -- -D warnings
cargo nextest run -p <crate>                    # fallback: cargo test -p <crate>
miter audit --path . --threshold 250            # hard ceiling; non-zero exit on any file >= 250
chalkline docs check -d .                       # 9-document compliance, zero drift
```

**Tier 3 — Task completion gate (before merge to `main`, before `storypole verify`).** Whole
workspace, plus the gates that need a complete tree:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo nextest run --workspace
cargo test --doc --workspace
miter audit --path . --threshold 200            # advisory sweep of the 200-249 band
miter deps --path . --unused
storypole verify <KEY> --run                    # certifies with a VerificationReceipt
```

The 200-line sweep is **evidence, not a verdict**: `miter audit` exits non-zero for any file at or
over its threshold, so a hit at 200 means "read the table and plan the split", not "the build is
broken". The only line-count gate is the 250 ceiling in Tier 2.

**Tier 4 — Release gate (once per version bump, never per commit).** Everything above plus:

```bash
cargo build --workspace --release
cargo bench                                     # no throughput regression against the baseline
miter contracts                                 # once gRPC/JSON wire schemas exist
chalkline docs check -d .                       # re-audit after doc-touching commits (§3.5)
outfeed plan -d . --no-llm                      # preview SemVer bump + changelog
```

Never lower a threshold to make a gate pass: changing a ceiling is an ADR, not a commit tweak.

### 3.7 Zero Inline Scope Creep (`storypole defer`)

- While executing a task, an unrelated bug, edge case, missing AST pattern or refactor opportunity
  outside your immediate file scope **must not be fixed inline**.
- Record it immediately and stay on task:

```bash
storypole defer "<title>" --kind <bug|tech-debt|feature|refactor|spike> \
  --crate-name <crate> --symbols "<crate::path::symbol>" --files "<path>"
```

- The title is positional, `--symbols` is plural, and the kind must be one of the task kinds above.
  A misspelled kind fails the command; it is not corrected for you.

---

## 4. Dogfooding the `gaugeblock` Suite

We dogfood the `gaugeblock` suite: these tools are used here as a consumer, on a project that is
not part of that suite. Every tool below is a real gate or a real context-slicer for this
repository — if a tool is not useful here, that is a suite bug worth filing upstream.

**Ownership metadata is a fact about this project, never inherited from tooling.** The
`repository`/`homepage` fields in `Cargo.toml`, the clone URL in `CONTRIBUTING.md` and any constant
in `scripts/` name *this* project's home. They were once copied from the suite's own manifests and
named the wrong owner; a template is a source of conventions, not of identity.

State lives under `.gaugeblock/` and is split by ownership:

- **Tracked (shared, reproducible):** `.gaugeblock/config.toml`, `.gaugeblock/docs.toml`,
  `.gaugeblock/miter/*.toml` allowlists, `.gaugeblock/storypole/ledger.jsonl`,
  `.gaugeblock/storypole/plans/<KEY>.md`.
- **Ignored (per-machine):** `storypole/index.sqlite*`, `miter/*.redb`, `spool/`, `worktrees/`,
  `datasets/`, `.env`. Rebuilt on demand; never committed.

| Tool | What it is for here |
| :--- | :--- |
| `storypole` | Backlog of record. `list` / `next` / `claim` / `heartbeat` / `handoff` / `verify`, plus `defer` for out-of-scope finds. Tasks are the unit of atomic work; the ledger is append-only and is reconciled (`ledger-verify`, `ledger-reconcile`) rather than edited. |
| `miter` | AST index. Use `lookup`, `skeleton`, `references`, `impact` to slice context instead of dumping files into a prompt; `audit` for the 250/200 line gates; `deps` for crate topology; `verify` for isolated compiler checks with sliced diagnostics. Index with `miter index .` when the DB is stale. |
| `chalkline` | `recon` to detect conventions before writing code, `grill` to resolve ambiguity into decisions, `docs check` for documentation fidelity and AST drift. |
| `outfeed` | Release mechanics: `status`, `plan`, `apply`, `lockfiles`, `clean`/`prune`. Owns the SemVer bump and changelog promotion described in §3.4–3.5. |
| `benchwork` | `snapshot -r .` for a full workspace state capture, `capabilities` to see which suite tools this tree actually satisfies. |
| `dado` + `batten` | Deterministic boilerplate: `dado render` / `dado contract` for repetitive wire types (DF parsers, error enums), then `batten validate` on the fill before it is committed. A fill the grammar rejects is a failed synthesis, not a code-review comment. |
| `joiner` | Opt-in synthesis (`joiner fill`, `joiner synthesize`). Spends inference tokens, so it never sits on the critical path of a hand-written change. |
| `rabbet` | Telemetry roll-up from `.gaugeblock/spool/outbox.jsonl` into training corpora. Downstream of the work; never a gate. |
| `sawhorse` | Provider runtime for the synthesis tools. Not invoked directly by hand-written changes. |

**Backlog state:** the first wave is open — `AF-1`…`AF-18` cover M0 close-out and M1, and
`storypole next` returns one actionable leaf (start with `AF-2`, the workspace manifest). M2–M4 exist
as epics whose children are added when the preceding milestone verifies, so no leaf is written a
milestone ahead of the constraints that decide it.

## 5. Agent Execution Loop

For every unit of work:

1. **Brief & lease:** `storypole list`, then `storypole claim <KEY> <AGENT_ID> --branch feat/<slug>`.
   Read the briefing with `storypole show <KEY>`; renew with `heartbeat`, release with `handoff`.
2. **Slice context:** `miter skeleton` / `miter lookup --context` / `miter impact <Symbol>` before
   reading whole files. Never open a file you only need a signature from.
3. **Decide:** if a choice is architectural (protocol interpretation, data structure, wire format,
   crate boundary), record it as an ADR under `docs/decisions/` using the existing MADR template
   (`ADR-NNNN.md`, Status/Context/Options/Outcome/Consequences).
4. **Implement in Tier 1:** one small file at a time, doc comments on every public item, tests
   beside the code that they prove.
5. **Defer the rest:** anything out of scope goes to `storypole defer` (§3.7), never into the diff.
6. **Commit in Tier 2:** per-crate formatting, clippy, tests, and the 250-line audit; conventional
   message; changelog line in the same commit (§3.5).
7. **Close in Tier 3:** whole-workspace gate, then `storypole verify <KEY> --run` (or `handoff`
   when the task is not finished).

## 6. Common Commands

```bash
# Build & test
cargo build --workspace
RUSTFLAGS="-C target-cpu=native" cargo build --release
cargo nextest run --workspace                    # fallback: cargo test --workspace
cargo test --doc --workspace

# Gates
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
miter audit --path . --threshold 250
miter audit --path . --threshold 200
miter deps --path . --unused

# Suite
miter index .
miter lookup <Symbol> --context
miter impact <Symbol> --depth 2
miter verify --path crates/<dir>
chalkline recon -d .
storypole next
storypole show <KEY>
outfeed status -d .
outfeed plan -d . --no-llm
benchwork snapshot -r .
```

## 7. Repository State & Remaining Gaps

**In place from bootstrap:** the nine canonical documents (mapped in `.gaugeblock/docs.toml`), dual
licensing (`LICENSE-APACHE`, `LICENSE-MIT`, `NOTICE`), `CONTRIBUTING.md`, a live `CHANGELOG.md`
`[Unreleased]` section, the operating contract in this file, gaugeblock suite state with
`ticket_prefix = "AF"` in both the unified and legacy storypole config, and a buildable Cargo
workspace — edition 2024, MSRV 1.99, lockstep `version`, inherited lints, with `aerofoil-common` as
its first member. `chalkline docs check` now runs and reports 9 present, 0 missing, 0 drifted.

**Still open.** Close these; never paper over one by weakening a gate in §3.6:

1. **CI runs the cargo gates only.** `.github/workflows/ci.yml` enforces format, clippy, nextest,
   doc tests, a release build, the MSRV build and the `no_std` target. `miter audit`,
   `miter deps` and `chalkline docs check` are present as a deliberately disabled job, because the
   suite tools are built from local checkouts and are not installable from a registry; the gap is
   tracked as `AF-19`. Do not delete the disabled job to make the pipeline look complete.
2. **`no_std` is proven in CI, not locally.** `aerofoil-common` is `#![no_std]` and keeps the
   attribute unconditional by putting its tests in `tests/`; the `no_std` CI job compiles it for
   `thumbv7em-none-eabi`. No such target is installed on the development machine, so a local
   `cargo check` proves nothing about it — trust the CI job, or `rustup target add` first.
3. **`verification_commands` covers one crate.** `.gaugeblock/config.toml` maps
   `aerofoil-common` to `cargo nextest run -p aerofoil-common` and falls back to
   `cargo nextest run --workspace` for the repository, so `storypole verify --run` now executes a
   command and records its exit code. Add an entry per crate as it lands, before treating that
   crate's receipts as evidence.
4. **`enforce_readme_cli_flags` is off** in `.gaugeblock/docs.toml` because no CLI crate exists.
   Flip it to `true` when `aerofoil-cli` lands, so every subcommand and long flag is documented.
5. **No crates published.** Nothing has been tagged; the first release tag (`v0.1.0`) is Milestone 4.
6. **The backlog holds the M0 and M1 wave only.** `AF-1`–`AF-18` are open; M2–M4 are epics awaiting
   children on milestone entry. Nothing is created to fill a gap, and no leaf is invented for a
   milestone whose constraints are still unknown.
7. **One member crate exists.** `aerofoil-1090`, `aerofoil-978`, `aerofoil-tracker`, `aerofoil-server`
   and the two apps join the workspace as their milestones land; until then `cargo check --workspace`
   proves only what is present.

## 8. Definition of Done for Any Task

1. `cargo check --workspace --all-targets` is clean, zero warnings.
2. Tier 2 passed for every touched crate; Tier 3 passed for the workspace.
3. `miter audit --path . --threshold 250` reports nothing, and no touched file is left in the
   200–249 warning band without a decomposition plan.
4. Every invariant in §3 holds — allocation, panic-freedom, crate layering, file length.
5. User-visible changes carry a `CHANGELOG.md` entry committed with them.
6. Public interface changes bump the single workspace version in the release commit (§3.4); feature
   commits never bump it.
7. Commits are atomic, conventional and bisectable; out-of-scope findings live in `storypole`.
8. `storypole verify <KEY> --run` (or `handoff` with a structured packet) closes the task.

