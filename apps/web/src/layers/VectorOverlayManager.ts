//! VectorOverlayManager — Loads TopoJSON airspace and FIR boundaries,
//! converts them via topojson-client, and renders them with altitude styles.

import { feature } from "topojson-client";
import type { AirspaceMapEngine } from "./AirspaceMapEngine";

export interface AirspaceFeatureProperties {
  name?: string;
  class?: string;
  type?: string;
  lower_alt?: number;
  upper_alt?: number;
  icao?: string;
}

export class VectorOverlayManager {
  private activeLayers: Set<string> = new Set();
  private cachedLayers: Map<string, { geoJson: any; styleFn: any }> = new Map();

  constructor(private engine: AirspaceMapEngine) {}

  public setEngine(newEngine: AirspaceMapEngine): void {
    for (const layerId of this.activeLayers) {
      this.engine.removeVectorLayer(layerId);
    }
    this.engine = newEngine;
    for (const [layerId, item] of this.cachedLayers.entries()) {
      if (this.activeLayers.has(layerId)) {
        this.engine.setVectorLayer(layerId, item.geoJson, item.styleFn);
      }
    }
  }

  public async loadLayer(
    layerId: string,
    url: string,
    objectName: string,
    styleFn: (feature: any) => Record<string, any>,
  ): Promise<boolean> {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`[VectorOverlayManager] Failed to fetch TopoJSON at ${url}: HTTP ${resp.status}`);
        return false;
      }
      const topology = await resp.json();
      if (!topology.objects || !topology.objects[objectName]) {
        console.warn(`[VectorOverlayManager] Object '${objectName}' missing in TopoJSON at ${url}`);
        return false;
      }

      const geoJson: any = feature(topology, topology.objects[objectName]);

      this.engine.setVectorLayer(
        layerId,
        geoJson,
        styleFn,
        (feat, layer) => {
          const props: AirspaceFeatureProperties = feat.properties || {};
          let title = props.name || "Airspace Sector";
          let details = "";
          if (props.class) {
            details += `<b>Class ${props.class} Airspace</b><br/>`;
          }
          if (props.type) {
            details += `<b>${props.type} Airspace</b><br/>`;
          }
          if (props.lower_alt != null && props.upper_alt != null) {
            details += `Alt: ${props.lower_alt} - ${props.upper_alt} ft`;
          }
          if (layer.bindPopup) {
            layer.bindPopup(`<b>${title}</b><br/>${details}`);
          }
        },
      );

      this.cachedLayers.set(layerId, { geoJson, styleFn });
      this.activeLayers.add(layerId);
      return true;
    } catch (e) {
      console.warn(`[VectorOverlayManager] Error loading TopoJSON layer ${layerId}:`, e);
      return false;
    }
  }

  public removeLayer(layerId: string): void {
    this.engine.removeVectorLayer(layerId);
    this.activeLayers.delete(layerId);
  }

  public isLayerActive(layerId: string): boolean {
    return this.activeLayers.has(layerId);
  }

  // Pre-configured style functions for FAA and international airspace
  public static classAirspaceStyle(feat: any): Record<string, any> {
    const cls = feat?.properties?.class;
    let color = "#38bdf8"; // Default cyan
    let fillOpacity = 0.12;

    if (cls === "B") {
      color = "#2563eb"; // Blue
      fillOpacity = 0.18;
    } else if (cls === "C") {
      color = "#ec4899"; // Magenta
      fillOpacity = 0.16;
    } else if (cls === "D") {
      color = "#06b6d4"; // Cyan
      fillOpacity = 0.14;
    } else if (cls === "A") {
      color = "#7c3aed"; // Violet
      fillOpacity = 0.15;
    }

    return {
      color,
      weight: 1.5,
      opacity: 0.8,
      fillColor: color,
      fillOpacity,
    };
  }

  public static specialUseStyle(feat: any): Record<string, any> {
    const type = feat?.properties?.type;
    let color = "#ea580c"; // Orange for Restricted
    if (type === "Prohibited") {
      color = "#dc2626"; // Red for Prohibited
    }

    return {
      color,
      weight: 2,
      opacity: 0.85,
      dashArray: "6, 4",
      fillColor: color,
      fillOpacity: 0.22,
    };
  }

  public static firStyle(_feat: any): Record<string, any> {
    return {
      color: "#64748b",
      weight: 1.5,
      opacity: 0.6,
      dashArray: "8, 6",
      fill: false,
    };
  }
}
