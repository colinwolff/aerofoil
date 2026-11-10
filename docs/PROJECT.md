# Product Definition: `aerofoil`

> **Domain:** 1090 MHz Mode S / 1090ES (DO-260B) and 978 MHz UAT (DO-282B) decoding, FEC and state fusion  
> **Tooling:** verification uses the `gaugeblock` suite as a dogfooded dependency of the *process*
> (`miter`, `storypole`, `chalkline`, `outfeed`). `aerofoil` is an independent project and is not
> part of that suite or its organisation.  
> **License:** Apache-2.0 OR MIT

This document defines *who the product is for and what it covers*. Delivery order and status live in
[`ROADMAP.md`](./ROADMAP.md); behavioural invariants live in [`SPEC.md`](./SPEC.md); component
topology lives in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## 1. Vision & Purpose
`aerofoil` provides a fast, memory-safe, and modular suite of ADS-B / UAT protocol implementations in Rust. While 1090 MHz Mode S decoders exist in various ecosystems, **978 MHz UAT (Universal Access Transceiver - DO-282B)** remains underserved by modern systems languages. `aerofoil` bridges this divide by providing:
1. A standalone, high-performance DO-282B UAT parser with full Reed-Solomon FEC.
2. A unified aircraft tracking layer abstracting both 1090ES and 978 UAT sources.
3. Modern operational frontends, including Unix-friendly streaming CLIs, a terminal dashboard (TUI), gRPC backends, a TypeScript client SDK, an interactive web radar demo, and an AI-native Model Context Protocol (MCP) server.

---

## 2. Scope Boundaries

### In Scope
* **Protocol Ingestion & Framing:** Parsing Beast binary, raw AVR hex, and demodulated byte streams.
* **Forward Error Correction (FEC):**
  * Mode S: Table-driven / SIMD-accelerated 24-bit CRC syndrome computation; single-bit error correction against addresses already verified by the tracker (`ADR-0003`). Multi-bit correction is out of scope: an uncorrectable frame is dropped, never guessed.
  * UAT: Galois Field arithmetic over $GF(2^8)$, Berlekamp-Massey / Forney syndrome solving for Downlink $RS(48, 34)$ and Uplink $RS(92, 72)$ frames.
* **Aircraft State & Tracking:** CPR (Compact Position Reporting) decoding, velocity/heading calculation, ADS-R / TIS-B spatial deduplication, anonymous address tracking.
* **Frontends & Client Ecosystem:**
  * Unix pipeline CLI (`aerofoil-cli`) for stdout JSON-lines.
  * Terminal radar UI dashboard (`aerofoil-tui` in `apps/tui`) with Ratatui canvas PPI radar, range rings, and flight table.
  * Streaming daemon (`aerofoil-server`) for Beast, AVR, SSE, and gRPC egress.
  * AI agent integration (`aerofoil-mcp`) via stdio JSON-RPC 2.0 tools.
  * TypeScript client SDK (`sdk/`) providing `AerofoilClient` over generated `ts-rs` definitions.
  * Web radar reference application (`examples/web-radar`) using Vite and Leaflet.

### Out of Scope (Initial Milestones)
* **Direct SDR RF Frontends:** USB/PCIe sample streaming from RTL-SDR, HackRF or BladeRF will not be embedded in the decoder crates. Demodulation belongs to `aerofoil-sdr` — a sibling crate that hands framed bytes to this workspace and can stand in for dump1090 — or to an external demodulator such as dump1090 or dump978 (`ADR-0010`).
* **Full FIS-B Product Rendering:** Decoding NEXRAD graphic bitmaps or full meteorological raster products into PNGs. The parser extracts the APDU payload blocks; rendering is deferred to user applications.

---

## 3. Personas & Jobs To Be Done

| Persona | Needs | Entry point |
| :--- | :--- | :--- |
| **Receiver operator** (hobbyist or FBO running a Pi + SDR) | A decoder that does not lie: recover what is recoverable, drop the rest, never invent a position. Long-running, low-memory, restartable. | `aerofoil-cli`, `aerofoil-server` |
| **Systems / embedded engineer** | Bit-exact, allocation-free primitives that compile `no_std` and drop into firmware or a gateway without a runtime. | `aerofoil-common`, `aerofoil-1090`, `aerofoil-978` |
| **Data consumer / integrator** | A stable, versioned stream (JSON-lines, gRPC) with deduplicated tracks and explicit provenance per update. | `aerofoil-server` |
| **Operator / Dispatcher** | Real-time terminal radar display with range rings and flight tables without browser overhead. | `aerofoil-tui` |
| **Frontend / Web Developer** | Typed TypeScript client package to build custom radar displays and web map integrations. | `sdk/`, `examples/web-radar` |
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
