//! Main application entrypoint for aerofoil web radar.

import { AerofoilClient, type TargetWire } from "@aerofoil/sdk";
import "leaflet/dist/leaflet.css";

import { LeafletMapEngine } from "./layers/LeafletMapEngine";
import { BaseMapManager } from "./layers/BaseMapRegistry";
import { DynamicRingsLayer } from "./layers/DynamicRingsLayer";
import { VectorOverlayManager } from "./layers/VectorOverlayManager";
import { WeatherRadarLayer } from "./layers/WeatherRadarLayer";
import { AttributionControl } from "./layers/AttributionControl";
import { LegalModal } from "./components/LegalModal";
import { WeatherScrubber } from "./components/WeatherScrubber";
import { LayerDrawer } from "./components/LayerDrawer";
import { AirspaceRadarManager } from "./radar";

async function initApp(): Promise<void> {
  const mapElement = document.getElementById("map");
  let radarManager: AirspaceRadarManager;

  if (mapElement) {
    const params = new URLSearchParams(window.location.search);
    const cartoKey = params.get("carto_key");
    const customTiles = params.get("tiles");

    // Default receiver coordinates: Amsterdam Schiphol hub (52.3676°N, 4.9041°E)
    const centerLat = 52.3676;
    const centerLon = 4.9041;

    // 1. Initialize Pluggable Map Engine (Leaflet 2.0)
    const engine = new LeafletMapEngine();
    engine.init("map", centerLat, centerLon, 8);

    // 2. Attribution & Legal Notices
    const legalModal = new LegalModal();
    legalModal.init();

    const attributionCtrl = new AttributionControl("attribution-container");
    attributionCtrl.setOpenModalHandler(() => legalModal.show());

    // 3. Basemap Management
    const basemapMgr = new BaseMapManager();
    let initialBasemap = basemapMgr.getActiveBasemap();

    if (customTiles) {
      engine.setBaseTileLayer("custom", customTiles, "Custom Tiles", { maxZoom: 19 });
      attributionCtrl.register({
        id: "basemap",
        name: "Custom Tiles",
        html: "Custom Tiles",
        license: "Custom Operator License",
      });
    } else if (cartoKey) {
      const def = basemapMgr.setBasemap("carto_dark");
      const url = `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${encodeURIComponent(cartoKey)}`;
      engine.setBaseTileLayer("carto_dark", url, def.attribution, { maxZoom: 19, subdomains: "abcd" });
      attributionCtrl.register({
        id: "basemap",
        name: def.name,
        html: def.attribution,
        license: def.license,
      });
    } else {
      mapElement.classList.add("dark-tiles");
      engine.setBaseTileLayer(initialBasemap.id, initialBasemap.url, initialBasemap.attribution, {
        maxZoom: initialBasemap.maxZoom,
      });
      attributionCtrl.register({
        id: "basemap",
        name: initialBasemap.name,
        html: initialBasemap.attribution,
        license: initialBasemap.license,
      });
    }

    // 4. Geodesic Polar Range Rings & Radial Azimuths
    const ringsLayer = new DynamicRingsLayer(engine, centerLat, centerLon);
    ringsLayer.render();

    // 5. Vector Overlays (TopoJSON Airspace & FIR Boundaries)
    const vectorMgr = new VectorOverlayManager(engine);
    // Asynchronously load initial airspace layers
    vectorMgr.loadLayer("us_classes", "/layers/airspace_us_classes.topojson", "airspaces", VectorOverlayManager.classAirspaceStyle);
    vectorMgr.loadLayer("special_use", "/layers/special_use_airspace.topojson", "special_use", VectorOverlayManager.specialUseStyle);
    vectorMgr.loadLayer("fir", "/layers/fir_boundaries.topojson", "fir_boundaries", VectorOverlayManager.firStyle);

    attributionCtrl.register({
      id: "airspace",
      name: "FAA Airspace Boundaries",
      html: 'Airspace: FAA AeroNav (17 U.S.C. § 105)',
      license: "US Public Domain",
    });

    // 6. Live NEXRAD Weather Radar (RainViewer)
    const weatherLayer = new WeatherRadarLayer(engine);
    weatherLayer.init();

    const scrubber = new WeatherScrubber(weatherLayer);
    scrubber.init("weather-scrubber-dock");

    // 7. Floating Glassmorphism Layer Drawer HUD
    const drawer = new LayerDrawer(
      engine,
      basemapMgr,
      ringsLayer,
      vectorMgr,
      weatherLayer,
      scrubber,
      legalModal,
      attributionCtrl,
    );
    drawer.init("layer-drawer-container");

    radarManager = new AirspaceRadarManager(engine);
  } else {
    radarManager = new AirspaceRadarManager(null);
  }

  // 8. Stream Ingestion via @aerofoil/sdk
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
