import { describe, expect, test } from "bun:test";
import {
  resolveAirspaceColor,
  toVolumetricGeoJson,
  AirspaceVolume3dManager,
} from "../src/layers/AirspaceVolume3dManager";

describe("AirspaceVolume3dManager Data Transformations", () => {
  test("resolves colors according to FAA and ICAO classification standards", () => {
    expect(resolveAirspaceColor({ class: "B" })).toBe("#2563eb"); // Blue
    expect(resolveAirspaceColor({ class: "C" })).toBe("#ec4899"); // Magenta
    expect(resolveAirspaceColor({ class: "D" })).toBe("#06b6d4"); // Cyan
    expect(resolveAirspaceColor({ class: "A" })).toBe("#7c3aed"); // Violet
    expect(resolveAirspaceColor({ type: "Prohibited" })).toBe("#ef4444"); // Red
    expect(resolveAirspaceColor({ type: "Restricted Area" })).toBe("#ef4444"); // Red
    expect(resolveAirspaceColor({ type: "MOA" })).toBe("#f59e0b"); // Amber
    expect(resolveAirspaceColor({})).toBe("#38bdf8"); // Default
  });

  test("calculates floor and ceiling altitudes in meters from feet MSL", () => {
    const rawGeoJson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            name: "Seattle Class B Shelf",
            class: "B",
            lower_alt: 3000,
            upper_alt: 10000,
          },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-122.5, 47.4],
                [-122.1, 47.4],
                [-122.1, 47.6],
                [-122.5, 47.6],
                [-122.5, 47.4],
              ],
            ],
          },
        },
      ],
    };

    const volData = toVolumetricGeoJson(rawGeoJson);
    expect(volData.features.length).toBe(1);

    const feat = volData.features[0];
    expect(feat.properties.color).toBe("#2563eb");
    expect(feat.properties.lower_alt).toBe(3000);
    expect(feat.properties.upper_alt).toBe(10000);
    expect(feat.properties.floor_m).toBeCloseTo(3000 * 0.3048, 1);
    expect(feat.properties.ceiling_m).toBeCloseTo(10000 * 0.3048, 1);
  });
});

describe("AirspaceVolume3dManager Map Integration", () => {
  test("mounts fill-extrusion and boundary line layers on MapLibre map", () => {
    const addedSources: Record<string, any> = {};
    const addedLayers: any[] = [];
    const removedLayers: string[] = [];
    const removedSources: string[] = [];
    const layoutProps: Record<string, any> = {};

    const mockMap = {
      addSource: (id: string, src: any) => {
        addedSources[id] = src;
      },
      addLayer: (layer: any) => {
        addedLayers.push(layer);
      },
      getLayer: (id: string) => (addedLayers.some((l) => l.id === id) ? {} : null),
      getSource: (id: string) => (addedSources[id] ? {} : null),
      removeLayer: (id: string) => {
        removedLayers.push(id);
      },
      removeSource: (id: string) => {
        removedSources.push(id);
      },
      setLayoutProperty: (id: string, prop: string, val: any) => {
        layoutProps[`${id}:${prop}`] = val;
      },
    };

    const mgr = new AirspaceVolume3dManager();
    const testGeoJson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Class C Core", class: "C", lower_alt: 0, upper_alt: 4000 },
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
    };

    mgr.setupVolume(mockMap as any, "classes", testGeoJson);

    expect(addedSources["vol-src-classes"]).toBeDefined();
    const fillLayer = addedLayers.find((l) => l.id === "vol-fill-classes");
    expect(fillLayer).toBeDefined();
    expect(fillLayer.type).toBe("fill-extrusion");
    expect(fillLayer.paint["fill-extrusion-height"]).toEqual(["get", "ceiling_m"]);
    expect(fillLayer.paint["fill-extrusion-base"]).toEqual(["get", "floor_m"]);

    const lineLayer = addedLayers.find((l) => l.id === "vol-line-classes");
    expect(lineLayer).toBeDefined();
    expect(lineLayer.type).toBe("line");

    // Toggle visibility
    mgr.setVolumesVisible(mockMap as any, false);
    expect(layoutProps["vol-fill-classes:visibility"]).toBe("none");
    expect(layoutProps["vol-line-classes:visibility"]).toBe("none");

    // Remove volume
    mgr.removeVolume(mockMap as any, "classes");
    expect(removedLayers).toContain("vol-fill-classes");
    expect(removedLayers).toContain("vol-line-classes");
    expect(removedSources).toContain("vol-src-classes");
  });
});
