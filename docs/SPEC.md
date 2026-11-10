# Behavioral Specifications & Invariants: `aerofoil`

> **Crates:** `aerofoil-common`, `aerofoil-1090`, `aerofoil-978`, `aerofoil-tracker`,
> `aerofoil-server`, `aerofoil-cli`, `aerofoil-mcp`
> **Normative sources:** RTCA DO-260B (1090ES), RTCA DO-282B (UAT), ICAO Annex 10 Vol IV
> **Wire schemas:** Beast binary, raw AVR hex, JSON-lines, gRPC, MCP JSON-RPC 2.0

This document states what must be true of the running system. Algorithm derivations live in
[`DESIGN.md`](./DESIGN.md); component topology lives in [`ARCHITECTURE.md`](./ARCHITECTURE.md).
A change that violates a clause here is a defect regardless of which crate it lands in.

---

## 1. Decoder Contract Invariants

### Invariant 1: Fixed-Size, Zero-Allocation Frames

- A decoded frame is a value, never a heap graph: `[u8; 14]` for Mode S long frames, `[u8; 7]` for
  short frames, `[u8; 48]` for UAT downlink (`RS(48, 34)`) and `[u8; 92]` for UAT uplink
  (`RS(92, 72)`).
- No decoder, FEC routine, or bitfield accessor allocates. `aerofoil-common`, `aerofoil-1090` and
  `aerofoil-978` are `#![no_std]` with `alloc` behind an optional feature that no decode path uses.
- All buffers are caller-owned or stack-resident; no global mutable state.

### Invariant 2: Purity and Panic-Freedom

- Decoders are pure functions: fixed slice in, typed frame or typed error out. No I/O, no clock, no
  RNG, no environment access on the decode path.
- Hostile input never panics. Indexing is bounds-checked or preceded by a length guard; arithmetic
  on untrusted widths is checked. `unwrap()` and `expect()` are denied by workspace lint.
- Bitfield extraction is total: an accessor on a wrong-length frame returns `None`/an error, never a
  defaulted value.

### Invariant 3: Typed Error Model

| Variant | Raised when | Caller obligation |
| :--- | :--- | :--- |
| `DecodeError::Truncated` | Input shorter than the frame length the header implies | Discard; advance one byte, resynchronise |
| `DecodeError::ChecksumMismatch` | CRC-24 syndrome is non-zero and no correction applies | Discard unless the address-filtered correction path succeeds |
| `DecodeError::UncorrectableRs` | Reed-Solomon syndromes yield no valid error locator (more errors than `t`) | Discard the frame; count it in telemetry |
| `DecodeError::UnsupportedFormat` | Well-formed frame carrying a DF/type the build does not implement | Discard silently; never guess semantics |
| `DecodeError::InvalidField` | Field value outside the specified domain (e.g. altitude code `0`, CPR `NL` = 0) | Discard; do not clamp into a plausible value |

---

## 2. 1090ES Frame Contracts

### Invariant 4: CRC-24 and Address Parity

- The generator is `G(x) = x^24 + x^23 + x^22 + x^21 + x^20 + x^19 + x^18 + x^17 + x^16 + x^15 +
  x^13 + x^10 + x^8 + x^7 + x^5 + x^3 + x + 1` (`0x1FFF409`), per ICAO Annex 10.
- For DF11 and DF17/DF18 the 24-bit parity field is XORed with the transmitter's 24-bit ICAO address
  (Address/Parity). A zero syndrome therefore *recovers* the address; a non-zero syndrome means a
  corrupted frame or a mismatch.
- DF20/DF21 carry a data parity that additionally embeds the interrogator identifier; they are not
  corrected and are only accepted when the recovered address matches an active track.

### Invariant 5: Bounded Error Correction

- Single-bit correction is permitted **only** when the corrected ICAO address is accepted by the
  `AddressFilter` handed to the decoder, which the tracker implements over its verified-address set
  (ADR-0003, ADR-0004). Corrected frames never create a new track.
- The decoder never reaches into tracking state: given `DenyAll` (or no filter), correction is off and
  every non-zero syndrome is `DecodeError::ChecksumMismatch`.
- Two-bit and blind multi-bit search are out of scope: a frame is dropped rather than guessed. The
  recovery rate is reported per receiver, not silently spent.

### Invariant 6: Downlink Format Dispatch

| DF | Bits | Parity semantics | Long frame | Handled by |
| :--- | :--- | :--- | :--- | :--- |
| 0 | 56 | Address/Parity | no | short-frame parser |
| 4 | 56 | Address/Parity | no | short-frame parser |
| 5 | 56 | Address/Parity | no | short-frame parser |
| 11 | 56 | Address/Parity (all-call) | no | short-frame parser |
| 17 | 112 | Address/Parity (ADS-B) | yes | extended squitter parser |
| 18 | 112 | Address/Parity, non-transponder address | yes | extended squitter parser |
| 20 | 112 | Data parity (Comm-B) | yes | long-frame parser |
| 21 | 112 | Data parity (Comm-B identity) | yes | long-frame parser |

An unlisted DF is `DecodeError::UnsupportedFormat`, not an inference.
Surveillance reply operational states and alerting conditions are formally captured by `FlightStatus`
and transponder capability by `TransponderCapability`. Airborne position reports convey status via
`SurveillanceStatus`.

---

## 3. UAT (DO-282B) Frame Contracts

### Invariant 7: Reed-Solomon Geometry

- Field: `GF(2^8)`, primitive polynomial `P(x) = x^8 + x^4 + x^3 + x^2 + 1` (`0x11D`).
- Downlink `RS(48, 34)`: 34 payload bytes, 14 parity bytes, correction radius `t = 7` bytes.
- Uplink `RS(92, 72)`: 72 payload bytes, 20 parity bytes, correction radius `t = 10` bytes.
- Parity symbols are generated at roots `α^120 .. α^(120 + 2t - 1)`; syndrome computation, Chien
  search and Forney evaluation use fixed-size stack tables (ADR-0002).

### Invariant 8: Interleaving and Frame Validity

- UAT downlink bytes are transmitted interleaved across four message phases and must be
  de-interleaved before syndrome computation; de-interleaving is a fixed permutation, not a sort.
- Downlink frames are represented by `UatDownlinkFrame` and classified by `UatFrameKind`.
- Downlink telemetry is parsed into zero-allocation `StateVector` and `ModeStatus` structures,
  with operational status classified by `AirgroundState`.
- A frame whose payload length field disagrees with its Reed-Solomon geometry is rejected before FEC
  is attempted (`DecodeError::InvalidField`), so FEC is never asked to repair a framing error.
- A successfully corrected frame reports `corrected_symbols: u8` so consumers can weight it; a frame
  with `corrected_symbols > t` is impossible by construction and is an internal invariant failure.

---

## 4. Position, Velocity and Track Contracts

### Invariant 9: CPR Decoding

- `NZ = 60`; latitude zone widths are `360/60` (even) and `360/59` (odd), per DO-260B §2.2.3.2.5.
- The `NL(lat)` transition table is a fixed 60-entry array; it is data, not runtime trigonometry, so
  that results are bit-identical across platforms and `no_std` targets.
- Global decoding requires an even/odd pair received within the same 10-second window; outside that
  window the pair is rejected and the local (reference-position) decoder is used instead.
- Global decoding that crosses a zone-boundary anomaly (`NL` mismatch between the pair) is rejected
  rather than snapped to the nearest plausible cell. A wrong position is worse than no position.
- Errors encountered during CPR decoding are strongly typed as `CprError`:
  `CprError::SameParity`, `CprError::PairWindowExceeded`, `CprError::OutOfRangeCoordinate`,
  `CprError::InvalidLatitude`, `CprError::InvalidLongitude`, and `CprError::ZoneMismatch`.
- Latitude and longitude are represented in fixed-point micro-degrees; no `f32`/`f64` value is ever
  the stored form of a position.

### Invariant 10: Track Identity and Deduplication

- A track key is `(AddressType, u32)`. Standard ICAO, anonymous UAT self-assigned, TIS-B and ADS-R
  addresses never share a key space, so a re-broadcast cannot hijack a direct track.
- Disambiguated targets are represented by `AircraftTarget`, tracking transponder link provenance
  via `TransponderSource` (`ModeS1090`, `Uat978`) and transmission path via `ReceptionSource` (`Direct`,
  `Rebroadcast`).
- Airspace events and target lifecycle transitions are represented by `AirspaceEvent` (`TargetAcquired`,
  `TargetUpdated`, `TargetLost`).
- A re-broadcast update is applied only when no direct-reception update arrived within
  `Δt ≤ 1.0 s` **and** within `Δd ≤ 0.001°` of the track's current position (ADR-0001 layering,
  `ARCHITECTURE.md` §2.3).
- Track state is monotonic per field: a message that lacks a field never clears it. Expiry is
  time-based (`TTL`), never "field absent means gone".
- Every accepted update carries the source (`Direct` or `Rebroadcast`) and the receive timestamp, so
  a consumer can reconstruct why a position changed.

---

## 5. Wire Contracts

| Surface | Framing | Contract |
| :--- | :--- | :--- |
| Beast | `0x1A` escape, type byte, 6-byte MLAT timestamp, payload | Never re-escaped after framing; timestamp is receiver-local and opaque to consumers |
| AVR | `*<hex>;` ASCII, 14 or 28 hex chars | Malformed hex is skipped, never repaired |
| JSON-lines | one object per line, `schema` + `version` + typed payload | Additive fields only within a major version; consumers ignore unknown keys |
| gRPC | protobuf `AerofoilService` streams | Enum values are append-only; field numbers are never reused |
| MCP | JSON-RPC 2.0 over stdio, tools `get_airspace_summary`, `get_track`, `find_closest` | stdout carries protocol frames only; all logging goes to stderr |

- Every JSON object carries `{"schema": "aerofoil.<record>", "version": <u32>}`. A breaking change
  to a record bumps `version`; an additive change does not.
- No wire format carries NaN, infinity or `-0.0`: absent numeric fields are omitted, never encoded
  as sentinel values.

---

## 6. Cross-Cutting Invariants

- **Determinism:** identical bytes in, identical output out, on every target. No wall-clock, RNG or
  environment lookup may influence a decoded value; timestamps come from the caller.
- **No silent repair:** a frame is either decoded as specified, corrected within a stated bound, or
  rejected with a typed error. Clamping into a plausible range is forbidden.
- **Observable counts:** every rejection path increments a counter that surfaces in telemetry, so a
  decoder that quietly drops half a feed cannot look healthy.
- **Version coupling:** the workspace version is a single value (lockstep SemVer); a wire-breaking
  change is a `BREAKING CHANGE` commit and a major (pre-1.0: minor) bump, never a patch.
