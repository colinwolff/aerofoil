---
status: accepted
date: 2026-11-10
---

# 15. Multi-Tier Configuration Architecture and Avionics Glass-Cockpit Design System

* Deciders: Colin Wolff
* Related: `ADR-0012`, `ADR-0013`, `ADR-0014`, `docs/ARCHITECTURE.md`, `docs/COMPARISON.md`, `apps/web/DESIGN.md`, `storypole` AF-55

## Context and Problem Statement

Operators deploying `aerofoil` across diverse environments (bare-metal Raspberry Pis, multi-node
Docker Compose setups, Kubernetes clusters, and standalone web radar clients) need a robust,
predictable configuration mechanism. Previously, web radar configuration relied exclusively on URL
query parameters (`?carto_key=...`, `?tiles=...`), which was cumbersome and lacked operator
persistence. Furthermore, the web radar interface required fine-grained design harmonization,
including an avionics glass-cockpit theme, collapsible telemetry sidebar, restored glassmorphic modals,
and competitive parity against legacy tools (`tar1090`, `SkyAware`).

## Considered Options

### Configuration Hierarchy:
1. **3-Tier Precedence (Chosen):**
   - **Tier 1 (Server/Container Environment):** Injected via environment variables in Docker/K8s
     (`AEROFOIL_RECEIVER_LAT`, `AEROFOIL_CARTO_KEY`, etc.).
   - **Tier 2 (Server REST API):** `aerofoil-server` exposes `GET /api/config`, returning the
     resolved configuration payload as JSON.
   - **Tier 3 (Client Operator Overrides):** In-browser `localStorage` overrides set via the
     `MapConfigModal` settings UI, with an explicit "Reset to Server Defaults" capability.
2. **2-Tier Server-Driven Only:** Server configuration is strictly immutable in the browser.
3. **Client-Only:** Browser configuration decoupled entirely from server daemon environment.

### Design System & Layout:
1. **Avionics Glass-Cockpit (Chosen):**
   - High-contrast OLED/dark theme (`#06090e`) with high-contrast radar cyan and altitude gradients.
   - Fixed 44px top navbar with live UTC clock, status badges, and quick-action tool buttons.
   - Interactive draggable and collapsible telemetry sidebar with persistent width in `localStorage`.
   - Polished glassmorphic modals for map settings and legal disclosures.
2. **Floating Pill HUD:** Full-bleed map with translucent floating pills and overlay sidebars.

## Decision Outcome

Chosen option: **3-Tier Precedence Configuration with Avionics Glass-Cockpit Design System**.

### Positive Consequences

- Seamless deployment across Docker and Kubernetes: operators can inject keys and receiver
  coordinates via standard container environment variables without rebuilding the web bundle.
- In-app operator agility: users can fine-tune receiver coordinates, basemap keys, and units in the
  browser, while retaining the ability to reset to container defaults at any time.
- Crisp, ergonomic UI: eliminates layout ambiguity, fixes HUD drawer z-indexing, provides full
  sidebar collapsibility, and establishes a documented design system in `apps/web/DESIGN.md`.
- Legal transparency: cleanly segregated footer legal disclosure and restored modal cards.
