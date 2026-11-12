//! LeafletParametricManager — Manages parametric lines, circles, and 2D flight trajectories.

import { Circle, Polyline, type LatLngExpression, type LeafletMap } from "leaflet";

export class LeafletParametricManager {
  private parametricLayers: Map<string, (Circle | Polyline)[]> = new Map();
  private trajectoryPolylines: Map<string, Polyline> = new Map();

  constructor(private map: LeafletMap) {}

  public setParametricLines(id: string, lines: [number, number][][], style: Record<string, any>): void {
    this.removeParametricLayer(id);

    const elements: (Circle | Polyline)[] = [];
    for (const line of lines) {
      const poly = new Polyline(line as LatLngExpression[], {
        color: style.color ?? "#38bdf8",
        weight: style.weight ?? 1,
        dashArray: style.dashArray ?? "4, 6",
        opacity: style.opacity ?? 0.4,
        pane: style.pane ?? "antennaPane",
      }).addTo(this.map);
      elements.push(poly);
    }

    this.parametricLayers.set(id, elements);
  }

  public setParametricCircles(
    id: string,
    circles: { center: [number, number]; radiusMeters: number }[],
    style: Record<string, any>,
  ): void {
    this.removeParametricLayer(id);

    const elements: (Circle | Polyline)[] = [];
    for (const c of circles) {
      const circ = new Circle(c.center as LatLngExpression, {
        radius: c.radiusMeters,
        color: style.color ?? "#0ea5e9",
        fillColor: "transparent",
        weight: style.weight ?? 1.5,
        opacity: style.opacity ?? 0.5,
        dashArray: style.dashArray ?? "3, 5",
        pane: style.pane ?? "antennaPane",
      }).addTo(this.map);
      elements.push(circ);
    }

    this.parametricLayers.set(id, elements);
  }

  public updateTrajectory(id: string, lat: number, lon: number, style?: Record<string, any>): void {
    const key = id.toUpperCase();
    let poly = this.trajectoryPolylines.get(key);
    if (!poly) {
      poly = new Polyline([[lat, lon]], {
        color: style?.color ?? "#06b6d4",
        weight: 2,
        opacity: 0.75,
        pane: "overlayPane",
      }).addTo(this.map);
      this.trajectoryPolylines.set(key, poly);
    } else {
      poly.addLatLng([lat, lon]);
    }
  }

  public removeTrajectory(id: string): void {
    const key = id.toUpperCase();
    const poly = this.trajectoryPolylines.get(key);
    if (poly) {
      this.map.removeLayer(poly);
      this.trajectoryPolylines.delete(key);
    }
  }

  private lastSelectedIcaos?: Set<string>;
  private trailsMode: "all" | "selected" | "none" = "selected";

  public setTrailsMode(mode: "all" | "selected" | "none"): void {
    this.trailsMode = mode;
    if (mode === "none") {
      this.setTrajectoriesVisible(false);
    } else if (mode === "all") {
      this.setTrajectoriesVisible(true);
    } else {
      this.setTrajectoriesVisible(true, this.lastSelectedIcaos);
    }
  }

  public setSelectedIcaos(icaos: Set<string>): void {
    this.lastSelectedIcaos = new Set(icaos);
    if (this.trailsMode === "selected") {
      this.setTrajectoriesVisible(true, this.lastSelectedIcaos);
    }
  }

  public setTrajectoriesVisible(visible: boolean, selectedIcaos?: Set<string>): void {
    for (const [id, poly] of this.trajectoryPolylines.entries()) {
      const show = visible && (!selectedIcaos || selectedIcaos.size === 0 || selectedIcaos.has(id));
      if (show) {
        if (!this.map.hasLayer(poly)) this.map.addLayer(poly);
      } else {
        if (this.map.hasLayer(poly)) this.map.removeLayer(poly);
      }
    }
  }

  public removeParametricLayer(id: string): void {
    const items = this.parametricLayers.get(id);
    if (items) {
      for (const item of items) {
        this.map.removeLayer(item);
      }
      this.parametricLayers.delete(id);
    }
  }

  public clear(): void {
    for (const id of Array.from(this.parametricLayers.keys())) {
      this.removeParametricLayer(id);
    }
    for (const id of Array.from(this.trajectoryPolylines.keys())) {
      this.removeTrajectory(id);
    }
  }
}
