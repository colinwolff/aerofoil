---
status: accepted
date: 2026-11-11
---

# 19. Clean-Room tar1090 Feature Parity, Avionics Telemetry Inspector, and 3D Spatial Airspaces

* Deciders: Colin Wolff
* Related: `ADR-0012`, `ADR-0013`, `ADR-0014`, `ADR-0015`, `ADR-0017`, `ADR-0018`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`

## Context and Problem Statement

`tar1090` (by wiedehopf) is the de facto benchmark interface for ADS-B hobbyists and ADS-B exchange
networks. It provides high-utility features including comprehensive aircraft inspector panels,
configurable callsign/altitude labels on markers, multiselect track history, deep URL query
parameters, and regex/altitude filtering.

However, `tar1090` is licensed under the **GNU General Public License v2.0 or later (GPL-2.0-or-later)**,
whereas `aerofoil` is permissively dual-licensed under **Apache-2.0 OR MIT**. To preserve `aerofoil`'s
licensing integrity, zero code, HTML, CSS, or bundled assets may be copied or vendored from `tar1090`.

Furthermore, `tar1090` is strictly a 2D Leaflet application. `aerofoil`'s dual-engine architecture
(Leaflet 2.0 in 2D and MapLibre GL in 3D) creates an opportunity not only to achieve clean-room parity
with `tar1090`'s 2D capabilities, but to elevate them into first-class spatial 3D concepts.

## Considered Options

### Legal and Licensing Strategy:
1. **Clean-Room Specification & Independent Implementation (Chosen):**
   - Treat `tar1090` purely as an external functional reference under 17 U.S.C. § 102(b) (functional
     concepts, user workflows, and mathematical specifications are uncopyrightable).
   - Implement all capabilities from scratch in TypeScript using `aerofoil`'s existing modern stack
     (Vite, Tailwind CSS, typed `@aerofoil-rs/sdk`, MapLibre GL, and Leaflet).
   - Guarantee zero GPL-2.0 code contamination in `aerofoil`.
2. **Vendoring or Porting tar1090 Source Files:** Violates `aerofoil`'s Apache-2.0/MIT license and
   forces the entire repository under copyleft GPL obligations. Unacceptable.

### Feature Translation to 3D:
1. **Spatial 3D Elevation of 2D Features (Chosen):**
   - *Aircraft Inspector:* Glassmorphic HUD telemetry card with live climb/descent sparklines.
   - *Map Labels:* LOD-aware billboard badges beside aircraft icons in both 2D and 3D.
   - *3D Aircraft Models:* Replace flat 2D sprite/DOM icons with instanced low-poly 3D models (Jet, Heavy,
     Turboprop, Helicopter, Light GA) dynamically oriented in WebGL by true heading, climb/pitch, and
     roll angle, preventing icon distortion at oblique 3D viewing angles ($60^\circ$–$85^\circ$).
   - *3D Extruded Airspace:* Render Class B/C/D and SUA airspace polygons as semi-transparent 3D
     polygonal columns matching their aeronautical floor and ceiling altitudes (MSL).
   - *Chase Cam:* 3D camera follow mode smoothly tracking selected aircraft from behind.
   - *3D Radio Horizon:* Represent receiver line-of-sight elevation masks as an inverted 3D cone.
2. **2D-Only Feature Implementation:** Keep new features confined to the 2D Leaflet canvas, leaving the
   3D viewport disjointed from tactical radar telemetry.

## Decision Outcome

Chosen Option: **Clean-Room Specification & Independent Implementation** paired with **Spatial 3D
Elevation of 2D Features**.

### Consequences

* **Positive:**
  - Preserves Apache-2.0 / MIT licensing without copyleft risk.
  - Matches the full operational utility of `tar1090` for operators migrating from dump1090/readsb.
  - Establishes a unique, best-in-class 3D airspace visualization unavailable in any existing open-source
    ADS-B web client.
* **Negative:**
  - Requires writing and maintaining custom UI components and shaders rather than reusing existing web
    scripts.
