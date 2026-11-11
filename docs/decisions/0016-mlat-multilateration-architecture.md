---
status: accepted
date: 2026-11-10
---

# 16. Multilateration (MLAT) Dual-Topology Architecture and TDOA Hyperboloid Solver

* Deciders: Colin Wolff
* Related: `ADR-0001`, `ADR-0005`, `ADR-0006`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `storypole` AF-56, AF-57, AF-58

## Context and Problem Statement

Many Mode S aircraft transmit surveillance replies (DF0, DF4, DF5, DF11, DF20, DF21) that lack GNSS
position data (which is only present in ADS-B DF17/DF18). To achieve comprehensive airspace
awareness for non-ADS-B traffic, surveillance networks employ Multilateration (MLAT) via Time
Difference of Arrival (TDOA). Multiple time-synchronized receivers with known geodetic coordinates
measure the arrival time of an identical transmission, yielding hyperbolic isochrones whose 3D
intersection pinpoints the aircraft's position.

Aerofoil requires a native, high-assurance MLAT capability that integrates into the existing
zero-allocation pipeline and streaming server without breaking crate modularity or performance.

## Considered Options

1. **Dual-Topology: Native In-Tree Solver (`aerofoil-mlat`) + Outbound Feeder Protocol (Chosen):**
   - Provide a dedicated `crates/mlat` crate containing the geodetic receiver registry, clock drift
     synchronization algorithms, and an algebraic Bancroft seed / non-linear least squares (Levenberg-Marquardt)
     TDOA solver.
   - Implement an outbound MLAT client transport module enabling feeders to stream high-precision
     Beast frames (`0x1A 0x32`/`0x33`) to external community networks (`mlat-server`) and ingest solutions back.
2. **External Feeder Proxy Only:** Rely entirely on external Python/C daemon (`mlat-client`), streaming
   positions back via Beast or AVR TCP.
   - *Rejected:* Prevents standalone airfields, private UAS/drone corridors, and air traffic research
     clusters from running autonomous local MLAT networks without external dependencies.
3. **Monolithic Server Integration:** Embed MLAT solving logic directly in `aerofoil-server`.
   - *Rejected:* Violates crate layering (`ARCHITECTURE.md` §2.1); domain mathematical algorithms
     must reside in library crates, keeping `server` as transport only.

## Decision Outcome

Chosen option: **Dual-Topology Architecture with Dedicated Domain Crate (`crates/mlat`)**.

### Positive Consequences

- High precision: Bancroft closed-form seed followed by iterative WGS84 ellipsoid geodetic optimization.
- Zero-copy pipeline: Timestamped Beast frames pass directly from ingest into the MLAT receiver buffer.
- Interoperability: Native feeder client compatibility with standard community `mlat-server` protocols.
- Track integration: MLAT solutions ingest cleanly into `aerofoil-tracker` under `ReceptionSource::Mlat`,
  surfacing distinct MLAT badges in web radar and TUI without polluting direct ADS-B state.
