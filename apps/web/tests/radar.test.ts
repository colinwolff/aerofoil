import { describe, expect, test } from "bun:test";
import { AirspaceRadarManager, createPlaneSvg, isEmergencySquawk } from "../src/radar";
import { ThemeManager } from "../src/components/ThemeManager";
import type { TargetWire } from "@aerofoil-rs/sdk";

describe("AirspaceRadarManager", () => {
  test("identifies emergency squawks correctly", () => {
    expect(isEmergencySquawk("7700")).toBe(true);
    expect(isEmergencySquawk("7600")).toBe(true);
    expect(isEmergencySquawk("7500")).toBe(true);
    expect(isEmergencySquawk("1200")).toBe(false);
    expect(isEmergencySquawk("0057")).toBe(false);
    expect(isEmergencySquawk(undefined)).toBe(false);
  });

  test("creates plane SVG with rotated heading transform", () => {
    const svg1 = createPlaneSvg(90, false);
    expect(svg1).toContain("transform: rotate(90deg)");
    expect(svg1).not.toContain("emergency");

    const svg2 = createPlaneSvg(270, true);
    expect(svg2).toContain("transform: rotate(270deg)");
    expect(svg2).toContain("plane-marker emergency");
  });

  test("manages and sorts target states", () => {
    const manager = new AirspaceRadarManager(null);

    const t1: TargetWire = {
      schema: "aerofoil.target",
      version: 1,
      address: "4840D6",
      address_type: "Icao",
      callsign: "KLM1023",
      altitude: 38000,
      source: "ModeS1090",
      last_seen_ms: 1000,
    };

    const t2: TargetWire = {
      schema: "aerofoil.target",
      version: 1,
      address: "40621D",
      address_type: "Icao",
      callsign: "BAW142",
      altitude: 35000,
      squawk: "7700",
      source: "ModeS1090",
      last_seen_ms: 2000,
    };

    manager.updateTarget(t1);
    manager.updateTarget(t2);

    const targets = manager.getTargets();
    expect(targets.length).toBe(2);

    const klm = targets.find((t) => t.callsign === "KLM1023");
    expect(klm).toBeDefined();
    expect(klm?.altitude).toBe(38000);

    const baw = targets.find((t) => t.callsign === "BAW142");
    expect(baw).toBeDefined();
    expect(baw?.squawk).toBe("7700");
  });

  test("surfaces MLAT reception provenance badge in marker popup", () => {
    let capturedPopup = "";
    const mockEngine = {
      updateTargetMarker: (_key: string, _lat: number, _lon: number, _icon: string, popup: string) => {
        capturedPopup = popup;
      },
    };
    const manager = new AirspaceRadarManager(mockEngine);

    const mlatTarget: TargetWire = {
      schema: "aerofoil.target",
      version: 1,
      address: "4CA705",
      address_type: "Icao",
      callsign: "RYR451",
      altitude: 28000,
      lat: 52.3676,
      lon: 4.9041,
      source: "ModeS1090",
      reception: "Mlat",
      last_seen_ms: 3000,
    };

    manager.updateTarget(mlatTarget);
    expect(capturedPopup).toContain("MLAT");
  });

  test("toggles all labels and highlights a single selected aircraft", () => {
    const markers = new Map<string, string>();
    const mockEngine = {
      getZoom: () => 9,
      updateTargetMarker: (key: string, _lat: number, _lon: number, icon: string) => {
        markers.set(key, icon);
      },
    };
    const manager = new AirspaceRadarManager(mockEngine);
    const t1: TargetWire = {
      address: "4840D6",
      callsign: "KLM1023",
      altitude: 32000,
      lat: 52.3,
      lon: 4.8,
      source: "ModeS1090",
      last_seen_ms: 1000,
    } as any;
    const t2: TargetWire = {
      address: "A12345",
      callsign: "UAL400",
      altitude: 28000,
      lat: 52.4,
      lon: 4.9,
      source: "ModeS1090",
      last_seen_ms: 2000,
    } as any;

    manager.updateTarget(t1);
    manager.updateTarget(t2);
    expect(markers.get("4840D6")).toContain("plane-label");
    expect(markers.get("A12345")).toContain("plane-label");

    // Disable all labels globally
    expect(manager.toggleAllLabels()).toBe(false);
    expect(markers.get("4840D6")).not.toContain("plane-label");
    expect(markers.get("A12345")).not.toContain("plane-label");

    // Selecting 1 plane highlights it and shows its label even when global labels are off
    manager.selectTarget("4840D6", false);
    expect(manager.getSelectedIcao()).toBe("4840D6");
    expect(markers.get("4840D6")).toContain("selected-plane");
    expect(markers.get("4840D6")).toContain("plane-label selected");
    expect(markers.get("A12345")).not.toContain("plane-label");

    // Switching single selection to second plane unhighlights the first
    manager.selectTarget("A12345", false);
    expect(manager.getSelectedIcao()).toBe("A12345");
    expect(markers.get("4840D6")).not.toContain("selected-plane");
    expect(markers.get("A12345")).toContain("selected-plane");

    manager.clearSelection();
    expect(manager.getSelectedIcao()).toBeNull();
    expect(markers.get("A12345")).not.toContain("selected-plane");
  });
});

describe("ThemeManager", () => {
  test("manages theme state transitions", () => {
    const tm = new ThemeManager("nonexistent-btn");
    expect(tm.getTheme()).toBe("dark");
    expect(tm.toggleTheme()).toBe("light");
    expect(tm.getTheme()).toBe("light");
    expect(tm.toggleTheme()).toBe("dark");
    expect(tm.getTheme()).toBe("dark");
  });
});
