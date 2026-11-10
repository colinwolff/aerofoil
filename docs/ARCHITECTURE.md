# Architecture Specification: `aerofoil`

## 1. High-Level Workspace Architecture

The system is organized into decoupled layers, separating bit-level math and parsing from stateful aggregation and transport protocols.

```
                           +--------------------------+
                           |  Raw Stream Sources      |
                           |  (Beast, AVR, frames)    |
                           +------------+-------------+
                                        |
                 +----------------------+----------------------+
                 |                                             |
                 v                                             v
       +--------------------+                        +--------------------+
       |   aerofoil-1090    |                        |    aerofoil-978    |
       |  (Mode S / 1090ES) |                        |    (UAT DO-282B)   |
       |  - SIMD CRC-24     |                        |  - RS(48,34) FEC   |
       |  - DF0..24 Parser  |                        |  - Downlink/Uplink |
       +---------+----------+                        +---------+----------+
                 |                                             |
                 +----------------------+----------------------+
                                        |
                                        | Decoded Messages (no heap)
                                        v
                           +--------------------------+
                           |     aerofoil-common      |
                           | - CPR Coordinate Math    |
                           | - Common Update Traits   |
                           +------------+-------------+
                                        |
                                        v
                           +--------------------------+
                           |     aerofoil-tracker     |
                           | - Lock-Free Sharded Map  |
                           | - ADS-R Deduplication    |
                           | - Track State / History  |
                           +------------+-------------+
                                        |
         +--------------------+--------------------+--------------------+
         |                    |                    |                    |
         v                    v                    v                    v
+------------------+  +------------------+  +-------------------+  +------------------+
|   aerofoil-cli   |  |   aerofoil-tui   |  |  aerofoil-server  |  |   aerofoil-mcp   |
| (Unix Pipes/TTY) |  | (Ratatui Radar)  |  | (TCP/gRPC/Beast)  |  |  (JSON-RPC / AI) |
+------------------+  +------------------+  +---------+---------+  +------------------+
                                                      |
                                                      | SSE / WebSocket / gRPC
                                                      v
                                            +-------------------+
                                            |       sdk/        |
                                            | (TypeScript SDK)  |
                                            +---------+---------+
                                                      |
                                                      v
                                            +-------------------+
                                            | examples/web-radar|
                                            |  (Vite + Leaflet) |
                                            +-------------------+
```

Sources hand this pipeline **framed bytes, never samples**: demodulation for both bands lives in
`aerofoil-sdr` or in an external demodulator such as dump1090 or dump978, both of which speak Beast.
That keeps the decoders `no_std`, allocation-free and testable without hardware (`ADR-0010`).

---

## 2. Core Subsystems

### 2.1 Protocol Engines (`aerofoil-1090` & `aerofoil-978`)
* **Strict Invariants:**
  * Zero dynamic allocations (`#![no_std]` core with optional `alloc`).
  * Pure functions receiving fixed-size byte slices (`&[u8]`) or small arrays (`[u8; 14]`, `[u8; 48]`).
  * Explicit, non-panicking error handling returning typed error enums (`DecodeError::ChecksumMismatch`, `DecodeError::UncorrectableRs`).
* **Error Recovery Takes Its Trust Input by Injection:** single-bit correction consults an `AddressFilter` supplied by the caller (`aerofoil_common::AddressFilter`) and never reaches upward into stateful tracking, so the crate stays `no_std` and the layer order holds (`ADR-0004`).

### 2.2 Shared Domain Models (`aerofoil-common`)
* Canonical representations for coordinates (WGS-84 micro-degrees or fixed-point integers to avoid rounding drifts), barometric/geometric altitude, squawk codes, emitter categories, and navigation accuracy categories (NACp, SIL).
* Implementation of global and local Compact Position Reporting (CPR) algorithms per DO-260B §2.2.3.2.5.

### 2.3 State Fusion Engine (`aerofoil-tracker`)
* **Data Structure:** Sharded hash table partitioned across CPU cores using 64 independent striped `parking_lot::RwLock` segments (`ADR-0005`).
* **Address Filter Implementation:** the tracker implements `aerofoil_common::AddressFilter` over its verified-address set, so a decoder's single-bit correction can consult tracking state without depending on it (`ADR-0004`).
* **Target Disambiguation:** Tracks are keyed by `(AddressType, u32)` to isolate standard ICAO transponders from anonymous UAT self-assigned addresses.
* **ADS-R Cross-Band Deduplication:** Prioritizes direct reception over re-broadcast targets within a spatial-temporal window ($\Delta t \le 1.0\text{s}, \Delta d \le 0.001^\circ$).

---

## 3. Concurrency & Dataflow Model

1. **Ingest Stage:** Fast non-blocking socket or stdin readers push fixed frame buffers into bounded, lock-free ring buffers (SPSC / MPMC channels). Every source carries a **band tag** (1090 or 978) and a source id, and one process accepts many: fusion needs both bands in the same track table (`SPEC.md` Invariant 10), so `aerofoil-server` takes one named source per band while `aerofoil-cli` stays single-stream by design (`ADR-0010`).
2. **Worker Pool (Rayon / Dedicated Core Threads):**
   * Worker threads pull raw frames, execute CRC/Reed-Solomon verification, parse bitfields, and resolve position.
   * Invalid or uncorrectable frames are dropped immediately without hitting the tracker.
3. **Tracker Dispatch:** Valid updates are applied via atomic or short-lived read-write locks to the track table.
4. **Egress Stage:** Subscribers receive state change events over non-blocking broadcast channels.

---

## 4. Frontends & Client Ecosystem

### 4.1 Terminal UI Dashboard (`aerofoil-tui`)
* Standalone terminal application in `apps/tui` built with Ratatui.
* Canvas-based Plan Position Indicator (PPI) radar display with customizable range rings and directional heading vectors.
* Interactive keyboard-driven airspace filtering (by altitude band, link source, emergency squawk, or callsign prefix).
* Telemetry inspector showing signal recovery metrics, squawk alerts (`7500`, `7600`, `7700`), and real-time message rates.

### 4.2 Streaming Server & Unix CLI (`aerofoil-server` & `aerofoil-cli`)
* `aerofoil-cli`: Minimal Unix-filter binary reading Beast or AVR hex from `stdin` and emitting validated JSON-lines to `stdout`.
* `aerofoil-server`: Multi-source TCP ingest daemon multiplexing 1090 MHz and 978 MHz streams into the tracker, broadcasting updates via SSE, WebSocket, and gRPC.

### 4.3 AI Agent Integration (`aerofoil-mcp`)
* Model Context Protocol (MCP) server communicating over stdio JSON-RPC 2.0.
* Exposes tools (`get_airspace_summary`, `get_track`, `find_closest`) for autonomous LLM agents to query live airspace state.

### 4.4 TypeScript Client SDK (`sdk/`) & Web Demo (`examples/web-radar`)
* `sdk/`: Lightweight TypeScript package (`AerofoilClient`) consuming generated `ts-rs` type definitions from `aerofoil-common`, offering auto-reconnecting WebSocket/SSE subscriptions and event-emitter dispatching.
* `examples/web-radar`: Reference single-page application built with Vite and Leaflet, displaying live airspace targets on a dark-mode interactive map with rotated SVG aircraft markers and sortable telemetry tables.
