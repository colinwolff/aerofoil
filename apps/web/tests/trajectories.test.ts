import { describe, expect, test } from "bun:test";
import { AirspaceRadarManager } from "../src/radar";
import { MapLibreTrajectoryManager } from "../src/layers/MapLibreTrajectoryManager";
import { bindToolbar } from "../src/components/ToolbarBinder";

describe("MapLibreTrajectoryManager", () => {
  test("toggles trails between selected and all modes", () => {
    let currentData: any = null;
    const mockSource = {
      setData: (data: any) => {
        currentData = data;
      },
    };
    const mockMap = {
      getSource: (_id: string) => mockSource,
      addSource: () => {},
      addLayer: () => {},
    };

    const manager = new MapLibreTrajectoryManager();
    expect(manager.getTrailsMode()).toBe("selected");

    // Add trajectory for two aircraft: address, lon, lat, altMeters
    manager.addCoordinate("4840D6", 4.9, 52.3, 3000, 500);
    manager.addCoordinate("4840D6", 4.91, 52.31, 3100, 500);

    manager.addCoordinate("40621D", -0.1, 51.5, 6000, -200);
    manager.addCoordinate("40621D", -0.11, 51.51, 5900, -200);

    // In default "selected" mode with no selection, features should be 0
    manager.update(mockMap as any, true);
    expect(currentData).not.toBeNull();
    expect(currentData.features.length).toBe(0);

    // Toggle to "all" mode: both trajectories appear
    const isAll = manager.toggleAllTrails();
    expect(isAll).toBe(true);
    expect(manager.getTrailsMode()).toBe("all");
    manager.update(mockMap as any, true);
    expect(currentData.features.length).toBe(2);

    // Toggle back to "selected" mode
    const isSelected = manager.toggleAllTrails();
    expect(isSelected).toBe(false);
    expect(manager.getTrailsMode()).toBe("selected");
    manager.update(mockMap as any, true);
    expect(currentData.features.length).toBe(0);

    // Set selected ICAO
    manager.setSelectedIcaos(new Set(["4840D6"]));
    manager.update(mockMap as any, true);
    expect(currentData.features.length).toBe(1);
    expect(currentData.features[0].properties.address).toBe("4840D6");
  });
});

describe("AirspaceRadarManager Trajectory & Selection", () => {
  test("supports multi-target selection and trails toggle", () => {
    let capturedTrailsMode = "";
    let capturedSelected: string[] = [];
    const mockEngine = {
      updateTargetMarker: () => {},
      updateTargetTrajectory: () => {},
      trajectoryManager: {
        setTrailsMode: (m: string) => {
          capturedTrailsMode = m;
        },
        setSelectedIcaos: (icaos: Set<string>) => {
          capturedSelected = Array.from(icaos);
        },
      },
    };

    const manager = new AirspaceRadarManager(mockEngine);
    manager.selectTarget("A00001", false);
    expect(manager.getSelectedIcaos().has("A00001")).toBe(true);
    expect(manager.getSelectedIcaos().size).toBe(1);
    expect(capturedSelected).toContain("A00001");

    // Multi-select A00002
    manager.selectTarget("A00002", true);
    expect(manager.getSelectedIcaos().has("A00001")).toBe(true);
    expect(manager.getSelectedIcaos().has("A00002")).toBe(true);
    expect(manager.getSelectedIcaos().size).toBe(2);
    expect(capturedSelected).toContain("A00001");
    expect(capturedSelected).toContain("A00002");

    // Toggle trails
    const allActive = manager.toggleAllTrails();
    expect(allActive).toBe(true);
    expect(capturedTrailsMode).toBe("all");
  });
});

describe("ToolbarBinder Hotkey T", () => {
  test("dispatches toggleAllTrails on keydown 't' or 'T'", () => {
    let toggled = false;
    const mockRadarManager = {
      toggleAllTrails: () => {
        toggled = true;
        return true;
      },
    };

    const origDoc = globalThis.document;
    const origWin = globalThis.window;
    let keyHandler: any = null;

    globalThis.document = {
      getElementById: () => null,
    } as any;
    globalThis.window = {
      addEventListener: (evt: string, handler: any) => {
        if (evt === "keydown") {
          keyHandler = handler;
        }
      },
    } as any;

    try {
      bindToolbar(
        {} as any,
        { getConfig: () => ({}) } as any,
        {} as any,
        { getActiveEngine: () => ({}) } as any,
        mockRadarManager as any,
      );

      expect(keyHandler).toBeDefined();

      // Simulate input event - should NOT toggle
      keyHandler({ key: "t", target: { tagName: "INPUT" } });
      expect(toggled).toBe(false);

      // Simulate pressing 't' on map/body - SHOULD toggle
      keyHandler({ key: "t", target: { tagName: "DIV" } });
      expect(toggled).toBe(true);
    } finally {
      globalThis.document = origDoc;
      globalThis.window = origWin;
    }
  });
});
