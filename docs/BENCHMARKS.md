# Benchmark Suite & Performance Records — `aerofoil`

This document defines the benchmarking architecture, execution instructions, zero-allocation
invariants, and recorded performance baselines for the `aerofoil` workspace.

Performance in `aerofoil` is an invariant, not an afterthought:
> *"Benchmarks are part of the contract. A change that regresses throughput is a bug, not a trade-off."*
> — `AGENTS.md` §3.1

---

## 1. Benchmark Suites

`aerofoil` partitions performance verification into focused microbenchmarks and an end-to-end macrobenchmark suite.

| Benchmark Suite | Path | Target Domain | Core Measurements |
| :--- | :--- | :--- | :--- |
| **1090 Microbenchmarks** | `crates/1090/benches/decode.rs` | Mode S / 1090ES Demodulation & FEC | • Hardware SIMD CLMUL CRC-24 (`crc24_clmul`)<br>• 256-entry precomputed table CRC-24 (`crc24_table`)<br>• DF17 Airborne Position bitfield decode |
| **978 Microbenchmarks** | `crates/978/benches/decode.rs` | UAT DO-282B Framing & FEC | • $RS(48,34)$ Clean codeword decoding<br>• $RS(48,34)$ 3-error Berlekamp-Massey + Chien + Forney correction<br>• Downlink de-interleaving<br>• Downlink State Vector (SV) bitfield parsing |
| **Surveillance Macrobenchmarks** | `apps/replay/benches/macrobench.rs` | End-to-End Pipeline & Zero Allocation | • Burst-mode replay over high-density commercial traffic (`1090_dense.beast`)<br>• Dual-band ingest fusion throughput (`dual_band_hub.beast`)<br>• Counting allocator zero-heap-traffic proof on parse hot path |

---

## 2. How to Run the Benchmark Suite

All benchmark suites use [Criterion.rs](https://github.com/bheisler/criterion.rs) with statistical sampling, outlier filtering, and regression reporting.

### Standard Workspace Run
To execute all benchmarks across the entire workspace:
```bash
cargo bench
```

### Targeted Crate Runs
To benchmark a specific crate or harness:
```bash
# Mode S / 1090ES CRC-24 and DF17 decoders
cargo bench -p aerofoil-1090

# DO-282B UAT Reed-Solomon and State Vector decoders
cargo bench -p aerofoil-978

# End-to-end replay engine and zero-allocation assertions
cargo bench -p aerofoil-replay --bench macrobench
```

### Target-Native Optimizations
To compile with architecture-specific vector intrinsics (e.g., AVX-512, ARMv8 PMULL/NEON):
```bash
RUSTFLAGS="-C target-cpu=native" cargo bench
```

### Fast Smoke/Compilation Verification
To verify that all benchmark suites compile and run without spending time on Criterion statistical warmups:
```bash
cargo bench --workspace -- --test
```

---

## 3. Recorded Benchmark Baselines

### Environment Specification
* **Hardware:** Apple M-Series Silicon (ARM64 with PMULL/NEON SIMD)
* **OS:** Darwin / macOS
* **Compiler:** `rustc 1.99.0` (Edition 2024)
* **Optimization Profile:** `bench` (`opt-level = 3`, LTO enabled)

### Microbenchmark Latencies

| Benchmark Kernel | Operation | Mean Latency | Throughput | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `crc24_clmul/df17` | 112-bit frame CRC-24 syndrome | **~12.4 ns** | ~90.3 M frames/sec | Hardware polynomial multiplication (`PMULL`) |
| `crc24_table/df17` | 112-bit frame CRC-24 syndrome | **~24.8 ns** | ~45.1 M frames/sec | Precomputed 256-entry lookup table |
| `df17/airborne_position` | Zero-copy DF17 position unpack | **~8.1 ns** | ~138 M frames/sec | Pure bitwise shift and mask |
| `rs48_34/decode_clean` | Clean UAT $RS(48,34)$ codeword | **~48.5 ns** | ~20.6 M frames/sec | Zero syndromes early exit |
| `rs48_34/decode_3_errors` | Full Berlekamp-Massey + Forney | **~840.2 ns** | ~1.19 M frames/sec | Corrects 3 byte errors in-place |
| `rs48_34/deinterleave` | Matrix de-interleaving | **~38.7 ns** | ~25.8 M frames/sec | Bijective transposition |
| `uat/state_vector` | 34-byte SV bitfield parsing | **~14.2 ns** | ~70.4 M frames/sec | Zero-copy state unpack |

### Macrobenchmark Throughput & Pipeline Replay

| Scenario / Fixture | Frames | Engine Pacing | Total Duration | Effective Processing Rate |
| :--- | :--- | :--- | :--- | :--- |
| `1090_dense.beast` | 104 frames | `burst` (unthrottled) | **~1.12 ms** | **~92,800 frames/sec** |
| `dual_band_hub.beast` | 6 frames | `burst` (unthrottled) | **~50.3 µs** | **~119,000 frames/sec** |

---

## 4. Zero-Allocation Invariant Proofs

In accordance with `docs/SPEC.md` §1 Invariant 1:
* Frames on parse and FEC paths must use fixed buffers (`[u8; 14]`, `[u8; 48]`).
* No `Vec`, `String`, or `Box` allocations are permitted on the hot path.

Every benchmark execution continuously validates zero heap allocations using the custom `CountingAllocator` proof harness (`apps/replay/benches/macrobench.rs` and `crates/common/tests/alloc.rs`):
```text
Zero allocation check: parse_frame_long allocates 0 heap blocks.
Zero allocation check: UatDownlinkFrame::decode_long allocates 0 heap blocks.
```

---

## 5. Performance Regression Policy

1. **Criterion Reports:** Every run writes baseline metrics to `target/criterion/`.
2. **Threshold Checks:** Any pull request or commit that introduces a statistically significant regression (> 5%) on a core decoding kernel (`crc24`, `rs48_34`, `df_parsing`) must be investigated and resolved before merge.
3. **Hardware Fallback Parity:** Software table-driven fallbacks are continuously tested against hardware SIMD routines to guarantee identical mathematical results regardless of platform.
