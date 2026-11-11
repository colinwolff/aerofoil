//! ToolbarBinder — Binds top navigation buttons, center dropdown, basemap applicator, and hotkeys.

import type { LayerDrawer } from "./LayerDrawer";
import type { MapConfigModal } from "./MapConfigModal";
import type { SidebarSplitter } from "./SidebarSplitter";
import type { EngineToggleManager } from "./EngineToggleManager";
import type { BaseMapManager } from "../layers/BaseMapRegistry";
import type { AttributionControl } from "../layers/AttributionControl";
import type { AirspaceMapEngine } from "../layers/AirspaceMapEngine";

export function applyBasemap(
  engine: AirspaceMapEngine,
  mgr: BaseMapManager,
  attr: AttributionControl,
  cfg: any,
): void {
  const mapEl = document.getElementById("map");
  mgr.setCartoKey(cfg.cartoKey || "");
  if (cfg.customTileUrl) {
    engine.setBaseTileLayer("custom", cfg.customTileUrl, "Custom Tiles", { maxZoom: 19 });
    attr.register({ id: "basemap", name: "Custom Tiles", html: "Custom Operator Tiles", license: "Custom License" });
    mapEl?.classList.remove("dark-tiles");
  } else {
    const targetId = cfg.defaultBasemap || (mgr.getCartoKey() ? "carto_dark" : "osm_dark");
    const def = mgr.setBasemap(targetId);
    const sel = document.getElementById("hud-basemap-select") as HTMLSelectElement | null;
    if (sel) sel.value = def.id;
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

export function bindToolbar(
  drawer: LayerDrawer,
  cfgModal: MapConfigModal,
  splitter: SidebarSplitter,
  toggleMgr: EngineToggleManager,
): void {
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
    const c = cfgModal.getConfig();
    getEngine().setView(c.receiverLat, c.receiverLon, 8);
  });
  document.getElementById("btn-center-conus")?.addEventListener("click", () => getEngine().setView(39.2976, -94.7139, 6));
  document.getElementById("btn-center-europe")?.addEventListener("click", () => getEngine().setView(52.3676, 4.9041, 8));
  document.getElementById("btn-center-rainier")?.addEventListener("click", () => {
    toggleMgr.setMode("3D");
    getEngine().setView(46.8523, -121.7603, 11.5);
    (getEngine() as any).setPitch?.(68);
  });
  document.getElementById("btn-center-alps")?.addEventListener("click", () => {
    toggleMgr.setMode("3D");
    getEngine().setView(45.9766, 7.6585, 11.5);
    (getEngine() as any).setPitch?.(68);
  });
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
