# Why Aerofoil? — Competitive Benchmark & Architecture Comparison

Surveillance architectures have long relied on aging C/C++ codebases (`dump1090`, `readsb`, `dump978`) and legacy web frontends (`tar1090`, `SkyAware`) built on 2010-era jQuery and OpenLayers. `aerofoil` is a modern, high-assurance surveillance suite written in Rust (Edition 2024, MSRV 1.99) designed for deterministic memory safety, zero-allocation decode hot paths, and modern web standards.

---

## 1. At a Glance: Aerofoil vs. Industry Standards

| Capability | Aerofoil Suite | readsb / dump1090-fa | dump978-fa | Virtual Radar Server |
| :--- | :--- | :--- | :--- | :--- |
| **Language & Safety** | **Rust 2024 (MSRV 1.99)** | C99/C11 (manual pointers) | C++11 | C# (.NET Framework / Mono) |
| **Dual-Band Ingest** | **Native Unified Ingest** (1090 + 978) | 1090 only (requires proxy) | 978 only | External multi-receiver proxy |
| **Cross-Band ADS-R Dedup**| **Spatial-Temporal Window (2.5s, 0.5nm)**| External / downstream | None | Heuristic merge |
| **Forward Error Correction**| **CRC-24 + RS(48,34) & RS(92,72)** | Single-bit CRC-24 only | RS(48,34) only | None |
| **SIMD Acceleration** | **Runtime CLMUL CRC-24** | Soft table lookup | Soft table lookup | None |
| **Zero-Allocation Core** | **Strict `no_std` hot paths** | Heap allocs on track states | Heap allocs | High GC churn |
| **Streaming Egress** | **Beast, AVR, JSON-L, SSE, WebSocket**| Beast, AVR, 1s JSON polling | Raw UAT frames | JSON polling |
| **Agentic AI Surface** | **Native MCP Server (`aerofoil-mcp`)** | None | None | None |
| **Containerization** | **Distroless (<40MB total)** | Multi-GB Debian/Raspbian | Debian package | Mono heavy image |

---

## 2. Core Architectural Advantages

### 2.1 Native Dual-Band Fusion & ADS-R Deduplication
Traditional SDR setups require running separate instances of `dump1090` and `dump978`, piped into intermediary aggregators. `aerofoil` natively fuses 1090ES and 978 UAT into a single sharded, lock-free track table, resolving cross-band ADS-R rebroadcasts with bounded spatiotemporal windows.

### 2.2 Provable Zero Allocation & High-Assurance Decoders
Decoding high-rate ADS-B messages (up to 3,000 messages/second in busy hub airspace) must never trigger memory allocations or garbage collection pauses. Aerofoil decoders operate on fixed slices (`[u8; 14]` and `[u8; 48]`), verified by automated allocation-counting test harnesses.

### 2.3 Event-Driven Real-Time Egress
Rather than polling `/data/aircraft.json` every 1–2 seconds, `aerofoil-server` exposes event-driven Server-Sent Events (`/events`) and low-latency WebSockets (`/ws`), streaming live target states instantly to connected displays.

---

## 3. Web Radar Frontend Comparison

| Feature Area | Aerofoil Web Radar | `tar1090` (Wiedehopf) | FlightAware SkyAware | Flightradar24 (Web) |
| :--- | :--- | :--- | :--- | :--- |
| **UI Framework** | **Vite 8, TypeScript 7, Tailwind** | Vanilla JS, jQuery, OpenLayers 3 | OpenLayers 3, legacy JS | Custom WebGL stack |
| **Map Engine** | **Pluggable Leaflet 2 / MapLibre**| OpenLayers 3 | OpenLayers 3 | Proprietary WebGL |
| **Data Ingestion** | **Real-Time WebSocket & SSE** | Polling `history.json` (1-2s delay)| Polling `data/aircraft.json` | Proprietary WebSocket |
| **Aircraft Icons** | **12-Class SVG Vector Matrix** | Fixed bitmap / basic SVGs | Generic chevron | 2D/3D silhouettes |
| **Emergency Squawks**| **Pulsing Cyan/Red Glow & Alert** | Text border in table | Text highlight | Notification popup |
| **Airspace Overlays** | **FAA Class B/C/D, SUA, FIR TopoJSON**| Manual GeoJSON plugin | Basic US airspace | Commercial airspaces |
| **Aeronautical Charts**| **FAA VFR Sectionals & IFR Low** | OpenAIP (CC BY-NC), local tiles | VFR Sectional (logged-in only)| Proprietary styled |
| **Weather Radar** | **Live NEXRAD (RainViewer) + Scrubber**| Nexrad WMS (static US only) | Live weather (Enterprise) | Live precipitation |
| **Range Rings** | **Parametric Geodesic + Azimuths** | Static distance rings | Concentric rings | Premium feature |
| **Configuration** | **3-Tier (ENV -> Server API -> UI)** | URL params & `config.js` | Web config page | User account |
| **Attribution** | **Dynamic Footer & Compliance Modal** | Static notice | Proprietary notice | Proprietary notice |

---

## 4. Legal, Permissive & Commercially Clean
Unlike platforms that embed non-commercial or copyleft geospatial data (such as OpenAIP CC BY-NC-SA 4.0 or un-isolated ODbL extracts), `aerofoil` is strictly MIT / Apache-2.0 licensed:
- Airspace boundaries are generated from US Government public domain sources (17 U.S.C. § 105).
- Official FAA chart tiles connect directly to federal ArcGIS REST endpoints with automatic failover.
- Algorithmic vector layers (range rings, azimuths) are calculated parametrically in code.
