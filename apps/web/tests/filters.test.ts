import { describe, expect, test } from "bun:test";
import {
  DEFAULT_FILTER_CRITERIA,
  isFilterActive,
  matchesFilter,
  type AirspaceFilterCriteria,
} from "../src/components/AirspaceFilters";
import { AirspaceRadarManager } from "../src/radar";
import { AirspaceFilterBar } from "../src/components/AirspaceFilterBar";
import type { TargetWire } from "@aerofoil-rs/sdk";

describe("AirspaceFilters Predicates", () => {
  const targetUAL: TargetWire = {
    schema: "aerofoil.target",
    version: 1,
    address: "A00001",
    address_type: "Icao",
    callsign: "UAL102",
    altitude: 35000,
    ground_speed: 460,
    source: "ModeS1090",
    last_seen_ms: 1000,
  };

  const targetDAL: TargetWire = {
    schema: "aerofoil.target",
    version: 1,
    address: "A00002",
    address_type: "Icao",
    callsign: "DAL45",
    altitude: 12000,
    ground_speed: 280,
    source: "ModeS1090",
    last_seen_ms: 2000,
  };

  const targetUAT: TargetWire = {
    schema: "aerofoil.target",
    version: 1,
    address: "A00003",
    address_type: "Icao",
    callsign: "N12345",
    altitude: 4500,
    ground_speed: 135,
    source: "Uat978",
    last_seen_ms: 3000,
  };

  const targetMLAT: TargetWire = {
    schema: "aerofoil.target",
    version: 1,
    address: "A00004",
    address_type: "Icao",
    callsign: "AFR22",
    altitude: 38000,
    ground_speed: 490,
    source: "ModeS1090",
    reception: "Mlat",
    last_seen_ms: 4000,
  };

  test("matches callsign with case-insensitive regex query", () => {
    const criteria: AirspaceFilterCriteria = {
      ...DEFAULT_FILTER_CRITERIA,
      query: "^ual|dal",
      sources: { ...DEFAULT_FILTER_CRITERIA.sources },
    };
    expect(matchesFilter(targetUAL, criteria)).toBe(true);
    expect(matchesFilter(targetDAL, criteria)).toBe(true);
    expect(matchesFilter(targetUAT, criteria)).toBe(false);
    expect(matchesFilter(targetMLAT, criteria)).toBe(false);
  });

  test("matches ICAO address when callsign is absent", () => {
    const noCallsign: TargetWire = {
      schema: "aerofoil.target",
      version: 1,
      address: "4840D6",
      source: "ModeS1090",
      last_seen_ms: 1000,
    };
    const criteria: AirspaceFilterCriteria = {
      ...DEFAULT_FILTER_CRITERIA,
      query: "4840D6",
      sources: { ...DEFAULT_FILTER_CRITERIA.sources },
    };
    expect(matchesFilter(noCallsign, criteria)).toBe(true);
  });

  test("handles invalid regex syntax gracefully via substring fallback", () => {
    const criteria: AirspaceFilterCriteria = {
      ...DEFAULT_FILTER_CRITERIA,
      query: "[unclosed",
      sources: { ...DEFAULT_FILTER_CRITERIA.sources },
    };
    expect(matchesFilter(targetUAL, criteria)).toBe(false);
  });

  test("filters targets within altitude bounds", () => {
    const criteria: AirspaceFilterCriteria = {
      ...DEFAULT_FILTER_CRITERIA,
      minAltitudeFt: 10000,
      maxAltitudeFt: 30000,
      sources: { ...DEFAULT_FILTER_CRITERIA.sources },
    };
    expect(matchesFilter(targetUAL, criteria)).toBe(false); // 35000 > 30000
    expect(matchesFilter(targetDAL, criteria)).toBe(true);  // 12000 in [10000, 30000]
    expect(matchesFilter(targetUAT, criteria)).toBe(false); // 4500 < 10000
  });

  test("filters targets within ground speed bounds", () => {
    const criteria: AirspaceFilterCriteria = {
      ...DEFAULT_FILTER_CRITERIA,
      minSpeedKt: 200,
      maxSpeedKt: 400,
      sources: { ...DEFAULT_FILTER_CRITERIA.sources },
    };
    expect(matchesFilter(targetUAL, criteria)).toBe(false); // 460 > 400
    expect(matchesFilter(targetDAL, criteria)).toBe(true);  // 280 in [200, 400]
    expect(matchesFilter(targetUAT, criteria)).toBe(false); // 135 < 200
  });

  test("filters by surveillance reception provenance (1090ES, UAT, MLAT)", () => {
    const noMlatCriteria: AirspaceFilterCriteria = {
      ...DEFAULT_FILTER_CRITERIA,
      sources: { adsb: true, uat: true, mlat: false },
    };
    expect(matchesFilter(targetMLAT, noMlatCriteria)).toBe(false);
    expect(matchesFilter(targetUAL, noMlatCriteria)).toBe(true);

    const uatOnlyCriteria: AirspaceFilterCriteria = {
      ...DEFAULT_FILTER_CRITERIA,
      sources: { adsb: false, uat: true, mlat: false },
    };
    expect(matchesFilter(targetUAT, uatOnlyCriteria)).toBe(true);
    expect(matchesFilter(targetUAL, uatOnlyCriteria)).toBe(false);
  });

  test("detects active filter state accurately", () => {
    expect(isFilterActive(DEFAULT_FILTER_CRITERIA)).toBe(false);
    expect(isFilterActive({ ...DEFAULT_FILTER_CRITERIA, query: "UAL" })).toBe(true);
    expect(isFilterActive({ ...DEFAULT_FILTER_CRITERIA, minAltitudeFt: 5000 })).toBe(true);
  });
});

describe("AirspaceRadarManager Filter Integration", () => {
  test("updates visible targets and removes excluded markers from engine", () => {
    const removedMarkers: string[] = [];
    const updatedMarkers: string[] = [];
    const mockEngine = {
      updateTargetMarker: (key: string) => {
        updatedMarkers.push(key);
      },
      removeTargetMarker: (key: string) => {
        removedMarkers.push(key);
      },
    };

    const manager = new AirspaceRadarManager(mockEngine);
    manager.updateTarget({
      schema: "aerofoil.target",
      version: 1,
      address: "A00001",
      address_type: "Icao",
      callsign: "UAL100",
      altitude: 35000,
      lat: 52.0,
      lon: 4.0,
      source: "ModeS1090",
      last_seen_ms: 1000,
    });
    manager.updateTarget({
      schema: "aerofoil.target",
      version: 1,
      address: "A00002",
      address_type: "Icao",
      callsign: "DAL200",
      altitude: 15000,
      lat: 52.1,
      lon: 4.1,
      source: "ModeS1090",
      last_seen_ms: 1000,
    });

    expect(updatedMarkers).toContain("A00001");
    expect(updatedMarkers).toContain("A00002");

    // Apply filter matching only UAL
    manager.setFilterCriteria({
      ...DEFAULT_FILTER_CRITERIA,
      query: "UAL",
      sources: { ...DEFAULT_FILTER_CRITERIA.sources },
    });

    expect(removedMarkers).toContain("A00002");
  });

  test("reuses precompiled RegExp across consecutive calls and updates when query changes", () => {
    const tUal: TargetWire = {
      schema: "aerofoil.target", version: 1, address: "A00001",
      callsign: "UAL102", source: "ModeS1090", last_seen_ms: 1000,
    };
    const tDal: TargetWire = {
      schema: "aerofoil.target", version: 1, address: "A00002",
      callsign: "DAL45", source: "ModeS1090", last_seen_ms: 2000,
    };
    const q1: AirspaceFilterCriteria = {
      ...DEFAULT_FILTER_CRITERIA,
      query: "^UAL\\d+$",
      sources: { ...DEFAULT_FILTER_CRITERIA.sources },
    };
    const origRegExp = globalThis.RegExp;
    let compileCount = 0;
    (globalThis as any).RegExp = function (pattern: any, flags?: any) {
      compileCount++;
      return new origRegExp(pattern, flags);
    };
    try {
      expect(matchesFilter(tUal, q1)).toBe(true);
      expect(matchesFilter(tDal, q1)).toBe(false);
      expect(compileCount).toBe(1);

      const q2: AirspaceFilterCriteria = {
        ...DEFAULT_FILTER_CRITERIA,
        query: "^DAL\\d+$",
        sources: { ...DEFAULT_FILTER_CRITERIA.sources },
      };
      expect(matchesFilter(tDal, q2)).toBe(true);
      expect(compileCount).toBe(2);
    } finally {
      globalThis.RegExp = origRegExp;
    }
  });
});
