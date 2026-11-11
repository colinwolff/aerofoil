//! BaseMapRegistry — Registered Basemaps and Chart Tile Services.
//! Handles official FAA ArcGIS REST MapServer charts, openAIP, satellite, and fallback mechanics.

import { getEnvCartoKey } from "../components/MapConfigTypes";

export interface BaseMapDefinition {
  id: string;
  name: string;
  url: string;
  attribution: string;
  minZoom?: number;
  maxZoom: number;
  maxNativeZoom?: number;
  subdomains?: string;
  isDarkFilterRecommended?: boolean;
  license: string;
  isOfficialFAA?: boolean;
  pane?: string;
  tms?: boolean;
}

export const BASEMAPS: Record<string, BaseMapDefinition> = {
  osm_dark: {
    id: "osm_dark",
    name: "OpenStreetMap (Radar Dark)",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    isDarkFilterRecommended: true,
    license: "ODbL 1.0 (Open Database License)",
  },
  osm_light: {
    id: "osm_light",
    name: "OpenStreetMap (Daylight)",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    isDarkFilterRecommended: false,
    license: "ODbL 1.0 (Open Database License)",
  },
  carto_dark: {
    id: "carto_dark",
    name: "CARTO Dark Matter",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
    maxZoom: 19,
    subdomains: "abcd",
    isDarkFilterRecommended: false,
    license: "CARTO Basemaps Terms of Service (https://carto.com/attributions)",
  },
  carto_voyager: {
    id: "carto_voyager",
    name: "CARTO Voyager",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
    maxZoom: 19,
    subdomains: "abcd",
    isDarkFilterRecommended: false,
    license: "CARTO Basemaps Terms of Service (https://carto.com/attributions)",
  },
  esri_satellite: {
    id: "esri_satellite",
    name: "Satellite (Esri World Imagery)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
    isDarkFilterRecommended: false,
    license: "Esri Master License Agreement",
  },
  faa_vfr_sectional: {
    id: "faa_vfr_sectional",
    name: "FAA VFR Sectional Chart",
    url: "https://aeronav.faa.gov/arcgis/rest/services/Sectional_Charts/MapServer/tile/{z}/{y}/{x}",
    attribution: 'US FAA AeroNav Services (17 U.S.C. § 105 Public Domain)',
    minZoom: 7,
    maxNativeZoom: 12,
    maxZoom: 19,
    pane: "chartsPane",
    isDarkFilterRecommended: false,
    license: "US Public Domain",
    isOfficialFAA: true,
  },
  faa_ifr_low: {
    id: "faa_ifr_low",
    name: "FAA IFR Enroute Low",
    url: "https://aeronav.faa.gov/arcgis/rest/services/IFR_Enroute_Low/MapServer/tile/{z}/{y}/{x}",
    attribution: 'US FAA AeroNav Services (17 U.S.C. § 105 Public Domain)',
    minZoom: 4,
    maxNativeZoom: 11,
    maxZoom: 19,
    pane: "chartsPane",
    isDarkFilterRecommended: false,
    license: "US Public Domain",
    isOfficialFAA: true,
  },
  openaip: {
    id: "openaip",
    name: "openAIP Aeronautical Chart",
    url: "https://{s}.tile.maps.openaip.net/geowebcache/service/tms/1.0.0/openaip_basemap@EPSG%3A900913@png/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openaip.net">openAIP</a> (CC BY-NC-SA 4.0)',
    minZoom: 4,
    maxNativeZoom: 14,
    maxZoom: 19,
    subdomains: "abc",
    tms: true,
    pane: "chartsPane",
    isDarkFilterRecommended: false,
    license: "CC BY-NC-SA 4.0",
  },
};

export class BaseMapManager {
  private activeBasemapId: string = "osm_dark";
  private cartoKey: string = getEnvCartoKey();

  public setCartoKey(key: string): void {
    this.cartoKey = key || getEnvCartoKey();
  }

  public getCartoKey(): string {
    return this.cartoKey;
  }

  public getActiveBasemap(): BaseMapDefinition {
    const def = BASEMAPS[this.activeBasemapId] || BASEMAPS.osm_dark;
    if ((def.id === "carto_dark" || def.id === "carto_voyager") && this.cartoKey) {
      return { ...def, url: `${def.url}?key=${encodeURIComponent(this.cartoKey)}` };
    }
    return def;
  }

  public setBasemap(id: string): BaseMapDefinition {
    if (BASEMAPS[id]) {
      this.activeBasemapId = id;
    }
    return this.getActiveBasemap();
  }

  public getAvailableBasemaps(): BaseMapDefinition[] {
    return Object.values(BASEMAPS);
  }

  /// Verifies connectivity to official FAA endpoints and returns fallback if unreachable
  public async verifyEndpointOrFallback(id: string): Promise<string> {
    const def = BASEMAPS[id];
    if (!def || !def.isOfficialFAA) {
      return id;
    }

    try {
      // Test probe tile (Z=6, X=10, Y=24 in USA)
      const probeUrl = def.url.replace("{z}", "6").replace("{x}", "10").replace("{y}", "24");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      await fetch(probeUrl, {
        method: "HEAD",
        mode: "no-cors",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return id;
    } catch {
      console.warn(`[BaseMapManager] Official FAA endpoint '${id}' probe failed or timed out. Falling back to osm_dark.`);
      return "osm_dark";
    }
  }
}
