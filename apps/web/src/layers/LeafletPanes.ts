//! Custom Leaflet panes for z-index ordering and layer stacking.
//! Invariant: Markers float above vectors, which float above weather, which float above charts & basemaps.

import type { LeafletMap } from "leaflet";

export const PANE_BASEMAP = "basemapPane";
export const PANE_CHARTS = "chartsPane";
export const PANE_WEATHER = "weatherPane";
export const PANE_AIRSPACE = "airspacePane";
export const PANE_ANTENNA = "antennaPane";

export function setupLeafletPanes(map: LeafletMap): void {
  // Basemap tiles (z-index 200)
  const basemap = map.createPane(PANE_BASEMAP);
  basemap.style.zIndex = "200";

  // Aeronautical chart overlays (z-index 250, FAA VFR / IFR Low)
  const charts = map.createPane(PANE_CHARTS);
  charts.style.zIndex = "250";

  // Real-time weather & precipitation radar (z-index 300)
  const weather = map.createPane(PANE_WEATHER);
  weather.style.zIndex = "300";

  // Vector boundaries & GeoJSON airspace (z-index 350)
  const airspace = map.createPane(PANE_AIRSPACE);
  airspace.style.zIndex = "350";

  // Antenna distance rings & coverage contours (z-index 400, non-interactive so airspace below remains clickable)
  const antenna = map.createPane(PANE_ANTENNA);
  antenna.style.zIndex = "400";
  antenna.style.pointerEvents = "none";

  // Note: Default Leaflet markerPane is at z-index 600, guaranteeing aircraft float on top.
}
