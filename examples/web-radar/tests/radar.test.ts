import { describe, expect, test } from "bun:test";
import { AirspaceRadarManager, createPlaneSvg, isEmergencySquawk } from "../src/radar";
import type { TargetWire } from "@aerofoil/sdk";

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
});
