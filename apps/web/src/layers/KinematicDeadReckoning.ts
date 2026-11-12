//! KinematicDeadReckoning — 60 FPS flat-earth dead-reckoning and C0 smooth fix-blend helper.

export interface KinematicState {
  lon: number;
  lat: number;
  altMeters: number;
  heading: number;
  groundSpeedKts?: number;
  verticalRateFpm?: number;
  updatedAtMs?: number;
  errLon?: number;
  errLat?: number;
  errAlt?: number;
}

export interface PredictedPosition {
  lon: number;
  lat: number;
  altMeters: number;
}

const MAX_EXTRAPOLATION_SEC = 2.0;

export function isActivelyExtrapolating(s: KinematicState, nowMs: number): boolean {
  const spd = s.groundSpeedKts ?? 0;
  if (spd < 20 || spd >= 1200 || s.updatedAtMs == null) return false;
  return nowMs - s.updatedAtMs < MAX_EXTRAPOLATION_SEC * 1000;
}

export function deadReckonInto(s: KinematicState, nowMs: number, out: PredictedPosition): void {
  const baseAlt = Number.isFinite(s.altMeters) ? s.altMeters : 0;
  const spd = s.groundSpeedKts ?? 0;
  if (spd < 20 || spd >= 1200 || s.updatedAtMs == null) {
    out.lon = s.lon;
    out.lat = s.lat;
    out.altMeters = Math.max(0, baseAlt);
    return;
  }

  const dt = Math.min(MAX_EXTRAPOLATION_SEC, Math.max(0, (nowMs - s.updatedAtMs) / 1000));
  const mps = spd * 0.514444;
  const rad = (s.heading * Math.PI) / 180;
  const dLat = (mps * dt * Math.cos(rad)) / 111_320;
  const cosLat = Math.max(0.1, Math.cos((s.lat * Math.PI) / 180));
  const dLon = (mps * dt * Math.sin(rad)) / (111_320 * cosLat);
  const vMps = (s.verticalRateFpm ?? 0) * 0.00508;
  const blend = Math.exp(-dt * 8.0);

  out.lat = s.lat + dLat + (s.errLat ?? 0) * blend;
  out.lon = s.lon + dLon + (s.errLon ?? 0) * blend;
  out.altMeters = Math.max(0, baseAlt + vMps * dt + (s.errAlt ?? 0) * blend);
}

export function computeFixError(
  prev: KinematicState | undefined,
  newLon: number,
  newLat: number,
  newAltMeters: number,
  nowMs: number,
): { errLon: number; errLat: number; errAlt: number } {
  if (!prev) return { errLon: 0, errLat: 0, errAlt: 0 };
  const scratch = { lon: 0, lat: 0, altMeters: 0 };
  deadReckonInto(prev, nowMs, scratch);
  const dLon = scratch.lon - newLon;
  const dLat = scratch.lat - newLat;
  const dAlt = scratch.altMeters - newAltMeters;
  // Reset blend if target jumped > ~5 km to avoid unrealistic rubber-banding
  if (Math.abs(dLon) > 0.05 || Math.abs(dLat) > 0.05) {
    return { errLon: 0, errLat: 0, errAlt: 0 };
  }
  return { errLon: dLon, errLat: dLat, errAlt: dAlt };
}
