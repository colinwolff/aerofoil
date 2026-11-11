import { describe, expect, test } from "bun:test";
import {
  classifyAirframe,
  getAltitudeColor,
  renderAircraftSvg,
} from "../src/icons/AircraftIconMatrix";
import { destinationPoint, DynamicRingsLayer } from "../src/layers/DynamicRingsLayer";
import { AntennaCoverageLayer, calculateBearingAndDistance } from "../src/layers/AntennaCoverageLayer";
import { BASEMAPS, BaseMapManager } from "../src/layers/BaseMapRegistry";
import { WeatherRadarLayer } from "../src/layers/WeatherRadarLayer";

describe("AircraftIconMatrix", () => {
  test("classifies airframe categories accurately", () => {
    expect(classifyAirframe("MEDIC1", 1200, 85)).toBe("Rotorcraft");
    expect(classifyAirframe("RESCUE9", 800, 110)).toBe("Rotorcraft");
    expect(classifyAirframe("UAV-01", 15000, 120)).toBe("Drone");
    expect(classifyAirframe("GLIDER3", 3500, 55)).toBe("Glider");
    expect(classifyAirframe(undefined, 25, 10)).toBe("GroundVehicle");
    expect(classifyAirframe("VIPER1", 22000, 620)).toBe("Fighter");
    expect(classifyAirframe("BAW431", 34000, 460)).toBe("Widebody");
    expect(classifyAirframe("KLM1023", 4000, 190)).toBe("Narrowbody");
    expect(classifyAirframe("N172SP", 4500, 115)).toBe("LightPiston");
    expect(classifyAirframe("BEECH", 14000, 240)).toBe("TwinTurboprop");
    expect(classifyAirframe(undefined, undefined, undefined)).toBe("Unknown");
  });

  test("computes altitude colors and emergency glow", () => {
    expect(getAltitudeColor(300, false)).toBe("#a3e635"); // Ground / Low
    expect(getAltitudeColor(5000, false)).toBe("#38bdf8"); // Low/Medium
    expect(getAltitudeColor(18000, false)).toBe("#818cf8"); // Mid
    expect(getAltitudeColor(35000, false)).toBe("#c084fc"); // High Cruise
    expect(getAltitudeColor(43000, false)).toBe("#f472b6"); // Stratospheric
    expect(getAltitudeColor(35000, true)).toBe("#ef4444"); // Emergency
  });

  test("renders valid SVG markup with heading transform and fill", () => {
    const svg = renderAircraftSvg("Widebody", 180, 35000, false);
    expect(svg).toContain("<svg");
    expect(svg).toContain("transform: rotate(180deg)");
    expect(svg).toContain("#c084fc");
    expect(svg).toContain("</svg>");
  });

  test("renders emergency pulsing class when emergency is active", () => {
    const svg = renderAircraftSvg("Rotorcraft", 90, 1500, true);
    expect(svg).toContain('class="emergency-pulse"');
    expect(svg).toContain("#ef4444");
  });
});

describe("DynamicRingsLayer Geodesic Math", () => {
  test("computes destination points along north bearing", () => {
    const startLat = 52.0;
    const startLon = 4.0;
    // 60 nm north should be exactly 1 degree latitude
    const distanceMeters = 60 * 1852;
    const [destLat, destLon] = destinationPoint(startLat, startLon, 0, distanceMeters);

    expect(destLat).toBeCloseTo(53.0, 1);
    expect(destLon).toBeCloseTo(4.0, 1);
  });

  test("manages presets and azimuth intervals", () => {
    const mockEngine: any = {
      setParametricCircles: () => {},
      setParametricLines: () => {},
      removeParametricLayer: () => {},
    };
    const rings = new DynamicRingsLayer(mockEngine, 52.3, 4.9);
    expect(rings.getRings()).toEqual([10, 25, 50, 100]);

    rings.applyPreset("approach");
    expect(rings.getRings()).toEqual([5, 10, 20]);

    rings.setRings([15, 30, 45]);
    expect(rings.getRings()).toEqual([15, 30, 45]);

    rings.setAzimuthInterval(15);
    expect(rings.getAzimuthInterval()).toBe(15);

    rings.setAzimuthInterval(0);
    expect(rings.getAzimuthInterval()).toBe(0);
  });
});

describe("BaseMapRegistry", () => {
  test("registers FAA VFR Sectional and IFR Enroute Low endpoints", () => {
    const mgr = new BaseMapManager();
    const basemaps = mgr.getAvailableBasemaps();
    expect(basemaps.length).toBeGreaterThanOrEqual(4);

    const vfr = BASEMAPS.faa_vfr_sectional;
    expect(vfr).toBeDefined();
    expect(vfr.isOfficialFAA).toBe(true);
    expect(vfr.license).toBe("US Public Domain");
    expect(vfr.minZoom).toBe(7);
    expect(vfr.maxNativeZoom).toBe(12);
    expect(vfr.pane).toBe("chartsPane");

    const ifr = BASEMAPS.faa_ifr_low;
    expect(ifr).toBeDefined();
    expect(ifr.isOfficialFAA).toBe(true);
    expect(ifr.minZoom).toBe(4);
    expect(ifr.maxNativeZoom).toBe(11);
    expect(ifr.pane).toBe("chartsPane");

    const openaip = BASEMAPS.openaip;
    expect(openaip).toBeDefined();
    expect(openaip.tms).toBe(true);
    expect(openaip.pane).toBe("chartsPane");
  });

  test("manages active basemap selection", () => {
    const mgr = new BaseMapManager();
    expect(mgr.getActiveBasemap().id).toBe("osm_dark");

    mgr.setBasemap("carto_dark");
    expect(mgr.getActiveBasemap().id).toBe("carto_dark");
  });
});

describe("AntennaCoverageLayer", () => {
  test("calculates bearing and distance accurately", () => {
    // Due north 1 degree latitude (~60 nm)
    const [bearing, distNm] = calculateBearingAndDistance(52.0, 4.0, 53.0, 4.0);
    expect(bearing).toBeCloseTo(0, 0);
    expect(distNm).toBeCloseTo(60, 0);
  });

  test("records target signals and updates max range bins", () => {
    const mockEngine: any = {
      setParametricCircles: () => {},
      setParametricLines: () => {},
      removeParametricLayer: () => {},
    };
    const antenna = new AntennaCoverageLayer(mockEngine, 52.0, 4.0);
    antenna.recordTargetSignal(53.0, 4.0, -15, 30000);

    const stats = antenna.getStats();
    expect(stats.activeBins).toBeGreaterThanOrEqual(1);
    expect(stats.maxRangeNm).toBeCloseTo(60, 0);

    antenna.clear();
    const cleared = antenna.getStats();
    expect(cleared.activeBins).toBe(0);
    expect(cleared.maxRangeNm).toBe(0);
  });
});

describe("WeatherRadarLayer Cached Playback", () => {
  test("preloads adjacent frames and swaps opacity instead of recreating layers", () => {
    const layers: Map<string, { opacity: number; url: string }> = new Map();
    const mockEngine: any = {
      addOverlayTileLayer: (id: string, url: string, _attr: string, opts: any) => {
        layers.set(id, { opacity: opts.opacity, url });
      },
      setLayerOpacity: (id: string, opacity: number) => {
        const lyr = layers.get(id);
        if (lyr) lyr.opacity = opacity;
      },
      removeTileLayer: (id: string) => {
        layers.delete(id);
      },
    };

    const weather = new WeatherRadarLayer(mockEngine);
    (weather as any).frames = [
      { time: 1000, path: "/v2/radar/1000" },
      { time: 1600, path: "/v2/radar/1600" },
      { time: 2200, path: "/v2/radar/2200" },
    ];
    (weather as any).currentFrameIndex = 0;

    // Enabling weather mounts frame 0 at opacity 0.65 and preloads adjacent frame 1 & 2 at 0
    weather.setVisible(true);
    expect(layers.size).toBe(3);
    expect(layers.get("rainviewer_1000")?.opacity).toBe(0.65);
    expect(layers.get("rainviewer_1600")?.opacity).toBe(0);
    expect(layers.get("rainviewer_2200")?.opacity).toBe(0);

    // Stepping to frame 1 sets frame 0 to 0 and frame 1 to 0.65 without recreating layers
    weather.setFrameIndex(1);
    expect(layers.get("rainviewer_1000")?.opacity).toBe(0);
    expect(layers.get("rainviewer_1600")?.opacity).toBe(0.65);

    // Dynamic opacity update alters the active frame
    weather.setOpacity(0.85);
    expect(layers.get("rainviewer_1600")?.opacity).toBe(0.85);
    expect(layers.get("rainviewer_1000")?.opacity).toBe(0);

    // Disabling clears all cached layers cleanly
    weather.setVisible(false);
    expect(layers.size).toBe(0);
  });
});

