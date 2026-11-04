# Architecture Specification: `aerofoil`

## 1. High-Level Workspace Architecture

The system is organized into decoupled layers, separating bit-level math and parsing from stateful aggregation and transport protocols.

```
                           +--------------------------+
                           |  Raw Stream Sources      |
                           |  (RTL-SDR, Beast, AVR)   |
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
         +------------------------------+------------------------------+
         |                              |                              |
         v                              v                              v
+------------------+          +-------------------+          +------------------+
|   aerofoil-cli   |          |  aerofoil-server  |          |   aerofoil-mcp   |
| (Unix Pipes/TTY) |          | (TCP/gRPC/Beast)  |          |  (JSON-RPC / AI) |
+------------------+          +-------------------+          +------------------+
```

---

## 2. Core Subsystems

### 2.1 Protocol Engines (`aerofoil-1090` & `aerofoil-978`)
* **Strict Invariants:**
  * Zero dynamic allocations (`#![no_std]` core with optional `alloc`).
  * Pure functions receiving fixed-size byte slices (`&[u8]`) or small arrays (`[u8; 14]`, `[u8; 48]`).
  * Explicit, non-panicking error handling returning typed error enums (`DecodeError::ChecksumMismatch`, `DecodeError::UncorrectableRs`).

### 2.2 Shared Domain Models (`aerofoil-common`)
* Canonical representations for coordinates (WGS-84 micro-degrees or fixed-point integers to avoid rounding drifts), barometric/geometric altitude, squawk codes, emitter categories, and navigation accuracy categories (NACp, SIL).
* Implementation of global and local Compact Position Reporting (CPR) algorithms per DO-260B §2.2.3.2.5.

### 2.3 State Fusion Engine (`aerofoil-tracker`)
* **Data Structure:** Sharded hash table partitioned across CPU cores (e.g., using 64 independent striped `parking_lot::RwLock` segments or lock-free hash primitives) keyed by 24-bit integer addresses.
* **Target Disambiguation:** Tracks are keyed by `(AddressType, u32)` to isolate standard ICAO transponders from anonymous UAT self-assigned addresses.
* **ADS-R Cross-Band Deduplication:** Prioritizes direct reception over re-broadcast targets within a spatial-temporal window ($\Delta t \le 1.0\text{s}, \Delta d \le 0.001^\circ$).

---

## 3. Concurrency & Dataflow Model

1. **Ingest Stage:** Fast non-blocking socket or stdin readers push fixed frame buffers into bounded, lock-free ring buffers (SPSC / MPMC channels).
2. **Worker Pool (Rayon / Dedicated Core Threads):**
   * Worker threads pull raw frames, execute CRC/Reed-Solomon verification, parse bitfields, and resolve position.
   * Invalid or uncorrectable frames are dropped immediately without hitting the tracker.
3. **Tracker Dispatch:** Valid updates are applied via atomic or short-lived read-write locks to the track table.
4. **Egress Stage:** Subscribers receive state change events over non-blocking broadcast channels.