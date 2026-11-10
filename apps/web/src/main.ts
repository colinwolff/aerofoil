import { AerofoilClient, type TargetWire } from "@aerofoil/sdk";
import { LeafletMap, TileLayer } from "leaflet";
import "leaflet/dist/leaflet.css";
import { AirspaceRadarManager } from "./radar";

function initApp(): void {
  const mapElement = document.getElementById("map");
  let radarManager: AirspaceRadarManager;

  if (mapElement) {
    const params = new URLSearchParams(window.location.search);
    const cartoKey = params.get("carto_key");
    const customTiles = params.get("tiles");

    const map = new LeafletMap("map", {
      center: [52.3676, 4.9041], // Default: Amsterdam FIR
      zoom: 8,
      zoomControl: true,
    });

    let tileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    let attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

    if (customTiles) {
      tileUrl = customTiles;
      attribution = "Custom Tiles";
    } else if (cartoKey) {
      tileUrl = `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${encodeURIComponent(cartoKey)}`;
      attribution = '&copy; <a href="https://carto.com/">CARTO</a>';
    } else {
      // Default: OpenStreetMap with dark radar CSS filter applied (zero API key required)
      mapElement.classList.add("dark-tiles");
    }

    new TileLayer(tileUrl, {
      attribution,
      maxZoom: 19,
    }).addTo(map);

    radarManager = new AirspaceRadarManager(map);
  } else {
    radarManager = new AirspaceRadarManager(null);
  }

  const params = new URLSearchParams(window.location.search);
  const customServer = params.get("server");
  const serverUrl = customServer
    ? customServer
    : window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1")
      ? "ws://127.0.0.1:3000"
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

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
}
