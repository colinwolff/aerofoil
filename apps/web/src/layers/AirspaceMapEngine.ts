//! Vendor-agnostic AirspaceMapEngine interface.
//! Provides a uniform abstraction over Leaflet 2.0 (DOM/Canvas) and MapLibre GL (WebGL/GPU).

import type { TargetWire } from "@aerofoil-rs/sdk";

export interface AirspaceLayerOptions {
  opacity?: number;
  minZoom?: number;
  maxZoom?: number;
  maxNativeZoom?: number;
  subdomains?: string;
  zIndex?: number;
  pane?: string;
  tms?: boolean;
}

export interface AirspaceMapEngine {
  init(containerId: string, centerLat: number, centerLon: number, zoom: number): void;
  setView(lat: number, lon: number, zoom?: number): void;
  getCenter(): [number, number];
  getZoom(): number;
  onViewChange(callback: () => void): void;

  // Base map & raster tile management
  setBaseTileLayer(id: string, url: string, attribution: string, options?: AirspaceLayerOptions): void;
  addOverlayTileLayer(id: string, url: string, attribution: string, options?: AirspaceLayerOptions): void;
  removeTileLayer(id: string): void;
  setLayerOpacity(id: string, opacity: number): void;

  // Real-time surveillance aircraft markers
  updateTargetMarker(
    address: string,
    lat: number,
    lon: number,
    iconHtml: string,
    popupHtml: string,
  ): void;
  removeTargetMarker(address: string): void;

  // Vector overlays (Airspace boundaries, GeoJSON / TopoJSON)
  setVectorLayer(
    id: string,
    geoJsonData: any,
    styleFn: (feature: any) => Record<string, any>,
    onEachFeatureFn?: (feature: any, layer: any) => void,
  ): void;
  removeVectorLayer(id: string): void;

  // Parametric geometry layers (Range rings, radial azimuths)
  setParametricLines(id: string, lines: [number, number][][], style: Record<string, any>): void;
  setParametricCircles(id: string, circles: { center: [number, number]; radiusMeters: number }[], style: Record<string, any>): void;
  removeParametricLayer(id: string): void;

  // 3D Topography & Terrain
  setTerrainEnabled?(enabled: boolean): void;
  setTerrainExaggeration?(exaggeration: number): void;
  setHillshadingEnabled?(enabled: boolean): void;
}
