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
To compile with architecture-specific vector intrinsics (e.g., AVX2, PCLMULQDQ):
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

### Reference Hardware Specification
* **Processor:** Intel(R) Core(TM) i7-5557U CPU @ 3.10GHz (Broadwell, Dual-Core / 4 Threads)
* **Architecture:** `x86_64`
* **Vector Extensions:** `PCLMULQDQ`, `AVX2`, `FMA`, `SSE4.2`
* **OS:** Darwin / macOS (`x86_64-apple-darwin`)
* **Compiler:** `rustc 1.99.0` (Edition 2024)
* **Optimization Profile:** `bench` (`opt-level = 3`, LTO enabled)

### Microbenchmark Latencies

| Benchmark Kernel | Operation | Mean Latency | Throughput | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `crc24/table/11` | 112-bit frame CRC-24 syndrome | **~36.2 ns** | ~27.6 M frames/sec | Precomputed 256-entry lookup table |
| `crc24/clmul/11` | 112-bit frame CRC-24 syndrome | **~451.0 ns** | ~2.2 M frames/sec | Hardware carryless multiplication (`PCLMULQDQ`) |
| `df_parsing/df17_position` | Zero-copy DF17 position unpack | **~107.8 ns** | ~9.3 M frames/sec | Pure bitwise shift and mask |
| `df_parsing/df17_filtered_clean` | Filtered DF17 frame verification | **~135.5 ns** | ~7.4 M frames/sec | AddressFilter lookup + clean syndrome |
| `df_parsing/df17_filtered_corrected` | Address-filtered 1-bit bitflip repair | **~44.1 ns** | ~22.7 M frames/sec | Single-bit error correction |
| `rs48_34/decode_clean` | Clean UAT $RS(48,34)$ codeword | **~6.44 µs** | ~155k frames/sec | Syndromes evaluation & early exit |
| `rs48_34/decode_3_errors` | Full Berlekamp-Massey + Forney | **~4.21 µs** | ~237k frames/sec | Corrects 3 byte errors in-place |
| `rs48_34/deinterleave_downlink` | Matrix de-interleaving | **~10.0 ns** | ~99.8 M frames/sec | Bijective transposition |
| `uat_parsing/parse_state_vector` | 34-byte SV bitfield parsing | **~30.7 ns** | ~32.5 M frames/sec | Zero-copy state vector unpack |
| `uat_parsing/uat_downlink_decode_long` | Full UAT long frame decode | **~65.4 ns** | ~15.3 M frames/sec | Deinterleave + header + payload unpack |

### Macrobenchmark Throughput & Pipeline Replay

| Scenario / Fixture | Frames | Engine Pacing | Total Duration | Effective Processing Rate |
| :--- | :--- | :--- | :--- | :--- |
| `1090_dense.beast` | 104 frames | `burst` (unthrottled) | **~42.6 µs** | **~2,440,000 frames/sec** |
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
