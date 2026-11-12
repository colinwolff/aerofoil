import { describe, expect, test } from "bun:test";
import { TelemetryTableRenderer } from "../src/components/TelemetryTableRenderer";
import { AircraftInspector } from "../src/components/AircraftInspector";
import { DEFAULT_FILTER_CRITERIA } from "../src/components/AirspaceFilters";
import { AirspaceRadarManager } from "../src/radar";
import type { TargetWire } from "@aerofoil-rs/sdk";

function makeFakeElement(tag: string) {
  const attrs: Record<string, string> = {};
  const el: any = {
    tagName: tag.toUpperCase(),
    children: [] as any[],
    className: "",
    textContent: "",
    innerHTML: "",
    setAttribute: (k: string, v: string) => { attrs[k] = v; },
    getAttribute: (k: string) => attrs[k] ?? null,
    hasAttribute: (k: string) => k in attrs,
    addEventListener: () => {},
    appendChild: (child: any) => { el.children.push(child); return child; },
    insertBefore: (child: any, ref: any) => {
      const oldIdx = el.children.indexOf(child);
      if (oldIdx !== -1) el.children.splice(oldIdx, 1);
      if (!ref) el.children.push(child);
      else {
        const idx = el.children.indexOf(ref);
        if (idx === -1) el.children.push(child); else el.children.splice(idx, 0, child);
      }
      return child;
    },
    remove: () => {},
  };
  return el;
}

describe("AF-96 Keyed DOM, Inspector Throttling, and Batch Updates", () => {
  test("TelemetryTableRenderer reuses keyed <tr> nodes without tearing down DOM rows", () => {
    const tbody = makeFakeElement("tbody");
    const countEl = makeFakeElement("span");
    let trCreates = 0;

    const prevDoc = (globalThis as any).document;
    (globalThis as any).document = {
      getElementById: (id: string) => (id === "telemetry-body" ? tbody : id === "target-count" ? countEl : null),
      createElement: (tag: string) => {
        if (tag === "tr") trCreates++;
        return makeFakeElement(tag);
      },
    };

    try {
      const renderer = new TelemetryTableRenderer();
      const t1: TargetWire = { schema: "aerofoil.target", version: 1, address: "4840D6", callsign: "KLM1", altitude: 30000, ground_speed: 450, source: "ModeS1090", last_seen_ms: 100 };
      const t2: TargetWire = { schema: "aerofoil.target", version: 1, address: "A00001", callsign: "UAL2", altitude: 20000, ground_speed: 350, source: "ModeS1090", last_seen_ms: 200 };
      const map = new Map<string, TargetWire>([["4840D6", t1], ["A00001", t2]]);

      renderer.render(map, DEFAULT_FILTER_CRITERIA, new Set(), () => {});
      expect(trCreates).toBe(2);
      const firstRowA00001 = tbody.children[0];
      const firstRow4840D6 = tbody.children[1];
      expect(firstRowA00001.getAttribute("data-address")).toBe("A00001");

      // Update KLM1 altitude & newer timestamp: order flips, SAME <tr> nodes reused!
      map.set("4840D6", { ...t1, altitude: 31000, last_seen_ms: 300 });
      renderer.render(map, DEFAULT_FILTER_CRITERIA, new Set(["4840D6"]), () => {});

      expect(trCreates).toBe(2); // zero new <tr> elements!
      expect(tbody.children[0]).toBe(firstRow4840D6);
      expect(tbody.children[1]).toBe(firstRowA00001);
      expect(firstRow4840D6.className).toContain("selected");
      expect(firstRow4840D6.children[2].textContent).toBe("31000 ft");
    } finally {
      (globalThis as any).document = prevDoc;
    }
  });

  test("AircraftInspector patches fields in place without recreating DOM buttons during throttle window", () => {
    const fieldMap: Record<string, any> = {
      cs: { textContent: "KLM1023", className: "" },
      cat: { textContent: "Jet", className: "" },
      op: { textContent: "", className: "" },
      sq: { textContent: "1200", className: "" },
      alt: { textContent: "30,000 ft", className: "" },
      vr: { textContent: "0 fpm", className: "" },
      gs: { textContent: "450 kt", className: "" },
      mach: { textContent: "M0.78", className: "" },
      trk: { textContent: "90°", className: "" },
      prov: { innerHTML: "" },
      spark: { innerHTML: "" },
    };
    let htmlSets = 0;
    const container: any = {
      className: "hidden",
      classList: {
        remove: (c: string) => { container.className = container.className.replace(c, "").trim(); },
        add: (c: string) => { container.className = `${container.className} ${c}`.trim(); },
        contains: (c: string) => container.className.includes(c),
      },
      set innerHTML(_v: string) { htmlSets++; },
      get innerHTML() { return ""; },
      querySelector: (sel: string) => {
        const m = sel.match(/data-f="([^"]+)"/);
        return m ? fieldMap[m[1]] ?? null : null;
      },
    };

    const prevDoc = (globalThis as any).document;
    (globalThis as any).document = { getElementById: (id: string) => (id === "c" ? container : null) };
    try {
      const inspector = new AircraftInspector();
      inspector.init("c");
      const base: TargetWire = { schema: "aerofoil.target", version: 1, address: "4840D6", callsign: "KLM1023", altitude: 30000, ground_speed: 450, source: "ModeS1090", last_seen_ms: 100 };
      inspector.selectTarget(base);
      expect(htmlSets).toBe(1);

      // Rapid updates within 500ms do NOT wipe innerHTML
      inspector.selectTarget({ ...base, altitude: 30500 });
      expect(htmlSets).toBe(1);

      // Direct render() patches [data-f] elements in place instead of replacing innerHTML
      inspector.render();
      expect(htmlSets).toBe(1);
      expect(fieldMap.alt.textContent).toBe("30,500 ft");
      inspector.close();
    } finally {
      (globalThis as any).document = prevDoc;
    }
  });

  test("AirspaceRadarManager.updateTargetBatch coalesces table schedule to 1 call per batch", () => {
    const rm = new AirspaceRadarManager(null);
    let scheduleCalls = 0;
    (rm as any).tableRenderer = {
      schedule: () => { scheduleCalls++; },
    };
    rm.updateTargetBatch([
      { schema: "aerofoil.target", version: 1, address: "A1", source: "ModeS1090", last_seen_ms: 1 },
      { schema: "aerofoil.target", version: 1, address: "A2", source: "ModeS1090", last_seen_ms: 2 },
      { schema: "aerofoil.target", version: 1, address: "A3", source: "ModeS1090", last_seen_ms: 3 },
    ]);
    expect(scheduleCalls).toBe(1);
    expect(rm.getTargets().length).toBe(3);
  });
});
