import { describe, expect, test } from "bun:test";
import {
  parseUrlState,
  serializeUrlState,
  UrlStateManager,
  type AirspaceUrlState,
} from "../src/components/UrlStateManager";

describe("UrlStateManager Serialization & Parsing", () => {
  test("parses full URL search string into structured state", () => {
    const qs = "?lat=52.3676&lon=4.9041&z=9.5&mode=3D&pitch=60&bearing=45&icao=4840D6&q=KLM&flMin=100&flMax=400&spdMin=200&spdMax=500";
    const state = parseUrlState(qs);

    expect(state.lat).toBeCloseTo(52.3676);
    expect(state.lon).toBeCloseTo(4.9041);
    expect(state.zoom).toBe(9.5);
    expect(state.mode).toBe("3D");
    expect(state.pitch).toBe(60);
    expect(state.bearing).toBe(45);
    expect(state.icao).toBe("4840D6");
    expect(state.q).toBe("KLM");
    expect(state.flMin).toBe(100);
    expect(state.flMax).toBe(400);
    expect(state.spdMin).toBe(200);
    expect(state.spdMax).toBe(500);
  });

  test("handles empty or partial query strings safely", () => {
    const empty = parseUrlState("");
    expect(empty.lat).toBeUndefined();
    expect(empty.mode).toBeUndefined();

    const partial = parseUrlState("?icao=a1234f&z=11");
    expect(partial.icao).toBe("A1234F");
    expect(partial.zoom).toBe(11);
  });

  test("serializes structured state into standard query string", () => {
    const state: AirspaceUrlState = {
      lat: 37.7749,
      lon: -122.4194,
      zoom: 10,
      mode: "3D",
      pitch: 45,
      bearing: 180,
      icao: "A00001",
      q: "^UAL",
      flMin: 50,
      flMax: 350,
      spdMin: 150,
      spdMax: 450,
    };

    const qs = serializeUrlState(state);
    expect(qs).toContain("lat=37.7749");
    expect(qs).toContain("lon=-122.4194");
    expect(qs).toContain("z=10.0");
    expect(qs).toContain("mode=3D");
    expect(qs).toContain("pitch=45");
    expect(qs).toContain("bearing=180");
    expect(qs).toContain("icao=A00001");
    expect(qs).toContain("q=%5EUAL");
    expect(qs).toContain("flMin=50");
    expect(qs).toContain("flMax=350");
  });

  test("omits default boundary values from serialized query string", () => {
    const state: AirspaceUrlState = {
      lat: 50.0,
      lon: 10.0,
      zoom: 8,
      mode: "2D",
      pitch: 0,
      bearing: 0,
      flMin: 0,
      flMax: 600,
      spdMin: 0,
      spdMax: 1200,
    };

    const qs = serializeUrlState(state);
    expect(qs).not.toContain("pitch");
    expect(qs).not.toContain("bearing");
    expect(qs).not.toContain("flMin");
    expect(qs).not.toContain("flMax");
    expect(qs).not.toContain("spdMin");
    expect(qs).not.toContain("spdMax");
  });
});

describe("UrlStateManager Application & History Sync", () => {
  test("applies parsed state to engine and radar manager", () => {
    let modeSet = "";
    let viewSet: [number, number, number] | null = null;
    let selectedIcao = "";

    const mockToggleMgr = {
      getMode: () => "2D",
      setMode: (m: string) => {
        modeSet = m;
      },
      getActiveEngine: () => ({
        setView: (lat: number, lon: number, z: number) => {
          viewSet = [lat, lon, z];
        },
        getZoom: () => 8,
        getCenter: () => [52.3, 4.9],
        onViewChange: () => {},
      }),
    };

    const mockRadarMgr = {
      selectTarget: (icao: string) => {
        selectedIcao = icao;
      },
      getSelectedIcao: () => selectedIcao,
      getFilterCriteria: () => ({
        query: "",
        minAltitudeFt: 0,
        maxAltitudeFt: 60000,
        minSpeedKt: 0,
        maxSpeedKt: 1200,
        sources: { adsb: true, uat: true, mlat: true },
      }),
    };

    const mgr = new UrlStateManager(mockToggleMgr as any, mockRadarMgr as any);
    mgr.applyState({
      mode: "3D",
      lat: 46.8523,
      lon: -121.7603,
      zoom: 11,
      icao: "N12345",
    });

    expect(modeSet).toBe("3D");
    expect(viewSet).toEqual([46.8523, -121.7603, 11]);
    expect(selectedIcao).toBe("N12345");
  });

  test("syncs URL to history via replaceState", () => {
    const mockToggleMgr = {
      getMode: () => "2D",
      getActiveEngine: () => ({
        getCenter: () => [52.3676, 4.9041],
        getZoom: () => 9.2,
      }),
    };

    const mockRadarMgr = {
      getSelectedIcao: () => "4840D6",
      getFilterCriteria: () => ({
        query: "KLM",
        minAltitudeFt: 10000,
        maxAltitudeFt: 35000,
        minSpeedKt: 250,
        maxSpeedKt: 500,
        sources: { adsb: true, uat: true, mlat: true },
      }),
    };

    let replacedUrl = "";
    const origWindow = globalThis.window;
    globalThis.window = {
      location: {
        pathname: "/radar",
        search: "",
        hash: "",
      },
      history: {
        replaceState: (_data: any, _title: string, url: string) => {
          replacedUrl = url;
        },
      },
      addEventListener: () => {},
    } as any;

    try {
      const mgr = new UrlStateManager(mockToggleMgr as any, mockRadarMgr as any);
      mgr.syncUrl();

      expect(replacedUrl).toContain("/radar?");
      expect(replacedUrl).toContain("lat=52.3676");
      expect(replacedUrl).toContain("lon=4.9041");
      expect(replacedUrl).toContain("z=9.2");
      expect(replacedUrl).toContain("icao=4840D6");
      expect(replacedUrl).toContain("q=KLM");
      expect(replacedUrl).toContain("flMin=100");
      expect(replacedUrl).toContain("flMax=350");
    } finally {
      globalThis.window = origWindow;
    }
  });
});
