# `aerofoil` (Unified Rust ADS-B / UAT Decoding & Tracking Suite)

A high-performance, modular, zero-copy Rust workspace for decoding, forward-error-correcting, and correlating **1090 MHz (Mode S / 1090ES - DO-260B)** and **978 MHz (UAT - DO-282B)** aviation surveillance broadcasts.

Built according to the Unix philosophy: modular components, strictly typed primitives, zero-allocation hot paths, composable streams, and ergonomic frontends (CLI, TCP/Socket, gRPC, and Anthropic MCP).

> **Status: pre-release.** The specification of record, operating contract and licensing are in
> place; the crates land in the order given by [`docs/ROADMAP.md`](./docs/ROADMAP.md). Nothing is
> published to crates.io yet, so the Quickstart below describes the target workspace.

---

## Workspace Crates

| Crate | Path | Description |
| :--- | :--- | :--- |
| **`aerofoil-common`** | `crates/common` | Core aircraft state models, CPR coordinate transforms, units, and shared decoder traits. `no_std` compatible. |
| **`aerofoil-1090`** | `crates/1090` | Mode S / 1090ES demodulation & packet parser. Table-driven & SIMD CRC-24 parity division, burst error correction. |
| **`aerofoil-978`** | `crates/978` | DO-282B UAT frame parser, $RS(48, 34)$ and $RS(92, 72)$ Reed-Solomon FEC, de-interleaver, and FIS-B/TIS-B payload disassembly. |
| **`aerofoil-tracker`** | `crates/tracker` | Multi-band spatial tracking engine, ADS-R deduplication, and track state lifecycle manager (concurrency model still open: [ADR-0005](./docs/decisions/ADR-0005.md)). |
| **`aerofoil-server`** | `crates/server` | High-throughput streaming daemon (Beast binary, raw AVR, JSON-lines, SSE, and gRPC feeds). |
| **`aerofoil-cli`** | `apps/cli` | Composable Unix CLI for piping raw byte feeds to stdout/JSON (`cat feed.bin | aerofoil-cli | jq`). |
| **`aerofoil-mcp`** | `apps/mcp` | Model Context Protocol (MCP) server enabling LLM agents to inspect airspace state, query local tracks, and monitor alerts. |

---

## Quickstart

### Prerequisites
* Rust 1.99+ (Stable)
* Clang / LLVM (for benchmarking SIMD intrinsics)

### Build and Test
```bash
# Build the entire workspace with native CPU optimizations
RUSTFLAGS="-C target-cpu=native" cargo build --release

# Run unit tests and verification suites
cargo test --workspace

# Run zero-allocation and performance benchmarks
cargo bench --bench decode_throughput
```

### CLI Usage Example
Stream demodulated Beast frames directly through Unix pipes:
```bash
# Pipe from a remote Beast port (e.g. dump1090/readsb) directly into aerofoil-cli
nc localhost 30005 | aerofoil-cli --format beast --filter-altitude ">10000" --output json | jq .
```

---

## Architectural Principles

1. **Stack Allocation on Hot Paths:** All packet decoding and FEC syndrome computation occur with zero dynamic heap allocations.
2. **Explicit Verification & Fuzzing:** Continuous CI benchmarks against reference datasets (DO-260B / DO-282B test vectors) ensuring zero throughput regressions and validated error recovery boundaries.
3. **Decoupled Mechanisms from Policies:** Decoders parse frames into strict data types; correlation, persistence, and network distribution are independent layers.

## Documentation Index

| Document | Purpose |
| :--- | :--- |
| [`docs/PROJECT.md`](./docs/PROJECT.md) | Product definition: vision, scope boundaries, personas, success criteria. |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System component diagrams, dataflow, crate boundaries, concurrency model. |
| [`docs/SPEC.md`](./docs/SPEC.md) | Behavioural invariants and wire contracts (decoder, FEC, CPR, tracker, formats). |
| [`docs/DESIGN.md`](./docs/DESIGN.md) | Low-level math: SIMD CRC-24, Reed-Solomon over $GF(2^8)$, CPR algorithms, MCP design. |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | Milestones, exit criteria and post-`0.1.0` horizons. |
| [`docs/decisions/`](./docs/decisions/) | MADR (Markdown Architectural Decision Records). |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Toolchain, workspace layout, verification gates, licensing and provenance rules. |
| [`AGENTS.md`](./AGENTS.md) | Operating contract for autonomous agents: file-size ceiling, atomic commits, SemVer, gates. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Keep a Changelog history; `[Unreleased]` tracks the next version. |

## License

Licensed under either of [Apache License, Version 2.0](./LICENSE-APACHE) or the
[MIT license](./LICENSE-MIT) at your option. Contributions are accepted under the same dual license;
see [`CONTRIBUTING.md`](./CONTRIBUTING.md) §6 and [`NOTICE`](./NOTICE).
