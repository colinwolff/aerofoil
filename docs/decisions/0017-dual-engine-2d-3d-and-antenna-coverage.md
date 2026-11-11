---
status: accepted
date: 2026-11-10
---

# 17. Dual-Engine 2D/3D Map Viewport, Layer Stacking Panes, and Antenna Coverage Heuristics

* Deciders: Colin Wolff
* Related: `ADR-0012`, `ADR-0013`, `ADR-0014`, `ADR-0015`, `ADR-0016`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `storypole` AF-59, AF-60, AF-61, AF-62

## Context and Problem Statement

`aerofoil`'s web radar requires both lightweight, highly compatible 2D tactical charting (Leaflet 2.0)
and hardware-accelerated 3D globe visualization (MapLibre GL). In early prototypes, raster chart
overlays suffered from z-index collision and disappeared when zoomed past native raster resolutions
due to missing `maxNativeZoom` configuration. Furthermore, operators require:
1. Seamless runtime switching between 2D and 3D viewports without losing active target tracks.
2. 3D flight trajectories color-coded by vertical climb rate (> +250 fpm green, < -250 fpm red, cyan level).
3. Configurable distance rings with zoom-aware presets and adjustable azimuth radial ticks.
4. Empirical antenna reception range contours, RSSI signal strength heatmaps, and line-of-sight elevation masks.

## Considered Options

### Map Engine Architecture:
1. **Unified `AirspaceMapEngine` Interface with Dual-Engine Runtime Toggle (Chosen):**
   - Provide both `LeafletMapEngine` (2D DOM/Canvas with explicit custom panes) and
     `MapLibreMapEngine` (3D WebGL with pitch up to 85° and terrain draping).
   - Top navbar `2D / 3D` toggle preserves camera center and zoom during transitions.
2. **Permanent Leaflet-Only Engine:** Limited to 2D flat projections; no vertical flight profiles.
3. **Permanent MapLibre-Only Engine:** Excludes low-power embedded browsers or software WebGL environments.

### 3D Terrain DEM Elevation:
1. **Multi-Tier Terrain Hierarchy (Chosen):**
   - Default: Public domain AWS Terrarium DEM (unauthenticated, global coverage).
   - Performance: Flat 3D Orbit mode (zero elevation tile requests).
   - High-Resolution: Custom Terrain-RGB / MapTiler endpoint via Settings modal.

### Stacking and Panes (Leaflet):
1. **Explicit Panes Hierarchy (Chosen):**
   - `basemapPane` (z-200), `chartsPane` (z-250), `weatherPane` (z-300), `airspacePane` (z-350),
     `antennaPane` (z-400), `markerPane` (z-600).
   - `maxNativeZoom` set to 12 (VFR) and 11 (IFR Low) with `maxZoom: 19` for client-side tile upscaling.

### Antenna Coverage Heuristic:
1. **Hybrid Polar Contour & Signal Heatmap (Chosen):**
   - Accumulate empirical max distance per 1° azimuth bin based on received message RSSI.
   - Render multi-altitude line-of-sight horizon contours (10k, 20k, 30k ft).

## Decision Outcome

Chosen option: **Dual-Engine Architecture with Explicit Panes and Hybrid Antenna Heatmaps**.
