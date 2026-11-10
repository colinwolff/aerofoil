import { AerofoilClient, type TargetWire } from "@aerofoil/sdk";
import L from "leaflet";
import { AirspaceRadarManager } from "./radar";

function initApp(): void {
  const mapElement = document.getElementById("map");
  let radarManager: AirspaceRadarManager;

  if (mapElement && typeof L !== "undefined") {
    const map = L.map("map", {
      center: [52.3676, 4.9041], // Default: Amsterdam FIR
      zoom: 8,
      zoomControl: true,
    });

    // Dark matter CartoDB basemap
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
        subdomains: "abcd",
      },
    ).addTo(map);

    radarManager = new AirspaceRadarManager(map, L);
  } else {
    radarManager = new AirspaceRadarManager(null, null);
  }

  const serverUrl = window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1")
    ? "ws://127.0.0.1:8080"
    : window.location.origin;

  const client = new AerofoilClient({ url: serverUrl });
  const statusEl = document.getElementById("connection-status");

  const setStatus = (status: "connected" | "connecting") => {
    if (statusEl) {
      statusEl.className = `status-badge ${status}`;
      statusEl.textContent = status === "connected" ? "Streaming" : "Connecting...";
    }
  };

  setStatus("connecting");

  // Subscribe to live WebSocket streaming
  client.subscribeWebSocket((target: TargetWire) => {
    setStatus("connected");
    radarManager.updateTarget(target);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
