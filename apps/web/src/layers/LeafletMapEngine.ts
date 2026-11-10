//! Leaflet 2.0 implementation of the AirspaceMapEngine interface.

import {
  Circle,
  DivIcon,
  GeoJSON,
  LeafletMap,
  Marker,
  Polyline,
  TileLayer,
  type LatLngExpression,
} from "leaflet";
import type { AirspaceLayerOptions, AirspaceMapEngine } from "./AirspaceMapEngine";

export class LeafletMapEngine implements AirspaceMapEngine {
  private map: LeafletMap | null = null;
  private baseLayer: TileLayer | null = null;
  private overlayTiles: Map<string, TileLayer> = new Map();
  private targetMarkers: Map<string, Marker> = new Map();
  private vectorLayers: Map<string, GeoJSON> = new Map();
  private parametricLayers: Map<string, (Circle | Polyline)[]> = new Map();
  private viewChangeCallbacks: (() => void)[] = [];

  public init(containerId: string, centerLat: number, centerLon: number, zoom: number): void {
    this.map = new LeafletMap(containerId, {
      center: [centerLat, centerLon],
      zoom,
      zoomControl: true,
    });

    this.map.on("moveend", () => {
      for (const cb of this.viewChangeCallbacks) {
        cb();
      }
    });
  }

  public setView(lat: number, lon: number, zoom?: number): void {
    if (this.map) {
      this.map.setView([lat, lon], zoom ?? this.map.getZoom());
    }
  }

  public getCenter(): [number, number] {
    if (!this.map) return [52.3676, 4.9041];
    const c = this.map.getCenter();
    return [c.lat, c.lng];
  }

  public getZoom(): number {
    return this.map ? this.map.getZoom() : 8;
  }

  public onViewChange(callback: () => void): void {
    this.viewChangeCallbacks.push(callback);
  }

  public setBaseTileLayer(id: string, url: string, attribution: string, options?: AirspaceLayerOptions): void {
    if (!this.map) return;
    if (this.baseLayer) {
      this.map.removeLayer(this.baseLayer);
      this.baseLayer = null;
    }

    this.baseLayer = new TileLayer(url, {
      attribution,
      maxZoom: options?.maxZoom ?? 19,
      subdomains: options?.subdomains ?? "abc",
      opacity: options?.opacity ?? 1.0,
      zIndex: 1,
    }).addTo(this.map);
  }

  public addOverlayTileLayer(id: string, url: string, attribution: string, options?: AirspaceLayerOptions): void {
    if (!this.map) return;
    this.removeTileLayer(id);

    const layer = new TileLayer(url, {
      attribution,
      maxZoom: options?.maxZoom ?? 19,
      subdomains: options?.subdomains ?? "abc",
      opacity: options?.opacity ?? 0.7,
      zIndex: options?.zIndex ?? 10,
    }).addTo(this.map);

    this.overlayTiles.set(id, layer);
  }

  public removeTileLayer(id: string): void {
    const layer = this.overlayTiles.get(id);
    if (layer && this.map) {
      this.map.removeLayer(layer);
      this.overlayTiles.delete(id);
    }
  }

  public setLayerOpacity(id: string, opacity: number): void {
    const layer = this.overlayTiles.get(id);
    if (layer) {
      layer.setOpacity(opacity);
    }
  }

  public updateTargetMarker(
    address: string,
    lat: number,
    lon: number,
    iconHtml: string,
    popupHtml: string,
  ): void {
    if (!this.map) return;
    const key = address.toUpperCase();

    const icon = new DivIcon({
      html: iconHtml,
      className: "custom-plane-icon",
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    let marker = this.targetMarkers.get(key);
    if (!marker) {
      marker = new Marker([lat, lon] as LatLngExpression, { icon }).addTo(this.map);
      marker.bindPopup(popupHtml);
      this.targetMarkers.set(key, marker);
    } else {
      marker.setLatLng([lat, lon] as LatLngExpression);
      marker.setIcon(icon);
      marker.setPopupContent(popupHtml);
    }
  }

  public removeTargetMarker(address: string): void {
    const key = address.toUpperCase();
    const marker = this.targetMarkers.get(key);
    if (marker && this.map) {
      this.map.removeLayer(marker);
      this.targetMarkers.delete(key);
    }
  }

  public setVectorLayer(
    id: string,
    geoJsonData: any,
    styleFn: (feature: any) => Record<string, any>,
    onEachFeatureFn?: (feature: any, layer: any) => void,
  ): void {
    if (!this.map) return;
    this.removeVectorLayer(id);

    const layer = new GeoJSON(geoJsonData, {
      style: styleFn,
      onEachFeature: onEachFeatureFn,
    }).addTo(this.map);

    this.vectorLayers.set(id, layer);
  }

  public removeVectorLayer(id: string): void {
    const layer = this.vectorLayers.get(id);
    if (layer && this.map) {
      this.map.removeLayer(layer);
      this.vectorLayers.delete(id);
    }
  }

  public setParametricLines(id: string, lines: [number, number][][], style: Record<string, any>): void {
    if (!this.map) return;
    this.removeParametricLayer(id);

    const elements: (Circle | Polyline)[] = [];
    for (const line of lines) {
      const poly = new Polyline(line as LatLngExpression[], {
        color: style.color ?? "#38bdf8",
        weight: style.weight ?? 1,
        dashArray: style.dashArray ?? "4, 6",
        opacity: style.opacity ?? 0.4,
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
    if (!this.map) return;
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
      }).addTo(this.map);
      elements.push(circ);
    }

    this.parametricLayers.set(id, elements);
  }

  public removeParametricLayer(id: string): void {
    const items = this.parametricLayers.get(id);
    if (items && this.map) {
      for (const item of items) {
        this.map.removeLayer(item);
      }
      this.parametricLayers.delete(id);
    }
  }
}
