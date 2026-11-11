//! Main application entrypoint for aerofoil web radar.

import { AerofoilClient, type TargetWire } from "@aerofoil-rs/sdk";
import "leaflet/dist/leaflet.css";

import { LeafletMapEngine } from "./layers/LeafletMapEngine";
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

    const scrubber = new WeatherScrubber(weatherLayer);
    scrubber.init("weather-scrubber-dock");

    const drawer = new LayerDrawer(engine, basemapMgr, ringsLayer, vectorMgr, weatherLayer, scrubber, legalModal, attributionCtrl);
    drawer.setAntennaCoverage(antennaCoverage);
    drawer.init("layer-drawer-container");

    configModal.setOnSave((newCfg) => {
      ringsLayer.setCenter(newCfg.receiverLat, newCfg.receiverLon);
      ringsLayer.setRings(newCfg.ringIntervals);
      ringsLayer.setAzimuthInterval(newCfg.azimuthIntervalDeg);
      antennaCoverage.setCenter(newCfg.receiverLat, newCfg.receiverLon);
      toggleMgr.getActiveEngine().setView(newCfg.receiverLat, newCfg.receiverLon);
      applyBasemap(toggleMgr.getActiveEngine(), basemapMgr, attributionCtrl, newCfg);
    });

    bindToolbar(drawer, configModal, splitter, toggleMgr, configModal);
  } else {
    radarManager = new AirspaceRadarManager(null);
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

function applyBasemap(engine: LeafletMapEngine, mgr: BaseMapManager, attr: AttributionControl, cfg: any): void {
  const mapEl = document.getElementById("map");
  if (cfg.customTileUrl) {
    engine.setBaseTileLayer("custom", cfg.customTileUrl, "Custom Tiles", { maxZoom: 19 });
    attr.register({ id: "basemap", name: "Custom Tiles", html: "Custom Operator Tiles", license: "Custom License" });
    mapEl?.classList.remove("dark-tiles");
  } else if (cfg.cartoKey) {
    const def = mgr.setBasemap("carto_dark");
    const url = `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${encodeURIComponent(cfg.cartoKey)}`;
    engine.setBaseTileLayer("carto_dark", url, def.attribution, { maxZoom: 19, subdomains: "abcd" });
    attr.register({ id: "basemap", name: def.name, html: def.attribution, license: def.license });
    mapEl?.classList.remove("dark-tiles");
  } else {
    const def = mgr.setBasemap(cfg.defaultBasemap || "osm_dark");
    if (mapEl) {
      mapEl.dataset.darkFilter = def.isDarkFilterRecommended ? "true" : "false";
      const isDark = document.body.classList.contains("dark-theme");
      mapEl.classList.toggle("dark-tiles", isDark && !!def.isDarkFilterRecommended);
    }
    engine.setBaseTileLayer(def.id, def.url, def.attribution, {
      minZoom: def.minZoom,
      maxZoom: def.maxZoom,
      maxNativeZoom: def.maxNativeZoom,
      subdomains: def.subdomains,
      pane: def.pane,
      tms: def.tms,
    });
    attr.register({ id: "basemap", name: def.name, html: def.attribution, license: def.license });
  }
}

function bindToolbar(drawer: LayerDrawer, cfgModal: MapConfigModal, splitter: SidebarSplitter, toggleMgr: EngineToggleManager, cfg: MapConfigModal): void {
  const btnLayers = document.getElementById("btn-toggle-layers");
  btnLayers?.addEventListener("click", () => {
    const open = drawer.toggle();
    btnLayers.classList.toggle("active", open);
  });

  const btnWeather = document.getElementById("btn-toggle-weather");
  btnWeather?.addEventListener("click", () => {
    const active = drawer.toggleWeather();
    btnWeather.classList.toggle("active", active);
  });

  const centerDropdown = document.getElementById("center-menu-dropdown");
  document.getElementById("btn-center-menu")?.addEventListener("click", (e) => {
    e.stopPropagation();
    centerDropdown?.classList.toggle("hidden");
  });
  window.addEventListener("click", () => centerDropdown?.classList.add("hidden"));

  const getEngine = () => toggleMgr.getActiveEngine();
  document.getElementById("btn-center-receiver")?.addEventListener("click", () => {
    const c = cfg.getConfig();
    getEngine().setView(c.receiverLat, c.receiverLon, 8);
  });
  document.getElementById("btn-center-conus")?.addEventListener("click", () => getEngine().setView(39.2976, -94.7139, 6));
  document.getElementById("btn-center-europe")?.addEventListener("click", () => getEngine().setView(52.3676, 4.9041, 8));
  document.getElementById("btn-center-gps")?.addEventListener("click", () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => getEngine().setView(pos.coords.latitude, pos.coords.longitude, 9));
    }
  });

  document.getElementById("btn-open-settings")?.addEventListener("click", () => cfgModal.show());

  const toggleSidebar = () => splitter.toggleCollapse();
  document.getElementById("btn-toggle-sidebar")?.addEventListener("click", toggleSidebar);
  document.getElementById("btn-collapse-sidebar")?.addEventListener("click", toggleSidebar);
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
