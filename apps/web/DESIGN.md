# Aerofoil Web Radar Design System (`DESIGN.md`)

Design specifications, design tokens, typography, and component patterns for `@aerofoil-rs/web-radar`.

---

## 1. Design Philosophy: Avionics Glass Cockpit

The web radar UI follows real-world primary flight displays (PFDs) and air traffic management workstations:
1. **High Contrast, Low Fatigue:** Pitch-black background (`#06090e`) with high-contrast radar cyan and altitude-bracketed color gradients for instant situational awareness.
2. **Tabular Monospace Precision:** All numerical telemetry (altitudes, speeds, headings, squawks, timestamps) use tabular numbers (`tabular-nums`) to prevent optical jitter during 60 FPS track updates.
3. **Glassmorphism HUD Overlays:** Layer controls and playback docks float over the tactical map using subtle backdrop blur (`backdrop-filter: blur(12px)`), keeping maximum map area visible.
4. **Zero Unnecessary Chrome:** Navigation controls are concise, actionable, and state-aware; secondary information (legal licenses) is tucked cleanly into footers and modals.

---

## 2. Color Palette & Design Tokens

| Token | CSS Variable / Class | Value | Purpose |
| :--- | :--- | :--- | :--- |
| **Canvas Dark** | `var(--bg-dark)` | `#0a0e14` | Primary viewport and map canvas backing |
| **Panel Surface**| `var(--bg-panel)` | `#111822` | Header, sidebar, and table background |
| **Glass Overlay**| `var(--bg-glass)` | `rgba(17, 24, 34, 0.85)` | Floating HUD drawers and playback dock |
| **Border Glass** | `var(--border-glass)` | `rgba(56, 189, 248, 0.2)` | Translucent borders on glass cards |
| **Border Base** | `var(--border-color)` | `#1e293b` | Structural dividers and table borders |
| **Radar Cyan** | `var(--radar-cyan)` | `#00d2ff` | Active tools, focus rings, selected tracks |
| **Radar Green** | `var(--radar-green)` | `#10b981` | Normal streaming status, live receiver feed |
| **Radar Amber** | `var(--radar-amber)` | `#f59e0b` | Transponder mode changes, caution states |
| **Emergency Red**| `var(--radar-emergency)`| `#ef4444` | Squawk 7500/7600/7700 alerts, pulsing glows |

### Light / Dark Theme Tokens
- **Dark Theme (`body.dark-theme` - default):** `#06090e` canvas, `#0e1520` panels, translucent dark glass overlays, inverted high-contrast OSM tile filter (`.dark-tiles`).
- **Light Theme (`body.light-theme`):** `#f1f5f9` canvas, `#ffffff` panels, `#cbd5e1` borders, `#0f172a` primary text, `#0284c7` cyan accents, natural unfiltered daylight map tiles.
- **Persistence:** Stored in `localStorage.aerofoil_theme`, respecting OS `prefers-color-scheme`. Toggled via top navbar `☼`/`☾` control.

### Altitude Gradient Scale
Aircraft altitude determines the icon and trail color:
- **Ground / Low (< 3,000 ft):** Amber / Rust (`#f97316`)
- **Terminal Area (3,000 – 10,000 ft):** Yellow-Green (`#84cc16`)
- **Low Enroute (10,000 – 25,000 ft):** Cyan / Sky (`#06b6d4`)
- **High Enroute (25,000 – 40,000 ft):** Blue (`#3b82f6`)
- **Upper Airspace (> 40,000 ft):** Violet / Magenta (`#a855f7`)

---

## 3. Typography & Numerical Layout

- **Interface Sans:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  - Used for titles, button labels, and section headings.
  - Weights: `500` (Medium) for buttons, `600` (Semi-bold) for card headers.
- **Telemetry Monospace:** `"JetBrains Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace`
  - Used for hex addresses (`4840e2`), callsigns (`KLM123`), altitudes, velocities, coordinates, and UTC timestamps.
  - All numeric cells use `font-variant-numeric: tabular-nums;`.

---

## 4. Layout Architecture

```
+-------------------------------------------------------------------------------+
| [AEROFOIL] Airspace Radar  | [⛯ Layers] [⛅ Weather] [⌖ Center ▾] [⚙ Settings] |
| Targets: 14 (Streaming)    |                                [18:24:02 UTC] [◨]|
+-------------------------------------------------------------+-----------------+
|                                                             | TELEMETRY TABLE |
| MAP VIEWPORT                                                |                 |
| - Leaflet 2.0 / MapLibre Engine                             | Address Callsign|
| - TopoJSON Airspace (Class B/C/D)                           | Altitude Speed  |
| - 12-Class SVG Aircraft Matrix                              | Heading Squawk  |
|                                                             |                 |
| [FLOATING HUD DRAWER]               [WEATHER SCRUBBER DOCK] |                 |
+-------------------------------------------------------------+-----------------+
| Footer: Data Sources & Legal Notices                                          |
+-------------------------------------------------------------------------------+
```

---

## 5. Component Standards

1. **Top Navbar (44px height):**
   - High-contrast, single-row layout with UTC clock, target counter, quick toolbar, and a toggle button to collapse/expand the sidebar.
2. **Draggable Sidebar Splitter (6px width):**
   - Hover highlights with cyan accent; mouse/touch drag adjusts table width (280px to 70vw). Double-click or button toggles collapse.
3. **Telemetry Table:**
   - Sticky header with subtle borders; row hovering highlights track on map; emergency rows pulse with red warning backlight.
4. **Modals (Settings & Legal):**
   - Centered glass cards (`rgba(17, 24, 34, 0.95)`) with rounded corners (`rounded-xl`), crisp close button (`×`), clear section grouping, and primary action buttons (`btn-primary`).
