//! BaseMapRegistry — Registered Basemaps and Chart Tile Services.
//! Handles official FAA ArcGIS REST MapServer charts and fallback mechanics.

export interface BaseMapDefinition {
  id: string;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string;
  isDarkFilterRecommended?: boolean;
  license: string;
  isOfficialFAA?: boolean;
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
  carto_dark: {
    id: "carto_dark",
    name: "CARTO Dark Matter",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    subdomains: "abcd",
    isDarkFilterRecommended: false,
    license: "Commercial Free Tier (Requires API Key for High Volume)",
  },
  faa_vfr_sectional: {
    id: "faa_vfr_sectional",
    name: "FAA VFR Sectional Chart",
    url: "https://aeronav.faa.gov/arcgis/rest/services/Sectional_Charts/MapServer/tile/{z}/{y}/{x}",
    attribution: 'US FAA AeroNav Services (17 U.S.C. § 105 Public Domain)',
    maxZoom: 12,
    isDarkFilterRecommended: false,
    license: "US Public Domain",
    isOfficialFAA: true,
  },
  faa_ifr_low: {
    id: "faa_ifr_low",
    name: "FAA IFR Enroute Low",
    url: "https://aeronav.faa.gov/arcgis/rest/services/IFR_Enroute_Low/MapServer/tile/{z}/{y}/{x}",
    attribution: 'US FAA AeroNav Services (17 U.S.C. § 105 Public Domain)',
    maxZoom: 11,
    isDarkFilterRecommended: false,
    license: "US Public Domain",
    isOfficialFAA: true,
  },
};

export class BaseMapManager {
  private activeBasemapId: string = "osm_dark";

  public getActiveBasemap(): BaseMapDefinition {
    return BASEMAPS[this.activeBasemapId] || BASEMAPS.osm_dark;
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

      const resp = await fetch(probeUrl, {
        method: "HEAD",
        mode: "no-cors",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return id;
    } catch (e) {
      console.warn(`[BaseMapManager] Official FAA endpoint '${id}' probe failed or timed out. Falling back to osm_dark.`);
      return "osm_dark";
    }
  }
}
