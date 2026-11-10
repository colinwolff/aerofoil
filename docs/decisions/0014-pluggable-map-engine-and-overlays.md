---
status: accepted
date: 2026-11-10
---

# 14. Pluggable AirspaceMapEngine, 12-Class SVG Icon Matrix, and Map Overlay Architecture

* Deciders: Colin Wolff
* Related: `ADR-0012`, `ADR-0013`, `docs/ARCHITECTURE.md`, `storypole` AF-54

## Context and Problem Statement

To deliver a best-in-class airspace surveillance frontend that matches or exceeds commercial tracking
platforms (e.g. FlightAware, Flightradar24) while remaining commercially permissive (MIT/Apache-2.0)
and legally compliant, `apps/web` requires an architectural foundation for vehicle iconography, map
rendering, and multi-source geospatial overlays.

Key constraints and requirements:
1. **Iconography Quality:** Generic chevron triangles are insufficient for situational awareness. The
   application must render distinct, high-fidelity silhouettes for varied airframe types (widebody,
   narrowbody, turboprop, fighter, rotorcraft, drone, ground vehicle) with dynamic altitude coloring,
   smooth heading interpolation, and emergency beaconing.
2. **Rendering Performance & Pluggability:** Real-time surveillance tracking 500+ targets alongside
   complex airspace boundaries requires 60 FPS performance without UI jank.
3. **Legal, Licensing & Tile Usage Governance:**
   - No raw raster or vector tile caches committed to git.
   - No unauthenticated or bulk scraping of standard OpenStreetMap tile servers (`tile.openstreetmap.org`).
   - No CC BY-NC-SA data (e.g. OpenAIP) bundled into core.
   - Official US FAA data (17 U.S.C. § 105) is US Public Domain and can be safely extracted, simplified,
     and bundled as TopoJSON.
   - Algorithmic vector elements (range rings, compass azimuths) must be computed in code, not bundled.
   - Dynamic attribution and provider compliance must be enforced in the UI.

## Considered Options

1. **Monolithic Leaflet-only 2D DOM Rendering with Generic Markers:**
   - Rely solely on SVG path chevrons and standard Leaflet 2D DOM markers.
   - *Rejected:* Insufficient visual distinction between aircraft classes; 2D DOM markers experience
     framerate drops when rendering hundreds of moving targets alongside complex airspace polygon sets.
2. **Proprietary Iconography and Hardcoded Third-Party Endpoints:**
   - Scrape commercial icon sets and hardcode unauthenticated public map tiles.
   - *Rejected:* Violates intellectual property boundaries, open-source licensing covenants, and tile
     terms of service.
3. **Pluggable `AirspaceMapEngine`, Clean-Room 12-Class SVG Icon Matrix, and Strict Legal Pipeline** (Chosen):
   - Design a vendor-agnostic `AirspaceMapEngine` interface supporting both Leaflet 2.0 (broad compatibility)
     and MapLibre GL (hardware-accelerated WebGL vector rendering).
   - Author a clean-room, custom MIT/Apache-2.0 permissive SVG icon matrix covering 12 airframe categories.
   - Bundle official FAA public-domain airspace boundaries simplified into TopoJSON.
   - Compute range rings and radial azimuths dynamically via geodesic mathematics.
   - Integrate RainViewer NEXRAD weather radar with an interactive timeline scrubber dock.
   - Provide an extensible `AttributionControl` and dual-access "Data Sources & Legal Notices" modal.

## Decision Outcome

Chosen option: **Pluggable `AirspaceMapEngine` with Clean-Room 12-Class SVG Icon Matrix and Strict Legal Pipeline**.

### Key Components:
1. **12-Class Permissive SVG Icon Matrix (`apps/web/src/icons/`):**
   - Clean-room vector assets: Light Piston, Twin Turboprop, Regional Jet, Narrowbody, Widebody,
     Super Jumbo, Fighter, Rotorcraft, Glider, Drone, Ground Vehicle, Unknown.
   - Real-time altitude-bracketed color gradients, smooth dead-reckoned heading interpolation, and
     squawk 7500/7600/7700 emergency pulsation.
2. **Pluggable `AirspaceMapEngine` (`apps/web/src/layers/AirspaceMapEngine.ts`):**
   - Common abstraction for viewport management, tile layers, aircraft markers, and vector polygons.
   - Engine implementations for Leaflet 2.0 (DOM/Canvas) and MapLibre GL (GPU/WebGL), switchable via
     `map-config.json`.
3. **Geospatial & Weather Overlays:**
   - `public/layers/`: Simplified TopoJSON for US Class B, C, D airspace and Special Use Airspace.
   - `DynamicRingsLayer.ts`: In-browser Haversine/Vincenty polar range rings (10, 25, 50, 100 nm) and
     azimuth lines.
   - `WeatherRadarLayer.ts`: Live RainViewer NEXRAD precipitation tiles with timeline playback scrubber.
4. **Legal Compliance & Configuration:**
   - Dynamic `AttributionControl` updating active layer credits in real time.
   - Modal dialog listing data sources, copyrights, and operator terms.
   - `map-config.json` supporting custom operator GeoServer, Mapbox, or local tile cache endpoints.

### Positive Consequences
* Completely unencumbered, commercially permissive open-source codebase.
* Visual presentation and situational awareness equal to or exceeding commercial flight tracking applications.
* Flexible deployment: operates seamlessly on constrained devices (Leaflet 2D) and high-end workstations (MapLibre WebGL).
