import { describe, expect, test } from "bun:test";
import { upsertLeafletMarkerFast } from "../src/layers/LeafletMarkerDom";
import { MapLibreHudOverlay } from "../src/layers/MapLibreHudOverlay";
import type { TargetVisualUpdate } from "../src/layers/AirspaceMapEngine";

function makeClassList(initial: string[] = []) {
  const set = new Set(initial);
  return {
    toggle: (cls: string, force?: boolean) => {
      if (force === undefined) {
        if (set.has(cls)) { set.delete(cls); return false; }
        set.add(cls); return true;
      }
      if (force) set.add(cls); else set.delete(cls);
      return force;
    },
    contains: (cls: string) => set.has(cls),
  };
}

describe("LeafletMarkerDom in-place mutation", () => {
  test("mutates SVG transform, fill, label classes/text in place without calling setIcon", () => {
    let setIconCalls = 0;
    let setLatLngCalls = 0;
    let setPopupCalls = 0;
    let lastLatLng: any = null;
    let lastPopup = "";

    const svgEl = { style: { transform: "rotate(90deg)" } };
    const attrs: Record<string, string> = { fill: "#38bdf8" };
    const gEl = {
      classList: makeClassList(),
      setAttribute: (k: string, v: string) => { attrs[k] = v; },
    };
    const csEl = { textContent: "KLM101" };
    const telEl = { textContent: "FL300 400k" };
    const lblEl = {
      classList: makeClassList(["plane-label"]),
      querySelector: (sel: string) => (sel === ".label-cs" ? csEl : sel === ".label-telemetry" ? telEl : null),
    };
    const wrapperEl = {
      classList: makeClassList(["plane-marker-wrapper"]),
      querySelector: (sel: string) => {
        if (sel === "svg") return svgEl;
        if (sel === "svg > g") return gEl;
        if (sel === ".plane-label") return lblEl;
        return null;
      },
    };
    const rootEl = {
      querySelector: (sel: string) => (sel === ".plane-marker-wrapper" ? wrapperEl : null),
    };

    const fakeMarker: any = {
      setLatLng: (ll: any) => { setLatLngCalls++; lastLatLng = ll; },
      setIcon: () => { setIconCalls++; },
      setPopupContent: (p: string) => { setPopupCalls++; lastPopup = p; },
      getElement: () => rootEl,
      __st: {
        lat: 52.3, lon: 4.9, rot: 90, color: "#38bdf8", cat: "Jet",
        cs: "KLM101", tel: "FL300 400k", sel: false, emg: false, vis: true, pop: "<b>KLM101</b>",
      },
    };

    const markers = new Map<string, any>([["4840D6", fakeMarker]]);
    const update: TargetVisualUpdate = {
      address: "4840D6",
      lat: 52.35,
      lon: 4.95,
      altitudeFt: 35000,
      heading: 185,
      category: "Jet",
      callsign: "KLM101",
      telemetryText: "FL350↑ 450k",
      isSelected: true,
      isEmergency: true,
      showLabel: true,
      popupHtml: "<b>KLM101</b> FL350",
    };

    upsertLeafletMarkerFast({} as any, markers, update);

    expect(setIconCalls).toBe(0);
    expect(setLatLngCalls).toBe(1);
    expect(lastLatLng).toEqual([52.35, 4.95]);
    expect(svgEl.style.transform).toBe("rotate(185deg)");
    expect(gEl.classList.contains("emergency-pulse")).toBe(true);
    expect(attrs.fill).toBe("#ef4444");
    expect(wrapperEl.classList.contains("selected-plane")).toBe(true);
    expect(lblEl.classList.contains("selected")).toBe(true);
    expect(lblEl.classList.contains("emergency")).toBe(true);
    expect(lblEl.classList.contains("decluttered")).toBe(false);
    expect(telEl.textContent).toBe("FL350↑ 450k");
    expect(setPopupCalls).toBe(1);
    expect(lastPopup).toBe("<b>KLM101</b> FL350");

    // Re-running identical state triggers zero popup updates and still zero setIcon calls
    upsertLeafletMarkerFast({} as any, markers, update);
    expect(setIconCalls).toBe(0);
    expect(setPopupCalls).toBe(1);

    // Changing airframe category triggers SVG icon swap
    upsertLeafletMarkerFast({} as any, markers, { ...update, category: "Heavy" });
    expect(setIconCalls).toBe(1);
  });
});

describe("MapLibreHudOverlay 3D projection, declutter, and hit-testing", () => {
  test("projects targets through Mercator matrix, declutters overlap, and opens shared popup on click", () => {
    const hud = new MapLibreHudOverlay();
    const clicks: ((e: any) => void)[] = [];
    const filledTexts: string[] = [];

    const fakeCtx: any = {
      font: "",
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      setTransform: () => {},
      clearRect: () => {},
      measureText: (t: string) => ({ width: t.length * 6 }),
      beginPath: () => {},
      rect: () => {},
      roundRect: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: (text: string) => { filledTexts.push(text); },
    };
    const fakeCanvas: any = {
      className: "maplibre-3d-hud-canvas",
      style: { cssText: "" },
      width: 800,
      height: 600,
      clientWidth: 800,
      clientHeight: 600,
      getContext: () => fakeCtx,
    };
    const fakeContainer: any = {
      appendChild: () => {},
    };
    const fakeMap: any = {
      getContainer: () => fakeContainer,
      getCanvas: () => fakeCanvas,
      getTerrain: () => null,
      on: (ev: string, cb: (e: any) => void) => {
        if (ev === "click") clicks.push(cb);
      },
    };

    const prevDoc = (globalThis as any).document;
    (globalThis as any).document = {
      createElement: () => fakeCanvas,
    };
    try {
      hud.attach(fakeMap);
    } finally {
      (globalThis as any).document = prevDoc;
    }

    // Two overlapping targets at exact same lat/lon; emergency/selected outranks normal
    hud.upsertTarget({
      address: "A00001",
      lat: 52.3676,
      lon: 4.9041,
      altMeters: 3000,
      callsign: "NORMAL1",
      telemetryText: "FL100 250k",
      isSelected: false,
      isEmergency: false,
      showLabel: true,
      popupHtml: "<b>NORMAL1</b>",
    });
    hud.upsertTarget({
      address: "A00002",
      lat: 52.3676,
      lon: 4.9041,
      altMeters: 3200,
      callsign: "VIP999",
      telemetryText: "FL105 260k",
      isSelected: true,
      isEmergency: false,
      showLabel: true,
      popupHtml: "<b>VIP999</b>",
    });

    // Simple ortho matrix centering Mercator(4.9041, 52.3676) ~= (0.5136, 0.3289) into screen NDC [-1, 1]
    const cx = 0.513622;
    const cy = 0.32888;
    const matrix = [
      10, 0, 0, 0,
      0, 10, 0, 0,
      0, 0, 1, 0,
      -10 * cx, -10 * cy, 0, 1,
    ];

    hud.draw(matrix);
    expect(hud.getRenderedLabels()).toEqual(["VIP999"]);
    expect(filledTexts).toContain("VIP999");
    expect(filledTexts).not.toContain("NORMAL1");

    // Verify projected click opens reused popup with closest target
    let popupLngLat: any = null;
    let popupHtml = "";
    let addToCalls = 0;
    (hud as any).sharedPopup = {
      setLngLat: (ll: any) => { popupLngLat = ll; return (hud as any).sharedPopup; },
      setHTML: (h: string) => { popupHtml = h; return (hud as any).sharedPopup; },
      addTo: () => { addToCalls++; return (hud as any).sharedPopup; },
    };

    expect(clicks.length).toBe(1);
    clicks[0]({ point: { x: 400, y: 300 } });
    expect(addToCalls).toBe(1);
    expect(popupLngLat).toEqual([4.9041, 52.3676]);
    expect(popupHtml).toContain("<b>");
  });
});
