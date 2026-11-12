import { TileLayer } from "leaflet";
import type { AirspaceLayerOptions } from "./AirspaceMapEngine";
import { PANE_BASEMAP } from "./LeafletPanes";

/** Constructs a Leaflet TileLayer with cached buffering defaults. */
export function createLeafletTileLayer(
  url: string,
  attr: string,
  opts?: AirspaceLayerOptions,
  defaultPane: string = PANE_BASEMAP,
): TileLayer {
  return new TileLayer(url, {
    attribution: attr,
    minZoom: opts?.minZoom ?? 0,
    maxZoom: opts?.maxZoom ?? 19,
    maxNativeZoom: opts?.maxNativeZoom ?? opts?.maxZoom ?? 19,
    subdomains: opts?.subdomains ?? "abc",
    opacity: opts?.opacity ?? (defaultPane === PANE_BASEMAP ? 1.0 : 0.7),
    pane: opts?.pane ?? defaultPane,
    tms: opts?.tms ?? false,
    keepBuffer: 4,
    updateWhenZooming: false,
    updateWhenIdle: true,
  });
}
