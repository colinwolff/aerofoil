//! MapLibreTrajectoryManager — 3D aircraft flight trajectories with climb/descent profiling.
//! Throttled to <= 10 Hz with requestAnimationFrame to avoid saturating WebGL buffer uploads.

import type { Map as MapLibreMap } from "maplibre-gl";

export interface TrajectoryPoint {
  lon: number;
  lat: number;
  altMeters: number;
}

export interface TargetTrajectory {
  address: string;
  points: TrajectoryPoint[];
  verticalRateFpm: number;
}

const MAX_HISTORY_POINTS = 60;
const SOURCE_ID = "trajectories-source";
const LAYER_ID = "trajectories-layer";

export class MapLibreTrajectoryManager {
  private trajectories: Map<string, TargetTrajectory> = new Map();
  private dirty: boolean = false;
  private rafId: number | null = null;
  private lastFlushTime: number = 0;
  private readonly minFlushIntervalMs = 100; // <= 10 Hz throttle

  public addCoordinate(
    address: string,
    lon: number,
    lat: number,
    altMeters: number,
    verticalRateFpm: number = 0,
  ): void {
    const key = address.toUpperCase();
    let traj = this.trajectories.get(key);
    if (!traj) {
      traj = { address: key, points: [], verticalRateFpm };
      this.trajectories.set(key, traj);
    }

    traj.verticalRateFpm = verticalRateFpm;
    const pts = traj.points;

    // Avoid duplicate coordinates
    if (pts.length > 0) {
      const last = pts[pts.length - 1];
      if (Math.abs(last.lon - lon) < 1e-6 && Math.abs(last.lat - lat) < 1e-6) {
        return;
      }
    }

    pts.push({ lon, lat, altMeters });
    if (pts.length > MAX_HISTORY_POINTS) {
      pts.shift();
    }

    this.dirty = true;
  }

  public removeTarget(address: string): void {
    const key = address.toUpperCase();
    if (this.trajectories.delete(key)) {
      this.dirty = true;
    }
  }

  public clear(): void {
    this.trajectories.clear();
    this.dirty = true;
  }

  public setupLayers(map: MapLibreMap): void {
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });

    map.addLayer({
      id: LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": [
          "case",
          [">", ["get", "verticalRateFpm"], 250],
          "#10b981", // Climb > +250 fpm (Green)
          ["<", ["get", "verticalRateFpm"], -250],
          "#ef4444", // Descent < -250 fpm (Red)
          "#06b6d4", // Level flight [-250, +250] fpm (Cyan)
        ],
        "line-width": 2.5,
        "line-opacity": 0.85,
      },
    });
  }

  public update(map: MapLibreMap): void {
    if (!this.dirty) return;

    const now = performance.now();
    if (now - this.lastFlushTime < this.minFlushIntervalMs) {
      if (this.rafId === null && typeof requestAnimationFrame !== "undefined") {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = null;
          this.update(map);
        });
      }
      return;
    }

    this.lastFlushTime = now;
    this.dirty = false;

    const source = map.getSource(SOURCE_ID) as any;
    if (!source || !source.setData) return;

    const features = [];
    for (const traj of this.trajectories.values()) {
      if (traj.points.length < 2) continue;

      features.push({
        type: "Feature" as const,
        properties: {
          address: traj.address,
          verticalRateFpm: traj.verticalRateFpm,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: traj.points.map((p) => [p.lon, p.lat, p.altMeters]),
        },
      });
    }

    source.setData({
      type: "FeatureCollection",
      features,
    });
  }
}
