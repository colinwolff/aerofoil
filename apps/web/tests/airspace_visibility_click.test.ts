import { describe, expect, it } from "bun:test";
import { AirspaceVolume3dManager } from "../src/layers/AirspaceVolume3dManager";
import { SurveillanceDome3dManager } from "../src/layers/SurveillanceDome3dManager";
import { ensureModelsBeforeExtrusions, MODEL_LAYER_ID } from "../src/layers/MapLibreLayerOrder";
import { MapLibreHudOverlay } from "../src/layers/MapLibreHudOverlay";
import { MapLibre3dModelLayer } from "../src/layers/MapLibre3dModelLayer";
import { bindLeafletMarkerClick } from "../src/layers/LeafletMarkerDom";
import { AirspaceRadarManager } from "../src/radar";

function createOrderedMockMap(initialLayers: { id: string; type?: string; paint?: Record<string, any> }[] = []) {
  const layers: Array<{ id: string; type?: string; paint?: Record<string, any> }> = initialLayers.map((l) => ({ ...l }));
  const sources = new Map<string, any>();
  const listeners: Record<string, Record<string, ((e: any) => void)[]>> = {};
  const fakeCanvas = { clientWidth: 800, clientHeight: 600, width: 800, height: 600, style: {}, getContext: () => null };

  const map: any = {
    getStyle: () => ({ layers: [...layers] }),
    getLayer: (id: string) => layers.find((l) => l.id === id),
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, src: any) => { sources.set(id, src); },
    removeSource: (id: string) => { sources.delete(id); },
    addLayer: (layer: any, beforeId?: string) => {
      const idx = beforeId ? layers.findIndex((l) => l.id === beforeId) : -1;
      if (idx >= 0) layers.splice(idx, 0, layer);
      else layers.push(layer);
    },
    moveLayer: (id: string, beforeId?: string) => {
      const from = layers.findIndex((l) => l.id === id);
      if (from < 0) return;
      const [item] = layers.splice(from, 1);
      const to = beforeId ? layers.findIndex((l) => l.id === beforeId) : -1;
      if (to >= 0) layers.splice(to, 0, item);
      else layers.push(item);
    },
    removeLayer: (id: string) => {
      const idx = layers.findIndex((l) => l.id === id);
      if (idx >= 0) layers.splice(idx, 1);
    },
    setLayoutProperty: () => {},
    getContainer: () => ({ appendChild: () => {} }),
    getCanvas: () => fakeCanvas,
    getTerrain: () => null,
    on: (type: string, layerOrCb: any, maybeCb?: any) => {
      const layer = typeof layerOrCb === "string" ? layerOrCb : "*";
      const cb = typeof layerOrCb === "function" ? layerOrCb : maybeCb;
      if (!listeners[type]) listeners[type] = {};
      if (!listeners[type][layer]) listeners[type][layer] = [];
      listeners[type][layer].push(cb);
    },
    emitClick: (layerId: string, event: any) => {
      for (const cb of listeners.click?.[layerId] ?? []) cb(event);
    },
  };
  return { map, layers };
}

function makeFakePopup(log: { adds: string[]; removes: number }) {
  let html = "";
  const popup: any = {
    setLngLat: () => popup,
    setHTML: (h: string) => { html = h; return popup; },
    addTo: () => { log.adds.push(html); return popup; },
    remove: () => { log.removes++; return popup; },
  };
  return popup;
}

describe("AF-98 Airspace visibility and aircraft click priority", () => {
  it("renders volumetric fill-extrusions after aircraft-3d-models-layer and lines before it", () => {
    const { map, layers } = createOrderedMockMap([{ id: "background" }, { id: MODEL_LAYER_ID, type: "custom" }]);
    const volumeMgr = new AirspaceVolume3dManager();
    const domeMgr = new SurveillanceDome3dManager();

    const ctr = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { name: "SCHIPHOL CTR", class: "C", lower_alt: 0, upper_alt: 3000 },
        geometry: { type: "Polygon", coordinates: [[[4.7, 52.2], [4.9, 52.2], [4.9, 52.4], [4.7, 52.4], [4.7, 52.2]]] },
      }],
    };
    volumeMgr.setupVolume(map, "us_classes", ctr, MODEL_LAYER_ID);
    domeMgr.setupDome(map, MODEL_LAYER_ID);

    const ids = layers.map((l) => l.id);
    expect(ids.indexOf("vol-line-us_classes")).toBeLessThan(ids.indexOf(MODEL_LAYER_ID));
    expect(ids.indexOf(MODEL_LAYER_ID)).toBeLessThan(ids.indexOf("vol-fill-us_classes"));
    expect(ids.indexOf(MODEL_LAYER_ID)).toBeLessThan(ids.indexOf("surveillance-dome-ribbons"));
    expect(layers.find((l) => l.id === "vol-fill-us_classes")?.paint?.["fill-extrusion-opacity"]).toBe(0.2);
    expect(layers.find((l) => l.id === "surveillance-dome-ribbons")?.paint?.["fill-extrusion-opacity"]).toBe(0.18);

    map.moveLayer("vol-fill-us_classes", MODEL_LAYER_ID);
    expect(layers.map((l) => l.id).indexOf("vol-fill-us_classes")).toBeLessThan(layers.map((l) => l.id).indexOf(MODEL_LAYER_ID));
    ensureModelsBeforeExtrusions(map, MODEL_LAYER_ID);
    expect(layers.map((l) => l.id).indexOf(MODEL_LAYER_ID)).toBeLessThan(layers.map((l) => l.id).indexOf("vol-fill-us_classes"));
  });

  it("draws opaque 3D aircraft meshes with depth write before lines without depthMask pollution", () => {
    const order: string[] = [];
    const layer = new MapLibre3dModelLayer();
    (layer as any).map = { getZoom: () => 9, triggerRepaint: () => {} };
    (layer as any).instanced = { init: () => {}, dispose: () => {}, render: () => { order.push("mesh"); return false; } };
    (layer as any).linesRenderer = { init: () => {}, dispose: () => {}, render: () => { order.push("lines"); } };
    layer.updateTarget("484161", 4.76, 52.31, 300, 90, 0, 0, "Jet" as any, [0.2, 0.7, 0.9, 1], 160, 0);

    layer.render({ depthMask: (flag: boolean) => order.push(`depth:${flag}`) } as any, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(order).toEqual(["depth:true", "mesh", "depth:false", "lines", "depth:true"]);
  });

  it("prioritizes 3D aircraft clicks over enclosing airspace popups and deduplicates empty airspace clicks", () => {
    const planeLog = { adds: [] as string[], removes: 0 };
    const airLog = { adds: [] as string[], removes: 0 };
    const prevDoc = (globalThis as any).document;
    (globalThis as any).document = { createElement: () => ({ className: "", style: { cssText: "" }, getContext: () => null, clientWidth: 800, clientHeight: 600 }) };

    try {
      const { map } = createOrderedMockMap([{ id: MODEL_LAYER_ID }]);
      const hud = new MapLibreHudOverlay();
      const volumes = new AirspaceVolume3dManager(() => makeFakePopup(airLog));
      const selected: Array<{ addr: string; multi: boolean }> = [];

      hud.attach(map);
      (hud as any).sharedPopup = makeFakePopup(planeLog);
      hud.setOnTargetSelect((addr, multi) => selected.push({ addr, multi }));
      hud.setOnTargetPopupOpen(() => volumes.closePopup());
      volumes.setClickArbitration((pt) => hud.hasTargetAt(pt), () => hud.closePopup());

      hud.upsertTarget({
        address: "484161", lat: 52.31, lon: 4.76, altMeters: 150, callsign: "KLM1001",
        telemetryText: "FL005 140k", isSelected: false, isEmergency: false, showLabel: true, popupHtml: "<b>KLM1001</b>",
      });
      const plane = (hud as any).targets.get("484161");
      plane.screenX = 240;
      plane.screenY = 180;

      volumes.setupVolume(map, "ctr", {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: { name: "SCHIPHOL CTR", class: "C", lower_alt: 0, upper_alt: 3000 },
          geometry: { type: "Polygon", coordinates: [[[4.7, 52.2], [4.9, 52.2], [4.9, 52.4], [4.7, 52.4], [4.7, 52.2]]] },
        }],
      });

      const planeClick = {
        point: { x: 245, y: 184 },
        lngLat: { lng: 4.76, lat: 52.31 },
        features: [{ properties: { name: "SCHIPHOL CTR", class: "C", lower_alt: 0, upper_alt: 3000 } }],
        originalEvent: { shiftKey: false },
      };
      map.emitClick("vol-fill-ctr", planeClick);
      map.emitClick("*", planeClick);

      expect(selected).toEqual([{ addr: "484161", multi: false }]);
      expect(planeLog.adds).toEqual(["<b>KLM1001</b>"]);
      expect(airLog.adds).toEqual([]);

      const emptyClick = {
        point: { x: 420, y: 340 },
        lngLat: { lng: 4.82, lat: 52.35 },
        features: [{ properties: { name: "SCHIPHOL CTR", class: "C", lower_alt: 0, upper_alt: 3000 } }],
        originalEvent: { shiftKey: false },
      };
      map.emitClick("*", emptyClick);
      map.emitClick("vol-fill-ctr", emptyClick);
      map.emitClick("vol-line-ctr", emptyClick);

      expect(planeLog.removes).toBeGreaterThanOrEqual(1);
      expect(airLog.adds).toHaveLength(1);
      expect(airLog.adds[0]).toContain("SCHIPHOL CTR");
    } finally {
      (globalThis as any).document = prevDoc;
    }
  });

  it("wires 2D marker click propagation guard and AirspaceRadarManager target selection", () => {
    let clickHook: ((addr: string, multi: boolean) => void) | undefined;
    const radar = new AirspaceRadarManager();
    radar.setEngine({
      getZoom: () => 9,
      onViewChange: () => {},
      setOnTargetClick: (cb: (addr: string, multi: boolean) => void) => { clickHook = cb; },
      updateTargetVisual: () => {},
    } as any);
    radar.updateTarget({ address: "484161", callsign: "KLM1001", latitude: 52.31, longitude: 4.76, altitude: 500 } as any);

    const handlers: Record<string, (ev: any) => void> = {};
    const fakeMarker: any = { on: (ev: string, cb: (e: any) => void) => { handlers[ev] = cb; } };
    bindLeafletMarkerClick(fakeMarker, "484161", (a, m) => clickHook?.(a, m));

    let stopped = false;
    handlers.click?.({ originalEvent: { shiftKey: true, stopPropagation: () => { stopped = true; } } });
    expect(stopped).toBe(true);
    expect(radar.getSelectedIcao()).toBe("484161");
  });
});
