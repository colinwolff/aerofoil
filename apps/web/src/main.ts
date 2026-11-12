//! Main application entrypoint for aerofoil web radar.

import { AerofoilClient, type TargetWire } from "@aerofoil-rs/sdk";
import "leaflet/dist/leaflet.css";

import { BaseMapManager } from "./layers/BaseMapRegistry";
import { DynamicRingsLayer } from "./layers/DynamicRingsLayer";
import { AntennaCoverageLayer } from "./layers/AntennaCoverageLayer";
import { VectorOverlayManager } from "./layers/VectorOverlayManager";
import { WeatherRadarLayer } from "./layers/WeatherRadarLayer";
import { AttributionControl } from "./layers/AttributionControl";
import { LegalModal } from "./components/LegalModal";
import { WeatherScrubber } from "./components/WeatherScrubber";
import { LayerDrawer } from "./components/LayerDrawer";
import { MapConfigModal } from "./components/MapConfigModal";
import { SidebarSplitter } from "./components/SidebarSplitter";
import { EngineToggleManager } from "./components/EngineToggleManager";
import { ThemeManager } from "./components/ThemeManager";
import { AircraftInspector } from "./components/AircraftInspector";
import { AirspaceFilterBar } from "./components/AirspaceFilterBar";
import { UrlStateManager } from "./components/UrlStateManager";
import { applyBasemap, bindToolbar } from "./components/ToolbarBinder";
import { AirspaceRadarManager } from "./radar";

async function initApp(): Promise<void> {
  const mapElement = document.getElementById("map");
  let radarManager: AirspaceRadarManager;

  new ThemeManager().init();
  const splitter = new SidebarSplitter();
  splitter.init();

  const configModal = new MapConfigModal();
  configModal.init();

  const serverUrl = resolveServerUrl();
  await configModal.loadServerDefaults(serverUrl);
  const config = configModal.getConfig();

  startUtcClock();

  if (mapElement) {
    radarManager = new AirspaceRadarManager(null);
    const legalModal = new LegalModal();
    legalModal.init();

    const attributionCtrl = new AttributionControl("attribution-container");
    attributionCtrl.setOpenModalHandler(() => legalModal.show());

    const basemapMgr = new BaseMapManager();
    const toggleMgr = new EngineToggleManager(radarManager, basemapMgr, attributionCtrl, config);
    const engine = toggleMgr.init(config.receiverLat, config.receiverLon, 8);
    radarManager.setEngine(engine);

    applyBasemap(engine, basemapMgr, attributionCtrl, config);

    const ringsLayer = new DynamicRingsLayer(engine, config.receiverLat, config.receiverLon);
    ringsLayer.render();

    const vectorMgr = new VectorOverlayManager(engine);
    if (config.airspaceEnabled) {
      vectorMgr.loadLayer("us_classes", "/layers/airspace_us_classes.topojson", "airspaces", VectorOverlayManager.classAirspaceStyle);
      vectorMgr.loadLayer("special_use", "/layers/special_use_airspace.topojson", "special_use", VectorOverlayManager.specialUseStyle);
      vectorMgr.loadLayer("fir", "/layers/fir_boundaries.topojson", "fir_boundaries", VectorOverlayManager.firStyle);
    }

    attributionCtrl.register({ id: "airspace", name: "FAA Airspace Boundaries", html: "FAA AeroNav (17 U.S.C. § 105)", license: "US Public Domain" });

    const weatherLayer = new WeatherRadarLayer(engine);
    weatherLayer.init();

    const antennaCoverage = new AntennaCoverageLayer(engine, config.receiverLat, config.receiverLon);
    radarManager.setAntennaLayer(antennaCoverage);

    toggleMgr.setLayers({ weatherLayer, ringsLayer, antennaCoverage, vectorMgr });

    const scrubber = new WeatherScrubber(weatherLayer);
    scrubber.init("weather-scrubber-dock");

    const drawer = new LayerDrawer(engine, basemapMgr, ringsLayer, vectorMgr, weatherLayer, scrubber, legalModal, attributionCtrl);
    drawer.setAntennaCoverage(antennaCoverage);
    drawer.setToggleManager(toggleMgr);
    drawer.init("layer-drawer-container");

    configModal.setOnSave((newCfg) => {
      toggleMgr.updateConfig(newCfg);
      ringsLayer.setCenter(newCfg.receiverLat, newCfg.receiverLon);
      ringsLayer.setRings(newCfg.ringIntervals);
      ringsLayer.setAzimuthInterval(newCfg.azimuthIntervalDeg);
      antennaCoverage.setCenter(newCfg.receiverLat, newCfg.receiverLon);
      toggleMgr.getActiveEngine().setView(newCfg.receiverLat, newCfg.receiverLon);
      applyBasemap(toggleMgr.getActiveEngine(), basemapMgr, attributionCtrl, newCfg);
    });

    const inspector = new AircraftInspector();
    inspector.init("aircraft-inspector-container");
    inspector.setOnCenter((lat, lon) => {
      toggleMgr.getActiveEngine().setView(lat, lon, 11);
    });
    radarManager.setInspector(inspector);

    const filterBar = new AirspaceFilterBar();
    filterBar.onFilterChange((c) => radarManager.setFilterCriteria(c));

    const urlState = new UrlStateManager(toggleMgr, radarManager, filterBar);
    urlState.init();

    bindToolbar(drawer, configModal, splitter, toggleMgr, radarManager);
  } else {
    radarManager = new AirspaceRadarManager(null);
  }

  if (typeof window !== "undefined") {
    (window as any).radarManager = radarManager;
  }

  initStreaming(radarManager, serverUrl);
}

function resolveServerUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("server") || (window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1") ? "ws://127.0.0.1:3000" : window.location.origin);
}

function startUtcClock(): void {
  const clockEl = document.getElementById("utc-clock");
  const update = () => {
    if (clockEl) {
      const now = new Date();
      clockEl.textContent = `${now.toISOString().substring(11, 19)} UTC`;
    }
  };
  update();
  setInterval(update, 1000);
}

function initStreaming(radarManager: AirspaceRadarManager, serverUrl: string): void {
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
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initApp);
  else initApp();
}
