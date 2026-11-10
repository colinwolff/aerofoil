---
status: accepted
date: 2026-11-10
---

# 12. Dual-mode terminal UI (`aerofoil-tui`) and hybrid Bun/embedded web radar architecture

* Deciders: Colin Wolff
* Related: `ADR-0006`, `ADR-0010`, `ADR-0011`, `docs/ARCHITECTURE.md` §4

## Context and Problem Statement

`aerofoil` offers two visualization surfaces: the terminal dashboard `aerofoil-tui` and the browser
map `examples/web-radar`. To maximize standalone utility and flexible deployment (from local dev to
headless Raspberry Pi, Docker containers, and Kubernetes with Akri leaf-device discovery), how should
these frontends ingest and be served?

## Considered Options

1. **Strictly coupled to `aerofoil-server`:** Both TUI and web radar only speak WebSocket to `aerofoil-server`.
   Rejected: destroys standalone utility; users running existing `dump1090` setups could not use `aerofoil-tui`.
2. **Dual-mode TUI and hybrid Bun/embedded Web Radar** (chosen):
   - `aerofoil-tui` operates in dual mode: default Beast TCP client connecting to standard stream ports
     (`30005`, `30978`), with an optional `--ws <url>` flag to consume `aerofoil-server` WebSocket egress.
   - `sdk/` and `examples/web-radar/` are developed using **Bun + Vite + Leaflet** for developer speed,
     while the production build bundle (`dist/`) can be embedded directly in `aerofoil-server` at `GET /`.
3. **External web server only (Nginx/Caddy):** Rejects embedded serving. Forces edge/Pi users to run
   a separate web server just to view the radar map.

## Decision Outcome

Chosen option: **Option 2 (Dual-mode TUI & hybrid Bun/embedded Web Radar)**.

### Operational Model:
1. **`aerofoil-tui`:**
   - Beast client by default (`127.0.0.1:30005` and `30978`), making it 100% interoperable with any
     ADS-B feeder (`readsb`, `dump1090`, `ultrafeeder`, or `aerofoil-server`).
   - Optional `--ws <url>` flag to connect to `aerofoil-server` WebSocket streaming.
2. **`sdk/` & `examples/web-radar`:**
   - Authored using Bun for fast TypeScript bundling.
   - Run via `bun dev` for rapid local styling.
   - Embedded serving in `aerofoil-server` allows single-binary deployment on Raspberry Pi or minimal
     Docker containers without external web server dependencies.

### Positive Consequences
* `aerofoil-tui` is useful on its own across the broader flight-tracking ecosystem.
* Edge deployments on single-board computers require only one static binary to provide streaming and web UI.
* Zero-dependency development experience powered by Bun.

### Negative Consequences
* `aerofoil-tui` must maintain two ingest paths (raw Beast framing and WebSocket JSON).
