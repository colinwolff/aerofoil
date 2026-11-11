//! LeafletParametricManager — Manages parametric lines and circles on a Leaflet map.

import { Circle, Polyline, type LatLngExpression, type LeafletMap } from "leaflet";

export class LeafletParametricManager {
  private parametricLayers: Map<string, (Circle | Polyline)[]> = new Map();

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
  }
}
