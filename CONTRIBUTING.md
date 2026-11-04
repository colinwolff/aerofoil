# Contributor Guide — `aerofoil`

> Guidelines for engineering, testing and contributing to the `aerofoil` workspace.
> `AGENTS.md` is the operational contract (and the source of truth for the verification gates);
> this document is the human-facing on-ramp to the same rules.

---

## 1. Toolchain & Environment

`aerofoil` targets the **Rust 2024 edition** on **Rust 1.99** (`rust-version = "1.99"` once the
workspace manifest lands; edition 2024 itself needs 1.85, so 1.99 is a deliberate choice, not the
edition floor).

```bash
rustc --version                        # 1.99.x, edition 2024
cargo install cargo-nextest --locked   # preferred test runner
cargo fmt --version && cargo clippy --version
clang --version                        # LLVM, for benchmarking the SIMD CRC paths
```

```bash
git clone https://github.com/colinwolff/aerofoil.git
cd aerofoil
cargo check --workspace --all-targets
```

No crate has been published yet. The workspace manifest exists with `aerofoil-common` as its first
member; the remaining crates join as their milestones land (`docs/ROADMAP.md`).

---

## 2. Workspace Organization

```text
aerofoil/
├── crates/
│   ├── common/      # aerofoil-common: state models, CPR math, units, decoder traits (no_std)
│   ├── 1090/        # aerofoil-1090:  Mode S / 1090ES demodulation, CRC-24, DF0..DF24
│   ├── 978/         # aerofoil-978:   DO-282B framing, RS(48,34) / RS(92,72) FEC
│   ├── tracker/     # aerofoil-tracker: sharded track table, ADS-R deduplication
│   └── server/      # aerofoil-server: Beast, AVR, JSON-lines, SSE, gRPC
├── apps/
│   ├── cli/         # aerofoil-cli: Unix pipeline frontend
│   └── mcp/         # aerofoil-mcp: JSON-RPC MCP server
└── docs/            # specification of record + ADRs
```

Dependency edges point one way only: `common` → `1090` / `978` / `tracker` → `server` / `cli` /
`mcp`. No lateral edges between the protocol engines.

---

## 3. Verification Gates

Tiers escalate; each one is a superset of the work before it. `AGENTS.md` §3.6 defines them; the
commands below are what you type. In a sandbox where `sccache` cannot run, prefix with
`RUSTC_WRAPPER=""`.

```bash
# Tier 1 — inner loop, while editing
cargo check -p <crate> --all-targets
cargo nextest run -p <crate> --lib <module>
miter verify --path crates/<dir>

# Tier 2 — before every commit (affected crates only)
cargo fmt --check -p <crate>
cargo clippy -p <crate> --all-targets -- -D warnings
cargo nextest run -p <crate>
miter audit --path . --threshold 250

# Tier 3 — before merging to main
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo nextest run --workspace
cargo test --doc --workspace
miter audit --path . --threshold 200      # advisory: lists the 200-249 line band
miter deps --path . --unused

# Tier 4 — once per version bump, never per commit
cargo build --workspace --release
cargo bench
chalkline docs check -d .
outfeed plan -d . --no-llm
```

---

## 4. Commit & Code Etiquette

- **Atomic commits only.** One logical change per commit, Conventional Commits
  (`<type>(<scope>): <summary>`), scopes drawn from the crate names. `git bisect` must never land on
  a commit that does not build.
- **No `unwrap()` / `expect()` in production code.** Library errors are `thiserror` enums; binaries
  report through `anyhow` at the edge. Workspace lints are `unwrap_used = "deny"`,
  `expect_used = "deny"`, `unsafe_code = "deny"`.
- **No allocation on decode hot paths.** Fixed-size frames (`[u8; 14]`, `[u8; 48]`), pure functions,
  typed errors. A throughput regression is a bug, not a trade-off.
- **250-line file ceiling, 200-line warning.** Split into focused submodules and move tests to a
  sibling `tests.rs`; re-export through `pub use` so callers do not break.
- **Out-of-scope findings are deferred, not fixed.** `storypole defer "<title>" --kind <kind>
  --crate-name <crate> --symbols "<path>"` keeps the diff honest and the finding traceable.

---

## 5. Documentation Policy

Nine canonical documents are declared in `.gaugeblock/docs.toml` and audited by
`chalkline docs check -d .`:

| Document | Lives at | Answers |
| :--- | :--- | :--- |
| `README.md` | root | What is it, and how do I run it? |
| `CONTRIBUTING.md` | root | How do I work in this repository? |
| Product | `docs/PROJECT.md` | Who is it for, what is in scope? |
| Architecture | `docs/ARCHITECTURE.md` | Which components exist; how do data and threads flow? |
| Spec | `docs/SPEC.md` | Which invariants and wire contracts must hold? |
| Design | `docs/DESIGN.md` | Which algorithms implement the spec? |
| Roadmap | `docs/ROADMAP.md` | What is next, in which order? |
| `CHANGELOG.md` | root | What changed, per version? |
| `AGENTS.md` | root | How must an autonomous agent behave here? |

- Behaviour changes land with their `CHANGELOG.md` entry in the same commit.
- Architectural choices get an ADR in `docs/decisions/` (`ADR-NNNN.md`: Status, Context, Options,
  Outcome, Consequences) before the code lands, not after.
- A document is edited in the same change that invalidates it. Stale documentation is a defect.

---

## 6. Licensing & Provenance

`aerofoil` is dual-licensed under **Apache-2.0 OR MIT** (`LICENSE-APACHE`, `LICENSE-MIT`, `NOTICE`).
By submitting a contribution you agree to license it under those terms, with no additional
conditions.

- Do not paste code from GPL, LGPL or unlicensed sources. RTCA DO-260B / DO-282B material is
  normative *specification*, not redistributable source: implement from the specification and cite
  the clause (`// DO-282B §2.2.3.2.5`).
- Reference implementations (dump1090, dump978, readsb) inform behaviour but are not copied. Any
  derived algorithm is re-expressed and independently verified against test vectors.
- Recorded test vectors carry their provenance (site, date, tool) beside the fixture; bulk captures
  stay out of git (see `.gitignore`).

---

## 7. Backlog & Review

Work is tracked in `storypole` (`.gaugeblock/storypole/`, keys `AF-N`). Claim before you start,
`storypole defer` anything out of scope, and close with `storypole verify <KEY> --run` so the
receipt records what was actually executed.

A change is ready to merge when: the tiered gates pass, the diff is atomic, the changelog entry is
present, file lengths are inside the ceiling, and every behavioural invariant it touches is still
stated correctly in `docs/SPEC.md`.
