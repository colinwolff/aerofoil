//! Pure filtering predicates and criteria models for surveillance targets.

import type { TargetWire } from "@aerofoil-rs/sdk";

export interface AirspaceFilterCriteria {
  query: string;
  minAltitudeFt: number;
  maxAltitudeFt: number;
  minSpeedKt: number;
  maxSpeedKt: number;
  sources: {
    adsb: boolean;
    uat: boolean;
    mlat: boolean;
  };
}

export const DEFAULT_FILTER_CRITERIA: AirspaceFilterCriteria = {
  query: "",
  minAltitudeFt: 0,
  maxAltitudeFt: 60000,
  minSpeedKt: 0,
  maxSpeedKt: 1200,
  sources: {
    adsb: true,
    uat: true,
    mlat: true,
  },
};

export function isFilterActive(c: AirspaceFilterCriteria): boolean {
  return (
    c.query.trim().length > 0 ||
    c.minAltitudeFt > 0 ||
    c.maxAltitudeFt < 60000 ||
    c.minSpeedKt > 0 ||
    c.maxSpeedKt < 1200 ||
    !c.sources.adsb ||
    !c.sources.uat ||
    !c.sources.mlat
  );
}

let cachedQueryStr: string | null = null;
let cachedRegex: RegExp | null = null;
let cachedLower: string = "";

function compileQueryMatcher(q: string): { regex: RegExp | null; lower: string } {
  if (cachedQueryStr === q) return { regex: cachedRegex, lower: cachedLower };
  cachedQueryStr = q;
  cachedLower = q.toLowerCase();
  try {
    cachedRegex = new RegExp(q, "i");
  } catch {
    cachedRegex = null;
  }
  return { regex: cachedRegex, lower: cachedLower };
}

export function matchesFilter(target: TargetWire, c: AirspaceFilterCriteria): boolean {
  const q = c.query.trim();
  if (q) {
    const { regex, lower } = compileQueryMatcher(q);
    const matched = regex
      ? regex.test(target.callsign ?? "") || regex.test(target.address)
      : (target.callsign?.toLowerCase().includes(lower) ?? false) || target.address.toLowerCase().includes(lower);
    if (!matched) return false;
  }

  if (target.altitude != null) {
    if (target.altitude < c.minAltitudeFt || target.altitude > c.maxAltitudeFt) {
      return false;
    }
  }

  const speed = target.ground_speed_knots ?? target.ground_speed;
  if (speed != null) {
    if (speed < c.minSpeedKt || speed > c.maxSpeedKt) {
      return false;
    }
  }

  const isMlat = target.reception === "Mlat";
  if (isMlat && !c.sources.mlat) return false;

  const src = String(target.source || "").toLowerCase();
  const isUat = src.includes("uat") || src.includes("978");
  const isAdsb = src.includes("modes") || src.includes("1090") || src.includes("adsb");

  if (isUat && !c.sources.uat) return false;
  if (isAdsb && !isMlat && !c.sources.adsb) return false;

  return true;
}
