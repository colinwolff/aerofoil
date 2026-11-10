# Egress Wire Contracts

This document is the single field-level source of truth for all wire formats emitted by `aerofoil`.
Framing semantics and behavioural invariants are governed by [`SPEC.md`](SPEC.md) §5.

---

## 1. JSON-lines Target Surface (`aerofoil.target`)

Emitted on `stdout` by `aerofoil-cli` and broadcast over SSE and WebSocket by `aerofoil-server`.
Every record carries an envelope specifying schema name and integer version.

* **Schema Identifier:** `aerofoil.target`
* **Current Version:** `1`
* **Rust Wire Representation:** `aerofoil_server::TargetWireJson` / `aerofoil_cli::TargetWire`
* **Derives:** `Serialize`, `Deserialize`, `Clone`, `Debug`, `PartialEq`

| Field | Type | Optional | Units / Format | Description |
| :--- | :--- | :--- | :--- | :--- |
| `schema` | `string` | No | `"aerofoil.target"` | Schema namespace |
| `version` | `u32` | No | `1` | Wire schema version |
| `address` | `string` | No | Hex string (e.g. `"4840D6"`) | 24-bit transponder address |
| `address_type` | `string` | No | `"icao" \| "surface_beacon" \| "anonymous"` | Target address classification |
| `callsign` | `string` | Yes | 1-8 ASCII chars (trimmed) | Flight identification |
| `squawk` | `string` | Yes | 4-digit octal (e.g. `"7700"`) | Mode A squawk code |
| `altitude` | `i32` | Yes | Feet | Barometric or geometric altitude |
| `altitude_kind` | `string` | Yes | `"barometric" \| "geometric"` | Altitude datum reference |
| `ground_speed_knots` | `u16` | Yes | Knots | Horizontal ground speed |
| `heading` | `f64` | Yes | Degrees true north (0.0..360.0) | Ground track angle |
| `vertical_rate_fpm` | `i16` | Yes | Feet per minute | Climb (+) or descent (-) rate |
| `latitude` | `f64` | Yes | WGS-84 degrees (-90.0..90.0) | Decoded geographic latitude |
| `longitude` | `f64` | Yes | WGS-84 degrees (-180.0..180.0) | Decoded geographic longitude |
| `emitter_category` | `u8` | Yes | Integer (0..=39) | Surveillance emitter type |
| `nic` | `u8` | Yes | Integer (0..=15) | Navigation Integrity Category |
| `source` | `string` | No | `"1090" \| "978"` | RF link protocol |
| `reception` | `string` | No | `"direct" \| "rebroadcast"` | Broadcast provenance |
| `last_seen_ms` | `u64` | No | Epoch milliseconds | Timestamp when update occurred |

---

## 2. Raw Capture Recording Surface (`aerofoil.frame`)

Emitted by `aerofoil-persistence` JSONL sinks for frame capture and deterministic replay.

* **Schema Identifier:** `aerofoil.frame`
* **Current Version:** `1`
* **Rust Representation:** `aerofoil_persistence::RecordedFrame`
* **Derives:** `Serialize`, `Deserialize`, `Clone`, `Debug`, `PartialEq`

| Field | Type | Optional | Units / Format | Description |
| :--- | :--- | :--- | :--- | :--- |
| `schema` | `string` | No | `"aerofoil.frame"` | Schema namespace |
| `version` | `u32` | No | `1` | Wire schema version |
| `band` | `string` | No | `"1090" \| "978"` | Ingestion surveillance band |
| `timestamp_ms` | `u64` | No | Epoch milliseconds | Capture ingestion timestamp |
| `signal_level` | `u8` | No | RSSI (0..=255) | Receiver signal strength |
| `raw_hex` | `string` | No | Hex string (14 or 28 chars) | Raw framed transmission bytes |
| `corrected_bits` | `u8` | No | Integer (0..=7) | Bit/symbol errors corrected by FEC |

---

## 3. Model Context Protocol Stdio Surface (`aerofoil-mcp`)

JSON-RPC 2.0 communication over standard input and standard output (`SPEC.md` §5).

* **Protocol Framing:** UTF-8 JSON-RPC 2.0 records delimited by newline (`\n`).
* **Stdout Invariant:** `stdout` carries protocol frames only; all diagnostics go to `stderr`.
* **Rust Representation:** `aerofoil_mcp::JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcError`

### Tool: `get_airspace_summary`
* **Input Schema:**
  * `min_altitude` (`integer`, optional): Minimum altitude filter in feet.
  * `max_altitude` (`integer`, optional): Maximum altitude filter in feet.
* **Result Payload:**
  * `total_tracks` (`usize`): Total tracks currently held in the tracker table.
  * `filtered_tracks` (`usize`): Tracks satisfying altitude filter constraints.
  * `source_1090es` (`usize`): Number of active tracks received via 1090 MHz.
  * `source_uat978` (`usize`): Number of active tracks received via 978 MHz.
  * `emergencies` (`usize`): Count of tracks broadcasting squawks `7500`, `7600`, or `7700`.
  * `tracks` (`array`): Formatted track descriptors matching query.

### Tool: `get_track`
* **Input Schema:**
  * `address` (`string`, optional): Hex string (e.g. `"0x4840D6"`) or decimal address.
  * `callsign` (`string`, optional): Flight identification string (e.g. `"KLM1023"`).
* **Result Payload:** Complete target state object if found, or structured error message.

### Tool: `find_closest`
* **Input Schema:**
  * `latitude` (`number`, required): Reference latitude in degrees.
  * `longitude` (`number`, required): Reference longitude in degrees.
  * `limit` (`integer`, optional): Maximum number of closest targets to return (default 5).
* **Result Payload:**
  * `reference_latitude` (`f64`), `reference_longitude` (`f64`), `count` (`usize`).
  * `closest_tracks` (`array`): Target records sorted by distance, with `distance_nm` (`f64`).

---

## 4. Protobuf / gRPC Surface (`aerofoil.v1`)

Defined in `proto/aerofoil/v1/service.proto` for high-throughput binary streaming.

* **Package:** `aerofoil.v1`
* **Protobuf Invariants:** Field numbers are never reused; enum values are append-only.
* **Compatibility Gate:** Protobuf backward compatibility is verified via prost round-trip tests.

---

## 5. TypeScript SDK Client Surface (`sdk/`)

TypeScript definitions generated from Rust types using `ts-rs` under `aerofoil-common` (`export-ts` feature).

* **Source Types:** `aerofoil_common::{AircraftTarget, Position, Altitude, Velocity, Heading, Squawk}`
* **Target Directory:** `sdk/src/types/`
* **Verification Gate:** `miter contracts --check` enforces zero schema drift between Rust structs and exported TypeScript interfaces.
