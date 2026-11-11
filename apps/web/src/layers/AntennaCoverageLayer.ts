//! AntennaCoverageLayer — Tracks empirical maximum reception range and radio line-of-sight elevation masks.
//! Records 360-degree polar reception contours and theoretical 10k/20k/30k ft radio horizon circles.

import type { AirspaceMapEngine } from "./AirspaceMapEngine";
import { destinationPoint } from "./DynamicRingsLayer";

const METERS_PER_NAUTICAL_MILE = 1852;
const EARTH_RADIUS_METERS = 6_371_000;

export interface AntennaStats {
  maxRangeNm: number;
  avgRangeNm: number;
  activeBins: number;
}

export function calculateBearingAndDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): [number, number] {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceNm = (EARTH_RADIUS_METERS * c) / METERS_PER_NAUTICAL_MILE;

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  let bearingDeg = (Math.atan2(y, x) * 180) / Math.PI;
  if (bearingDeg < 0) bearingDeg += 360;

  return [bearingDeg, distanceNm];
}

export class AntennaCoverageLayer {
  private maxRangeBinsNm: Float32Array = new Float32Array(360);
  private visible: boolean = false;
  private dirty: boolean = false;
  private rxAltitudeFt: number = 50;

  constructor(
    private engine: AirspaceMapEngine,
    private centerLat: number = 52.3676,
    private centerLon: number = 4.9041,
  ) {}

  public setCenter(lat: number, lon: number): void {
    this.centerLat = lat;
    this.centerLon = lon;
    if (this.visible) this.render();
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) {
      this.render();
    } else {
      this.engine.removeParametricLayer("antenna_los_masks");
      this.engine.removeParametricLayer("antenna_coverage_contour");
    }
  }

  public recordTargetSignal(lat: number, lon: number, _rssiDbfs?: number, _altFt?: number): void {
    const [bearing, distanceNm] = calculateBearingAndDistance(
      this.centerLat,
      this.centerLon,
      lat,
      lon,
    );

    if (distanceNm > 0 && distanceNm < 450) {
      const bin = Math.floor(bearing) % 360;
      if (distanceNm > this.maxRangeBinsNm[bin]) {
        this.maxRangeBinsNm[bin] = distanceNm;
        this.dirty = true;
      }
    }

    if (this.visible && this.dirty) {
      this.renderContour();
      this.dirty = false;
    }
  }

  public getStats(): AntennaStats {
    let max = 0;
    let sum = 0;
    let active = 0;
    for (let i = 0; i < 360; i++) {
      const val = this.maxRangeBinsNm[i];
      if (val > 0) {
        if (val > max) max = val;
        sum += val;
        active++;
      }
    }
    return {
      maxRangeNm: max,
      avgRangeNm: active > 0 ? sum / active : 0,
      activeBins: active,
    };
  }

  public clear(): void {
    this.maxRangeBinsNm.fill(0);
    this.dirty = true;
    if (this.visible) this.render();
  }

  public render(): void {
    if (!this.visible) return;

    // 1. Radio Horizon Line-of-Sight Masks at 10,000 ft, 20,000 ft, 30,000 ft
    // d = 1.23 * (sqrt(h_rx) + sqrt(h_tx))
    const sqrtRx = Math.sqrt(this.rxAltitudeFt);
    const losLevels = [
      { alt: 10_000, nm: 1.23 * (sqrtRx + Math.sqrt(10_000)) },
      { alt: 20_000, nm: 1.23 * (sqrtRx + Math.sqrt(20_000)) },
      { alt: 30_000, nm: 1.23 * (sqrtRx + Math.sqrt(30_000)) },
    ];

    const circles = losLevels.map((l) => ({
      center: [this.centerLat, this.centerLon] as [number, number],
      radiusMeters: l.nm * METERS_PER_NAUTICAL_MILE,
    }));

    this.engine.setParametricCircles("antenna_los_masks", circles, {
      color: "#a855f7", // Violet
      weight: 1.2,
      opacity: 0.45,
      dashArray: "3, 6",
    });

    this.renderContour();
  }

  private renderContour(): void {
    // 2. Build 360-degree closed polygon for empirical max range
    const contourPoints: [number, number][] = [];
    let hasData = false;

    for (let deg = 0; deg < 360; deg += 2) {
      const rangeNm = Math.max(5, this.maxRangeBinsNm[deg]);
      if (this.maxRangeBinsNm[deg] > 0) hasData = true;

      const pt = destinationPoint(
        this.centerLat,
        this.centerLon,
        deg,
        rangeNm * METERS_PER_NAUTICAL_MILE,
      );
      contourPoints.push(pt);
    }

    if (hasData && contourPoints.length > 0) {
      contourPoints.push(contourPoints[0]); // Close loop
      this.engine.setParametricLines("antenna_coverage_contour", [contourPoints], {
        color: "#10b981", // Emerald green contour
        weight: 2.0,
        opacity: 0.75,
      });
    }
  }
}
