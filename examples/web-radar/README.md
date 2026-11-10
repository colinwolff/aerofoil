# aerofoil Web Radar

Live browser PPI airspace radar and telemetry dashboard for `aerofoil-server`.

Built with TypeScript, Vite, and Leaflet, consuming `@aerofoil/sdk`.

## Quickstart

### 1. Start `aerofoil-server`

Ensure the backend server is running and broadcasting WebSocket target telemetry:

```bash
cargo run -p aerofoil-server -- --port-1090 30005 --port-978 30978 --port-egress 3000
```

### 2. Launch Web Radar

Install dependencies and start the Vite dev server:

```bash
cd examples/web-radar
bun install
bun run dev
```

Open `http://localhost:5173` in your browser.

## Map Tiles & API Keys

Web Radar works **out-of-the-box with zero API keys**.

- **Default:** Uses [OpenStreetMap](https://www.openstreetmap.org/) tiles with a dark radar CSS inversion filter. No account, registration, or API key is required.
- **Custom Tile Provider:** Provide a custom tile URL template via URL query parameter:
  ```
  http://localhost:5173/?tiles=https://{s}.tile.example.com/{z}/{x}/{y}.png
  ```
- **CARTO Dark Matter (Optional):** If you have a CARTO API key, pass it via:
  ```
  http://localhost:5173/?carto_key=YOUR_CARTO_API_KEY
  ```
- **Custom Server Port/Host:** Connect to a non-default `aerofoil-server` instance via:
  ```
  http://localhost:5173/?server=ws://127.0.0.1:3000
  ```

## Features

- **Live Airspace PPI:** Renders aircraft positions with heading-aligned SVG blips.
- **Auto-Detect Egress:** Connects to `aerofoil-server` over WebSocket and updates state at 10 Hz.
- **Emergency Squawk Alerts:** Highlights aircraft squawking 7500 (hijack), 7600 (radio failure), or 7700 (general emergency) with glowing red indicators and table row highlights.
- **Dual-Band Telemetry:** Displays both 1090ES and 978 UAT target data.
