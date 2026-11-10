---
status: accepted
date: 2026-11-04
---

# 2. Implement Dedicated DO-282B Reed-Solomon Codec


## Context and Problem Statement
978 MHz UAT DO-282B relies on Reed-Solomon FEC: $RS(48, 34)$ for Downlink and $RS(92, 72)$ for Uplink over $GF(2^8)$. Existing general-purpose RS crates in Rust either:
* Rely on dynamic heap allocations during syndrome computation and polynomial division.
* Do not support SIMD or branch-free Berlekamp-Massey evaluation.
* Lack fixed parameter specialization for DO-282B primitive polynomials ($P(x) = \mathtt{0x11D}$).

## Considered Options
1. Link to external C libraries (e.g., `libfec` or FlightAware's `dump978` C implementation).
2. Use an existing generic Rust Reed-Solomon crate (`reed-solomon-erasure` or `reed-solomon-novelpoly`).
3. Implement a specialized, allocation-free $GF(2^8)$ Berlekamp-Massey/Forney codec in `aerofoil-978`.

## Decision Outcome
Chosen option: **Option 3 (Specialized allocation-free $GF(2^8)$ codec)**.

### Positive Consequences
* Zero runtime heap allocations; uses fixed stack buffers (`[u8; 48]`).
* Full control over branch-free inner loops and compiler vectorization.
* Eliminates C ABI linkage, making cross-compilation trivial for ARM, RISC-V, and x86 targets.

### Negative Consequences
* Implementation effort: Requires mathematical verification against DO-282B Appendix test vectors and rigorous property-based fuzzing.