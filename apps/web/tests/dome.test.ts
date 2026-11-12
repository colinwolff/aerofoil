import { describe, expect, test } from "bun:test";
import {
  generateDomeRibbonsGeoJson,
  generateDomeLabelsGeoJson,
  SurveillanceDome3dManager,
  type DomeTier,
} from "../src/layers/SurveillanceDome3dManager";

describe("SurveillanceDome3dManager Geometry", () => {
  const testTiers: DomeTier[] = [
    { flightLevel: 100, radiusNm: 25 },
    { flightLevel: 250, radiusNm: 60 },
  ];

  test("generates elevated 3D circular ribbon polygons at flight level tiers", () => {
    const geoJson = generateDomeRibbonsGeoJson(52.3676, 4.9041, testTiers);
    expect(geoJson.features.length).toBe(2);

    const tier1 = geoJson.features[0];
    expect(tier1.properties.flightLevel).toBe(100);
    expect(tier1.properties.radiusNm).toBe(25);
    // FL100 = 10000 ft * 0.3048 = 3048 m
    expect(tier1.properties.ceiling_m).toBeCloseTo(3048 + 35, 1);
    expect(tier1.properties.floor_m).toBeCloseTo(3048 - 35, 1);
    expect(tier1.geometry.type).toBe("Polygon");
    expect(tier1.geometry.coordinates[0].length).toBeGreaterThan(36); // Full circular polygon
  });

  test("generates floating 3D labels at cardinal azimuth intersections", () => {
    const geoJson = generateDomeLabelsGeoJson(52.3676, 4.9041, testTiers);
    // 2 tiers * 4 cardinal bearings (N, E, S, W) = 8 labels
    expect(geoJson.features.length).toBe(8);

    const firstLabel = geoJson.features[0];
    expect(firstLabel.properties.label).toBe("25 NM · FL100");
    expect(firstLabel.properties.alt_m).toBeCloseTo(3048, 1);
    expect(firstLabel.geometry.type).toBe("Point");
    expect(firstLabel.geometry.coordinates[2]).toBeCloseTo(3048, 1);
  });
});

describe("SurveillanceDome3dManager MapLibre Integration", () => {
  test("mounts fill-extrusion ribbon and symbol label layers on MapLibre map", () => {
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

    const domeMgr = new SurveillanceDome3dManager();
    domeMgr.setCenter(47.4502, -122.3088);
    domeMgr.setupDome(mockMap as any);

    expect(addedSources["surveillance-dome-src"]).toBeDefined();
    expect(addedSources["surveillance-dome-labels-src"]).toBeDefined();

    const ribbonLayer = addedLayers.find((l) => l.id === "surveillance-dome-ribbons");
    expect(ribbonLayer).toBeDefined();
    expect(ribbonLayer.type).toBe("fill-extrusion");

    const labelsLayer = addedLayers.find((l) => l.id === "surveillance-dome-labels");
    expect(labelsLayer).toBeDefined();
    expect(labelsLayer.type).toBe("symbol");

    // Toggle visibility
    domeMgr.setVisible(mockMap as any, false);
    expect(layoutProps["surveillance-dome-ribbons:visibility"]).toBe("none");
    expect(layoutProps["surveillance-dome-labels:visibility"]).toBe("none");

    // Remove dome
    domeMgr.removeDome(mockMap as any);
    expect(removedLayers).toContain("surveillance-dome-ribbons");
    expect(removedLayers).toContain("surveillance-dome-labels");
  });
});
