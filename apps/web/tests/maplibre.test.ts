import { describe, expect, test } from "bun:test";
import { MapLibreTrajectoryManager } from "../src/layers/MapLibreTrajectoryManager";
import { MapLibreAltitudeStems } from "../src/layers/MapLibreAltitudeStems";
import { MapLibreTerrainHelper, DEFAULT_TERRARIUM_DEM } from "../src/layers/MapLibreTerrainHelper";
import { DEFAULT_CONFIG, loadConfigFromStorage } from "../src/components/MapConfigTypes";

describe("MapLibreTrajectoryManager", () => {
  test("maintains circular coordinate buffer per aircraft", () => {
    const mgr = new MapLibreTrajectoryManager();
    const address = "A1234F";

    for (let i = 0; i < 75; i++) {
      mgr.addCoordinate(address, -122.0 + i * 0.001, 37.0 + i * 0.001, 1000 + i * 10, 500);
    }

    const traj = (mgr as any).trajectories.get(address);
    expect(traj).toBeDefined();
    expect(traj.points.length).toBe(60); // Clamped to MAX_HISTORY_POINTS
    expect(traj.verticalRateFpm).toBe(500);
  });

  test("deduplicates identical coordinates", () => {
    const mgr = new MapLibreTrajectoryManager();
    const address = "C0FFEE";

    mgr.addCoordinate(address, 4.9041, 52.3676, 2500, 0);
    mgr.addCoordinate(address, 4.9041, 52.3676, 2500, 0);

    const traj = (mgr as any).trajectories.get(address);
    expect(traj.points.length).toBe(1);
  });

  test("removes stale target trajectories on removal", () => {
    const mgr = new MapLibreTrajectoryManager();
    mgr.addCoordinate("TARGET1", 10.0, 20.0, 5000, -300);
    expect((mgr as any).trajectories.has("TARGET1")).toBe(true);

    mgr.removeTarget("TARGET1");
    expect((mgr as any).trajectories.has("TARGET1")).toBe(false);
  });
});

describe("MapLibreAltitudeStems", () => {
  test("maintains targets and updates 3D drop-line coordinates", () => {
    const stems = new MapLibreAltitudeStems();
    stems.updateTarget("KLM101", 4.9041, 52.3676, 3048);

    const targets = (stems as any).targets;
    expect(targets.has("KLM101")).toBe(true);
    const target = targets.get("KLM101");
    expect(target.altMeters).toBe(3048);
    expect(target.lon).toBe(4.9041);
    expect(target.lat).toBe(52.3676);
  });

  test("removes target when target leaves airspace", () => {
    const stems = new MapLibreAltitudeStems();
    stems.updateTarget("EZY42", -0.12, 51.50, 1500);
    expect((stems as any).targets.has("EZY42")).toBe(true);

    stems.removeTarget("EZY42");
    expect((stems as any).targets.has("EZY42")).toBe(false);
  });

  test("filters out grounded targets with alt < 30m in geojson generation", () => {
    const stems = new MapLibreAltitudeStems();
    stems.updateTarget("GROUND1", 4.90, 52.36, 10);
    stems.updateTarget("AIR1", 4.92, 52.38, 2500);

    let capturedStems: any = null;
    let capturedShadows: any = null;
    const fakeMap: any = {
      getSource: (id: string) => {
        if (id === "altitude-stems-source") {
          return { setData: (data: any) => { capturedStems = data; } };
        }
        if (id === "altitude-shadows-source") {
          return { setData: (data: any) => { capturedShadows = data; } };
        }
        return null;
      },
    };

    (stems as any).lastFlushTime = -1000;
    stems.update(fakeMap);
    expect(capturedStems).toBeDefined();
    expect(capturedStems.features.length).toBe(1);
    expect(capturedStems.features[0].properties.address).toBe("AIR1");
    expect(capturedStems.features[0].geometry.coordinates).toEqual([
      [4.92, 52.38, 0],
      [4.92, 52.38, 2500],
    ]);

    expect(capturedShadows).toBeDefined();
    expect(capturedShadows.features.length).toBe(1);
    expect(capturedShadows.features[0].geometry.coordinates).toEqual([4.92, 52.38, 0]);
  });
});

describe("MapLibreTerrainHelper", () => {
  test("resolves default Mapterhorn Open Terrarium DEM endpoint with CORS", () => {
    const res = MapLibreTerrainHelper.resolveDemUrl("mapterhorn");
    expect(res.url).toBe(DEFAULT_TERRARIUM_DEM);
    expect(res.encoding).toBe("terrarium");
    expect(res.tileSize).toBe(512);
  });

  test("resolves AWS S3 Terrarium fallback endpoint", () => {
    const res = MapLibreTerrainHelper.resolveDemUrl("aws_terrarium");
    expect(res.url).toContain("s3.amazonaws.com/elevation-tiles-prod");
    expect(res.encoding).toBe("terrarium");
    expect(res.tileSize).toBe(256);
  });

  test("resolves MapTiler terrain-rgb endpoint with API key", () => {
    const res = MapLibreTerrainHelper.resolveDemUrl("maptiler", "", "test_key_123");
    expect(res.url).toContain("api.maptiler.com/tiles/terrain-rgb");
    expect(res.url).toContain("key=test_key_123");
    expect(res.encoding).toBe("mapbox");
  });

  test("resolves custom raster-dem URL template", () => {
    const custom = "https://custom.dem.org/{z}/{x}/{y}.png";
    const res = MapLibreTerrainHelper.resolveDemUrl("custom", custom);
    expect(res.url).toBe(custom);
    expect(res.encoding).toBe("terrarium");
  });

  test("enables and configures terrain on MapLibre map", () => {
    let terrainConfig: any = null;
    let hillshadeVisibility: string = "visible";
    const fakeMap: any = {
      sources: {} as Record<string, any>,
      layers: {} as Record<string, any>,
      getSource(id: string) { return this.sources[id]; },
      addSource(id: string, src: any) { this.sources[id] = src; },
      getLayer(id: string) { return this.layers[id]; },
      addLayer(lyr: any) { this.layers[lyr.id] = lyr; },
      setTerrain(cfg: any) { terrainConfig = cfg; },
      getTerrain() { return terrainConfig; },
      setLayoutProperty(id: string, prop: string, val: any) {
        if (id === "raster-dem-hillshade" && prop === "visibility") hillshadeVisibility = val;
      },
    };

    MapLibreTerrainHelper.enableTerrain(fakeMap, DEFAULT_TERRARIUM_DEM, 1.5, "terrarium", 512);
    expect(fakeMap.getSource("raster-dem-terrain")).toBeDefined();
    expect(fakeMap.getSource("raster-dem-terrain").tileSize).toBe(512);
    expect(fakeMap.getLayer("raster-dem-hillshade")).toBeDefined();
    expect(terrainConfig).toEqual({ source: "raster-dem-terrain", exaggeration: 1.5 });

    MapLibreTerrainHelper.setExaggeration(fakeMap, 2.0);
    expect(terrainConfig.exaggeration).toBe(2.0);

    MapLibreTerrainHelper.setHillshading(fakeMap, false);
    expect(hillshadeVisibility).toBe("none");

    MapLibreTerrainHelper.disableTerrain(fakeMap);
    expect(terrainConfig).toBeNull();
    expect(hillshadeVisibility).toBe("none");
  });
});

describe("MapConfigTypes", () => {
  test("provides standard default operator configuration with 3D DEM", () => {
    expect(DEFAULT_CONFIG.terrainEnabled).toBe(true);
    expect(DEFAULT_CONFIG.demProvider).toBe("mapterhorn");
    expect(DEFAULT_CONFIG.demExaggeration).toBe(1.5);
    expect(DEFAULT_CONFIG.ringIntervals).toEqual([10, 25, 50, 100]);
  });
});
