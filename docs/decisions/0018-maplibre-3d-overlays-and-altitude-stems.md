---
status: accepted
date: 2026-11-10
---

# 18. MapLibre 3D Overlay Draping, Terrain Synchronization, and Aircraft Altitude Stems

* Deciders: Colin Wolff
* Related: `ADR-0012`, `ADR-0013`, `ADR-0014`, `ADR-0015`, `ADR-0017`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `storypole` AF-63, AF-64

## Context and Problem Statement

Following the introduction of the dual-engine 2D/3D map architecture in `ADR-0017`, the 3D MapLibre
viewport provided digital elevation model (DEM) terrain relief, camera pitch up to $85^\circ$, and
climb-profiled 3D flight ribbons. However, operational overlays (live RainViewer NEXRAD weather radar,
FAA VFR Sectionals, FAA IFR Enroute Low charts, OpenAIP airspace boundaries, polar distance rings,
and empirical antenna reception contours) were previously active only within the 2D Leaflet canvas.

Furthermore, viewing airborne targets at high camera pitch angles ($60^\circ$–$85^\circ$) across
undulating 3D mountainous terrain creates severe perspective ambiguity: operators cannot readily
distinguish whether an aircraft icon is near the camera at low altitude or distant at high flight
levels.

## Considered Options

### 3D Overlay Integration:
1. **Unified 3D Draping across DEM Terrain (Chosen):**
   - Automatically drape all raster layers (RainViewer NEXRAD weather with real-time opacity, FAA VFR
     Sectional, FAA IFR Low) across the 3D DEM mesh using MapLibre raster sources and layers.
   - Drape vector layers (polar distance rings, azimuth radials, antenna polar coverage contours,
     and theoretical 10k/20k/30k ft radio horizon rings) across terrain slopes using GeoJSON sources.
   - Synchronize toggle states and opacity between 2D and 3D views via the unified `LayerDrawer`.
2. **Flat Billboard Surface:** Hover overlays on an artificial 2D plane at sea level ($0\text{ m}$ MSL),
   causing visual clipping where mountain peaks intersect the plane.

### 3D Aircraft Altitude Perception:
1. **3D Vertical Altitude Stems with Ground Shadows (Chosen):**
   - Render a vertical drop line from each airborne aircraft's $[lon, lat, alt]$ coordinate down to
     its terrain surface projection $[lon, lat, 0]$.
   - Render a soft circular ground shadow at the terrain intersection point.
   - Instantly resolves perspective ambiguity at steep camera pitch angles, matching professional
     ATC radar and avionics flight displays.
2. **Floating Icons without Ground Projections:** Retain floating icons only, requiring operators to
   read numeric altitude text in telemetry popups to ascertain altitude.

## Decision Outcome

Chosen Option: **Unified 3D Draping across DEM Terrain** combined with **3D Vertical Altitude Stems
with Ground Shadows**.

### Positive Consequences
- **Complete Feature Parity:** Switching between 2D Leaflet and 3D MapLibre preserves all active
  overlays (weather, charts, rings, antenna coverage) seamlessly.
- **Topographic Realism:** Radar precipitation and sectional charts contour naturally over mountain
  passes and valleys in 3D.
- **Unambiguous Situational Awareness:** Altitude stems and ground shadows provide immediate visual
  depth perception during complex approaches and terrain clearance monitoring.
