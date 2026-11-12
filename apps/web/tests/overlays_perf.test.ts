import { describe, expect, test } from "bun:test";
import { AntennaCoverageLayer } from "../src/layers/AntennaCoverageLayer";
import { MapLibreVectorManager } from "../src/layers/MapLibreVectorManager";

describe("AF-97 Vector Layer & AntennaCoverageLayer Optimizations", () => {
  test("setVectorLayer skips 2D draped vector lines when 3D polygon volumes are mounted", () => {
    const sources: Record<string, any> = {};
    const layers: Record<string, any> = {};
    const mockMap: any = {
      addSource: (id: string, cfg: any) => {
        const state = {
          data: cfg.data,
          setDataCalls: 0,
          setData: (next: any) => {
            state.data = next;
            state.setDataCalls += 1;
          },
        };
        sources[id] = state;
      },
      getSource: (id: string) => sources[id] ?? null,
      removeSource: (id: string) => {
        delete sources[id];
      },
      addLayer: (cfg: any) => {
        layers[cfg.id] = cfg;
      },
      getLayer: (id: string) => layers[id] ?? null,
      removeLayer: (id: string) => {
        delete layers[id];
      },
      on: () => {},
    };

    const mgr = new MapLibreVectorManager(
      () => mockMap,
      (cb) => cb(),
    );

    mgr.setVectorLayer("suas", {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "R-2508", class: "R", lower_alt: 0, upper_alt: 18000 },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    });

    expect(layers["vol-fill-suas"]).toBeDefined();
    expect(layers["vol-line-suas"]).toBeDefined();
    expect(layers["vector-lyr-suas"]).toBeUndefined();
    expect(sources["vector-src-suas"]).toBeUndefined();

    // Line-only overlays keep 2D vector lines because no 3D volume exists
    mgr.setVectorLayer("airways", {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "J1" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
      ],
    });
    expect(layers["vol-fill-airways"]).toBeUndefined();
    expect(layers["vector-lyr-airways"]).toBeDefined();
  });

  test("setParametricLines reuses GeoJSON source via setData instead of tearing down layers", () => {
    const sources: Record<string, any> = {};
    const layers: Record<string, any> = {};
    let addLayerCount = 0;
    let removeLayerCount = 0;
    const mockMap: any = {
      addSource: (id: string, cfg: any) => {
        const src = {
          data: cfg.data,
          setDataCalls: 0,
          setData: (next: any) => {
            src.data = next;
            src.setDataCalls += 1;
          },
        };
        sources[id] = src;
      },
      getSource: (id: string) => sources[id] ?? null,
      removeSource: (id: string) => {
        delete sources[id];
      },
      addLayer: (cfg: any) => {
        addLayerCount += 1;
        layers[cfg.id] = cfg;
      },
      getLayer: (id: string) => layers[id] ?? null,
      removeLayer: (id: string) => {
        removeLayerCount += 1;
        delete layers[id];
      },
      on: () => {},
    };

    const mgr = new MapLibreVectorManager(
      () => mockMap,
      (cb) => cb(),
    );
    mgr.setParametricLines("rings", [[[52, 4], [52.1, 4.1]]], { color: "#10b981" });
    mgr.setParametricLines("rings", [[[52, 4], [52.2, 4.2]]], { color: "#10b981" });

    expect(addLayerCount).toBe(1);
    expect(removeLayerCount).toBe(0);
    expect(sources["param-src-rings"].setDataCalls).toBe(1);
    expect(sources["param-src-rings"].data.features[0].geometry.coordinates[1]).toEqual([4.2, 52.2]);
  });

  test("AntennaCoverageLayer ignores sub-0.25nm jitter and throttles contour updates to 2s", () => {
    let contourUpdates = 0;
    const mockEngine: any = {
      setParametricCircles: () => {},
      setParametricLines: (id: string) => {
        if (id === "antenna_coverage_contour") contourUpdates += 1;
      },
      removeParametricLayer: () => {},
    };

    const originalNow = Date.now;
    let fakeNow = 10_000;
    Date.now = () => fakeNow;
    try {
      const antenna = new AntennaCoverageLayer(mockEngine, 52.0, 4.0);
      antenna.setVisible(true);

      // Initial 60 nm target (due north, odd+even check: 0 deg) renders immediately
      antenna.recordTargetSignal(53.0, 4.0);
      expect(contourUpdates).toBe(1);

      // Inside 2000ms cooldown, large jump (+6 nm) must stay throttled
      fakeNow = 11_000;
      antenna.recordTargetSignal(53.1, 4.0);
      expect(contourUpdates).toBe(1);

      // Flush once cooldown expires (>= 2000ms)
      fakeNow = 12_100;
      antenna.recordTargetSignal(53.11, 4.0);
      expect(contourUpdates).toBe(2);

      // Wait another 5s, send tiny +0.05nm jitter (< 0.25nm threshold): must NOT redraw
      fakeNow = 18_000;
      antenna.recordTargetSignal(53.1108, 4.0);
      expect(contourUpdates).toBe(2);
    } finally {
      Date.now = originalNow;
    }
  });
});
