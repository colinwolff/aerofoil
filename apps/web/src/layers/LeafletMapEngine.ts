//! Leaflet 2.0 implementation of the AirspaceMapEngine interface.

import {
  DivIcon,
  GeoJSON,
  LeafletMap,
  Marker,
  type LatLngExpression,
  type TileLayer,
} from "leaflet";
import type { AirspaceLayerOptions, AirspaceMapEngine, TargetVisualUpdate } from "./AirspaceMapEngine";
import { setupLeafletPanes, PANE_BASEMAP, PANE_AIRSPACE } from "./LeafletPanes";
import { LeafletParametricManager } from "./LeafletParametricManager";
import { bindLeafletMarkerClick, upsertLeafletMarkerFast } from "./LeafletMarkerDom";
import { createLeafletTileLayer } from "./LeafletTileHelper";

export class LeafletMapEngine implements AirspaceMapEngine {
  private map: LeafletMap | null = null;
  private baseLayer: TileLayer | null = null;
  private overlayTiles: Map<string, TileLayer> = new Map();
  private currentBaseUrl: string | null = null;
  private targetMarkers: Map<string, Marker> = new Map();
  private vectorLayers: Map<string, GeoJSON> = new Map();
  private parametricManager: LeafletParametricManager | null = null;
  private viewChangeCallbacks: (() => void)[] = [];
  private onTargetClick?: (address: string, multi: boolean) => void;

  public init(containerId: string, centerLat: number, centerLon: number, zoom: number): void {
    this.map = new LeafletMap(containerId, {
      center: [centerLat, centerLon],
      zoom,
      zoomControl: true,
    });

    setupLeafletPanes(this.map);
    this.parametricManager = new LeafletParametricManager(this.map);

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
    if (!this.viewChangeCallbacks.includes(callback)) {
      this.viewChangeCallbacks.push(callback);
    }
  }

  public setOnTargetClick(callback: (address: string, multi: boolean) => void): void {
    this.onTargetClick = callback;
  }

  public setBaseTileLayer(id: string, url: string, attribution: string, options?: AirspaceLayerOptions): void {
    if (!this.map) return;
    if (this.currentBaseUrl === url && this.baseLayer) return;
    this.currentBaseUrl = url;
    if (this.baseLayer) {
      this.map.removeLayer(this.baseLayer);
      this.baseLayer = null;
    }
    this.baseLayer = createLeafletTileLayer(url, attribution, options, PANE_BASEMAP).addTo(this.map);
  }

  public addOverlayTileLayer(id: string, url: string, attribution: string, options?: AirspaceLayerOptions): void {
    if (!this.map) return;
    this.removeTileLayer(id);
    const layer = createLeafletTileLayer(url, attribution, options, "overlayPane").addTo(this.map);
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

    let marker = this.targetMarkers.get(key) as any;
    if (!marker) {
      const icon = new DivIcon({ html: iconHtml, className: "custom-plane-icon", iconSize: [32, 32], iconAnchor: [16, 16] });
      marker = new Marker([lat, lon] as LatLngExpression, { icon }).addTo(this.map);
      marker.bindPopup(popupHtml);
      bindLeafletMarkerClick(marker, key, (addr, multi) => this.onTargetClick?.(addr, multi));
      marker.__cachedHtml = iconHtml;
      marker.__cachedPopup = popupHtml;
      this.targetMarkers.set(key, marker);
    } else {
      marker.setLatLng([lat, lon] as LatLngExpression);
      if (marker.__cachedHtml !== iconHtml) {
        marker.setIcon(new DivIcon({ html: iconHtml, className: "custom-plane-icon", iconSize: [32, 32], iconAnchor: [16, 16] }));
        marker.__cachedHtml = iconHtml;
      }
      if (marker.__cachedPopup !== popupHtml) {
        marker.setPopupContent(popupHtml);
        marker.__cachedPopup = popupHtml;
      }
    }
  }

  public updateTargetVisual(update: TargetVisualUpdate): void {
    if (!this.map) return;
    upsertLeafletMarkerFast(this.map as any, this.targetMarkers, update, (addr, multi) => this.onTargetClick?.(addr, multi));
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
      pane: PANE_AIRSPACE,
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

  public get trajectoryManager(): LeafletParametricManager | null {
    return this.parametricManager;
  }

  public updateTargetTrajectory(address: string, lon: number, lat: number): void {
    this.parametricManager?.updateTrajectory(address, lat, lon);
  }

  public setParametricLines(id: string, lines: [number, number][][], style: Record<string, any>): void {
    this.parametricManager?.setParametricLines(id, lines, style);
  }

  public setParametricCircles(id: string, circles: { center: [number, number]; radiusMeters: number }[], style: Record<string, any>): void {
    this.parametricManager?.setParametricCircles(id, circles, style);
  }

  public removeParametricLayer(id: string): void {
    this.parametricManager?.removeParametricLayer(id);
  }
}
