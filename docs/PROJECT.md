# Product Definition: `aerofoil`

> **Domain:** 1090 MHz Mode S / 1090ES (DO-260B) and 978 MHz UAT (DO-282B) decoding, FEC and state fusion  
> **Ecosystem:** `gaugeblock` — built and verified with the suite (`miter`, `storypole`, `chalkline`, `outfeed`)  
> **License:** Apache-2.0 OR MIT

This document defines *who the product is for and what it covers*. Delivery order and status live in
[`ROADMAP.md`](./ROADMAP.md); behavioural invariants live in [`SPEC.md`](./SPEC.md); component
topology lives in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## 1. Vision & Purpose
`aerofoil` provides a fast, memory-safe, and modular suite of ADS-B / UAT protocol implementations in Rust. While 1090 MHz Mode S decoders exist in various ecosystems, **978 MHz UAT (Universal Access Transceiver - DO-282B)** remains underserved by modern systems languages. `aerofoil` bridges this divide by providing:
1. A standalone, high-performance DO-282B UAT parser with full Reed-Solomon FEC.
2. A unified aircraft tracking layer abstracting both 1090ES and 978 UAT sources.
3. Modern operational frontends, including Unix-friendly streaming CLIs, gRPC backends, and an AI-native Model Context Protocol (MCP) server.

---

## 2. Scope Boundaries

### In Scope
* **Protocol Ingestion & Framing:** Parsing Beast binary, raw AVR hex, and demodulated byte streams.
* **Forward Error Correction (FEC):**
  * Mode S: Table-driven / SIMD-accelerated 24-bit CRC syndrome computation; single- and double-bit error correction against known ICAO addresses.
  * UAT: Galois Field arithmetic over $GF(2^8)$, Berlekamp-Massey / Forney syndrome solving for Downlink $RS(48, 34)$ and Uplink $RS(92, 72)$ frames.
* **Aircraft State & Tracking:** CPR (Compact Position Reporting) decoding, velocity/heading calculation, ADS-R / TIS-B spatial deduplication, anonymous address tracking.
* **Frontends:** Unix pipes (`aerofoil-cli`), streaming server (`aerofoil-server`), and Agent API (`aerofoil-mcp`).

### Out of Scope (Initial Milestones)
* **Direct SDR RF Frontends:** Direct USB/PCIe sample streaming from RTL-SDR, HackRF, or BladeRF will not be embedded in the core parser crates. External tools (`rtl_sdr`, `soapy_power`) pipe samples into the demodulator/framer.
* **Full FIS-B Product Rendering:** Decoding NEXRAD graphic bitmaps or full meteorological raster products into PNGs. The parser extracts the APDU payload blocks; rendering is deferred to user applications.

---

## 3. Personas & Jobs To Be Done

| Persona | Needs | Entry point |
| :--- | :--- | :--- |
| **Receiver operator** (hobbyist or FBO running a Pi + SDR) | A decoder that does not lie: recover what is recoverable, drop the rest, never invent a position. Long-running, low-memory, restartable. | `aerofoil-cli`, `aerofoil-server` |
| **Systems / embedded engineer** | Bit-exact, allocation-free primitives that compile `no_std` and drop into firmware or a gateway without a runtime. | `aerofoil-common`, `aerofoil-1090`, `aerofoil-978` |
| **Data consumer / integrator** | A stable, versioned stream (JSON-lines, gRPC) with deduplicated tracks and explicit provenance per update. | `aerofoil-server` |
| **Autonomous agent operator** | Programmatic airspace queries — summary, single track, nearest aircraft — without scraping a UI or holding table locks. | `aerofoil-mcp` |

| When I... | I want to... | So that I can... |
| :--- | :--- | :--- |
| Run a feeder at a noisy site | See how many frames were corrected versus dropped | Judge link quality instead of guessing why tracks vanish |
| Build an embedded receiver | Link only the 1090 or only the 978 path | Fit a Cortex-M target without dragging in a tokio runtime |
| Fuse two receivers | Trust that a re-broadcast never overwrites a direct sighting | Keep one authoritative position per aircraft |
| Ask an LLM about local traffic | Get typed, bounded answers (bbox/radius) from a local process | Automate monitoring without shipping raw feeds to a third party |

---

## 4. Success Criteria

1. **Correct before fast:** DO-260B / DO-282B test vectors pass exactly; every rejection path is typed and counted.
2. **Zero-allocation hot path:** a counting allocator proves no heap traffic per decoded frame.
3. **Throughput:** `> 2×10^6` 1090 frames/sec/core against a committed baseline; no regression ships.
4. **Predictable operations:** bounded memory under sustained input, no unbounded queue growth, clean `SIGPIPE` behaviour in pipelines.
5. **Honest documentation:** the nine canonical documents stay true in the commit that changes behaviour (`chalkline docs check -d .`).

---

## 5. Delivery Plan

Milestones, exit criteria and horizons are maintained in [`ROADMAP.md`](./ROADMAP.md) — one source of
truth, so this document does not restate them. Backlog items live in `storypole`
(`.gaugeblock/storypole/`), keys `AF-N`.
