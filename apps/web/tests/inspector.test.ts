import { describe, expect, test, beforeEach } from "bun:test";
import { AircraftInspector } from "../src/components/AircraftInspector";
import type { TargetWire } from "@aerofoil-rs/sdk";

const mockElements: Record<string, any> = {};
const globalAny = globalThis as any;

if (typeof globalAny.document === "undefined") {
  globalAny.document = {
    getElementById: (id: string) => {
      if (mockElements[id]) return mockElements[id];
      for (const parent of Object.values(mockElements)) {
        if (parent.innerHTML && parent.innerHTML.includes(`id="${id}"`)) {
          const child: any = globalAny.document.createElement("button");
          child.id = id;
          mockElements[id] = child;
          return child;
        }
      }
      return null;
    },
    createElement: (tag: string) => {
      const el: any = {
        tagName: tag,
        className: "",
        classList: {
          add: (cls: string) => { el.className = `${el.className} ${cls}`.trim(); },
          remove: (cls: string) => { el.className = el.className.replace(cls, "").trim(); },
          contains: (cls: string) => el.className.includes(cls),
        },
        innerHTML: "",
        addEventListener: (event: string, cb: Function) => { el[`on_${event}`] = cb; },
        dispatchEvent: (e: any) => { el[`on_${e.type}`]?.(e); },
      };
      return el;
    },
    body: {
      appendChild: (el: any) => {
        if (el.id) mockElements[el.id] = el;
      },
    },
  };
  globalAny.Event = class {
    constructor(public type: string) {}
  };
}

describe("AircraftInspector Component", () => {
  beforeEach(() => {
    for (const k of Object.keys(mockElements)) {
      delete mockElements[k];
    }
  });

  test("initializes hidden and mounts DOM container", () => {
    const inspector = new AircraftInspector();
    inspector.init("test-container");

    expect(inspector.isVisible()).toBe(false);
    expect(inspector.getSelectedIcao()).toBeNull();
  });

  test("renders telemetry and operator for selected aircraft", () => {
    const inspector = new AircraftInspector();
    inspector.init("test-container");

    const target: TargetWire = {
      address: "4840D6",
      callsign: "KLM1023",
      altitude: 35000,
      ground_speed: 460,
      heading: 270,
      squawk: "7700",
      lat: 52.3,
      lon: 4.8,
      source: "ModeS1090",
      reception: "Direct",
      last_seen_ms: Date.now(),
    };

    const history = [
      { time_ms: 1000, altitude_ft: 32000 },
      { time_ms: 2000, altitude_ft: 33500 },
      { time_ms: 3000, altitude_ft: 35000 },
    ];

    inspector.selectTarget(target, history);

    expect(inspector.isVisible()).toBe(true);
    expect(inspector.getSelectedIcao()).toBe("4840D6");

    const el = document.getElementById("test-container")!;
    expect(el.innerHTML).toContain("KLM1023");
    expect(el.innerHTML).toContain("KLM Royal Dutch Airlines");
    expect(el.innerHTML).toContain("4840D6");
    expect(el.innerHTML).toContain("35,000 ft");
    expect(el.innerHTML).toContain("460 kt");
    expect(el.innerHTML).toContain("M0.80");
    expect(el.innerHTML).toContain("7700");
    expect(el.innerHTML).toContain("<polyline");

    inspector.close();
    expect(inspector.isVisible()).toBe(false);
    expect(inspector.getSelectedIcao()).toBeNull();
  });

  test("triggers onCenter callback when Center Map button is clicked", () => {
    const inspector = new AircraftInspector();
    inspector.init("test-container");

    let centeredCoords: [number, number] | null = null;
    inspector.setOnCenter((lat, lon) => {
      centeredCoords = [lat, lon];
    });

    const target: TargetWire = {
      address: "A12345",
      callsign: "UAL440",
      altitude: 12000,
      lat: 37.7749,
      lon: -122.4194,
      source: "ModeS1090",
      reception: "Direct",
      last_seen_ms: Date.now(),
    };

    inspector.selectTarget(target);
    const centerBtn = document.getElementById("inspector-center-btn");
    expect(centerBtn).not.toBeNull();
    centerBtn?.dispatchEvent(new Event("click"));

    expect(centeredCoords).toEqual([37.7749, -122.4194]);
  });
});
