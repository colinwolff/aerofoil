//! Dynamic polar range rings and radial compass azimuths.
//! Computes geodesic rings and azimuths purely algorithmically via spherical trigonometry.

import type { AirspaceMapEngine } from "./AirspaceMapEngine";

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_NAUTICAL_MILE = 1852;

/// Calculates geodesic destination [lat, lon] from origin [lat, lon], bearing (deg), and distance (meters).
export function destinationPoint(
  latDeg: number,
  lonDeg: number,
  bearingDeg: number,
  distanceMeters: number,
): [number, number] {
  const delta = distanceMeters / EARTH_RADIUS_METERS;
  const theta = (bearingDeg * Math.PI) / 180;
  const phi1 = (latDeg * Math.PI) / 180;
  const lambda1 = (lonDeg * Math.PI) / 180;

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const sinDelta = Math.sin(delta);
  const cosDelta = Math.cos(delta);

  const phi2 = Math.asin(sinPhi1 * cosDelta + cosPhi1 * sinDelta * Math.cos(theta));
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * sinDelta * cosPhi1,
      cosDelta - sinPhi1 * Math.sin(phi2),
    );

  return [(phi2 * 180) / Math.PI, (lambda2 * 180) / Math.PI];
}

export class DynamicRingsLayer {
  private ringsNm: number[] = [10, 25, 50, 100];
  private azimuthIntervalDeg: number = 30;
  private enabled: boolean = true;

  constructor(
    private engine: AirspaceMapEngine,
    private centerLat: number = 52.3676,
    private centerLon: number = 4.9041,
  ) {}

  public setCenter(lat: number, lon: number): void {
    this.centerLat = lat;
    this.centerLon = lon;
    if (this.enabled) {
      this.render();
    }
  }

  public setVisible(visible: boolean): void {
    this.enabled = visible;
    if (visible) {
      this.render();
    } else {
      this.engine.removeParametricLayer("range_rings");
      this.engine.removeParametricLayer("azimuth_lines");
    }
  }

  public render(): void {
    if (!this.enabled) return;

    // 1. Polar Range Circles
    const circles = this.ringsNm.map((nm) => ({
      center: [this.centerLat, this.centerLon] as [number, number],
      radiusMeters: nm * METERS_PER_NAUTICAL_MILE,
    }));

    this.engine.setParametricCircles("range_rings", circles, {
      color: "#0284c7",
      weight: 1.5,
      opacity: 0.55,
      dashArray: "4, 6",
    });

    // 2. Radial Azimuth Lines (every 30° out to maximum range)
    const maxRangeMeters = Math.max(...this.ringsNm) * METERS_PER_NAUTICAL_MILE;
    const radialLines: [number, number][][] = [];

    for (let bearing = 0; bearing < 360; bearing += this.azimuthIntervalDeg) {
      const endPoint = destinationPoint(
        this.centerLat,
        this.centerLon,
        bearing,
        maxRangeMeters,
      );
      radialLines.push([[this.centerLat, this.centerLon], endPoint]);
    }

    this.engine.setParametricLines("azimuth_lines", radialLines, {
      color: "#0369a1",
      weight: 1.0,
      opacity: 0.35,
      dashArray: "2, 8",
    });
  }
}
