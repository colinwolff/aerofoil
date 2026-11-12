import { describe, expect, test } from "bun:test";
import { AircraftLabelsManager } from "../src/layers/AircraftLabelsManager";
import type { TargetWire } from "@aerofoil-rs/sdk";

describe("AircraftLabelsManager", () => {
  const mgr = new AircraftLabelsManager(40);

  test("formats callsign, flight level, and velocity indicators", () => {
    const targetClimbing: TargetWire = {
      address: "4840D6",
      callsign: "KLM1023",
      altitude: 35000,
      ground_speed: 450,
      source: "ModeS1090",
      last_seen_ms: Date.now(),
      vertical_rate: 1800,
    } as any;

    const htmlClimbing = mgr.formatLabel(targetClimbing, false, false);
    expect(htmlClimbing).toContain("KLM1023");
    expect(htmlClimbing).toContain("FL350↑");
    expect(htmlClimbing).toContain("450k");

    const targetDescending: TargetWire = {
      address: "A12345",
      callsign: "UAL100",
      altitude: 4000,
      ground_speed: 210,
      source: "ModeS1090",
      last_seen_ms: Date.now(),
      vertical_rate: -1200,
    } as any;

    const htmlDescending = mgr.formatLabel(targetDescending, false, false);
    expect(htmlDescending).toContain("UAL100");
    expect(htmlDescending).toContain("FL040↓");
    expect(htmlDescending).toContain("210k");
  });

  test("respects LOD zoom threshold and priority overrides", () => {
    // Normal aircraft
    expect(mgr.shouldShowLabel(8.0, false, false)).toBe(true);
    expect(mgr.shouldShowLabel(7.0, false, false)).toBe(false);

    // Selected aircraft always shows
    expect(mgr.shouldShowLabel(5.0, true, false)).toBe(true);

    // Emergency aircraft always shows
    expect(mgr.shouldShowLabel(5.0, false, true)).toBe(true);
  });

  test("resolves label screen collisions based on priority and distance", () => {
    const points = [
      { id: "A", x: 100, y: 100, priority: 10 },
      { id: "B", x: 110, y: 105, priority: 5 }, // Collides with A, lower priority
      { id: "C", x: 300, y: 300, priority: 2 }, // Far away, no collision
    ];

    const visible = mgr.resolveCollisions(points);
    expect(visible.has("A")).toBe(true);
    expect(visible.has("B")).toBe(false); // Decluttered
    expect(visible.has("C")).toBe(true);
  });

  test("builds composite marker HTML with wrapper container", () => {
    const labelHtml = '<div class="plane-label"><span class="label-cs">TEST</span></div>';
    const marker = mgr.buildMarkerHtml("Narrowbody", 180, 25000, false, labelHtml);

    expect(marker).toContain("plane-marker-wrapper");
    expect(marker).toContain("<svg");
    expect(marker).toContain("TEST");

    const selectedMarker = mgr.buildMarkerHtml("Narrowbody", 180, 25000, false, labelHtml, true);
    expect(selectedMarker).toContain("selected-plane");
  });

  test("toggles global label visibility while preserving selected and emergency labels", () => {
    const toggleMgr = new AircraftLabelsManager(40);
    expect(toggleMgr.isLabelsEnabled()).toBe(true);
    expect(toggleMgr.shouldShowLabel(9.0, false, false)).toBe(true);

    expect(toggleMgr.toggleLabels()).toBe(false);
    expect(toggleMgr.isLabelsEnabled()).toBe(false);
    expect(toggleMgr.shouldShowLabel(9.0, false, false)).toBe(false);
    // Selected or emergency still show their label when global labels are off
    expect(toggleMgr.shouldShowLabel(9.0, true, false)).toBe(true);
    expect(toggleMgr.shouldShowLabel(9.0, false, true)).toBe(true);

    expect(toggleMgr.toggleLabels()).toBe(true);
    expect(toggleMgr.shouldShowLabel(9.0, false, false)).toBe(true);
  });
});
