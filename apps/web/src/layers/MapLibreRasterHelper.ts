import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import type { AirspaceLayerOptions } from "./AirspaceMapEngine";

/** Default dark aviation base style before raster sources mount. */
export function defaultMapLibreStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": "#090d16" } }],
  };
}

export interface RasterLayerParams {
  map: MapLibreMap;
  srcId: string;
  lyrId: string;
  url: string;
  attr: string;
  opt?: AirspaceLayerOptions;
  opacity?: number;
  isDark?: boolean;
  beforeId?: string;
}

/** Updates paint filters when reusing an unchanged dark/light base raster URL. */
export function updateBaseRasterTheme(map: MapLibreMap, lyrId: string, isDark?: boolean): void {
  map.setPaintProperty(lyrId, "raster-brightness-max", isDark ? 0.45 : 1);
  map.setPaintProperty(lyrId, "raster-saturation", isDark ? -0.6 : 0);
  map.setPaintProperty(lyrId, "raster-contrast", isDark ? 0.25 : 0);
}

/** Replaces a raster tile source and layer in MapLibre GL. */
export function applyMapLibreRasterLayer(p: RasterLayerParams): void {
  if (p.map.getLayer(p.lyrId)) p.map.removeLayer(p.lyrId);
  if (p.map.getSource(p.srcId)) p.map.removeSource(p.srcId);
  const rawSubs = p.opt?.subdomains;
  const subs = Array.isArray(rawSubs) && rawSubs.length > 0
    ? rawSubs
    : typeof rawSubs === "string" && rawSubs.length > 0
      ? rawSubs.split("")
      : ["a", "b", "c"];
  const tiles = p.url.includes("{s}")
    ? subs.map((s) => p.url.replace("{r}", "").replace("{s}", s))
    : [p.url.replace("{r}", "")];
  p.map.addSource(p.srcId, {
    type: "raster",
    tiles,
    tileSize: 256,
    attribution: p.attr,
    minzoom: p.opt?.minZoom ?? 0,
    maxzoom: p.opt?.maxNativeZoom ?? p.opt?.maxZoom ?? 19,
  });
  const paint: Record<string, number> = { "raster-opacity": p.opacity ?? 1 };
  if (p.isDark) {
    paint["raster-brightness-max"] = 0.45;
    paint["raster-saturation"] = -0.6;
    paint["raster-contrast"] = 0.25;
  }
  p.map.addLayer({ id: p.lyrId, type: "raster", source: p.srcId, paint }, p.beforeId);
}
