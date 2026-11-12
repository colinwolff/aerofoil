//! Pure formatting and volumetric GeoJSON conversion helpers for 3D airspace prisms.

export interface AirspaceVolumeProps {
  name?: string;
  class?: string;
  type?: string;
  lower_alt?: number;
  upper_alt?: number;
  floor_m?: number;
  ceiling_m?: number;
  color?: string;
}

export function resolveAirspaceColor(props: AirspaceVolumeProps): string {
  const cls = props.class?.toUpperCase();
  if (cls === "B") return "#2563eb";
  if (cls === "C") return "#ec4899";
  if (cls === "D") return "#06b6d4";
  if (cls === "A") return "#7c3aed";

  const type = props.type?.toLowerCase() ?? "";
  if (type.includes("prohibit") || type.includes("restrict")) return "#ef4444";
  if (type.includes("moa") || type.includes("alert") || type.includes("warning")) return "#f59e0b";

  return "#38bdf8";
}

export function toVolumetricGeoJson(geoJsonData: any): any {
  if (!geoJsonData || !geoJsonData.features) return geoJsonData;

  const features = geoJsonData.features
    .filter((f: any) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"))
    .map((f: any) => {
      const p = f.properties || {};
      const lowerFt = p.lower_alt ?? 0;
      const upperFt = p.upper_alt ?? (p.class ? 10000 : 18000);
      const floorM = Math.max(0, lowerFt * 0.3048);
      const ceilingM = Math.max(floorM + 50, upperFt * 0.3048);
      const color = resolveAirspaceColor(p);

      return {
        ...f,
        properties: {
          ...p,
          floor_m: floorM,
          ceiling_m: ceilingM,
          lower_alt: lowerFt,
          upper_alt: upperFt,
          color,
        },
      };
    });

  return { type: "FeatureCollection", features };
}

export function formatAirspacePopupHtml(props: AirspaceVolumeProps): string {
  const title = props.name || "Airspace Sector";
  let details = "";
  if (props.class) details += `<b>Class ${props.class} Airspace</b><br/>`;
  if (props.type) details += `<b>${props.type} Airspace</b><br/>`;
  if (props.lower_alt != null && props.upper_alt != null) {
    details += `Alt: ${props.lower_alt} - ${props.upper_alt} ft`;
  }
  return `<b>${title}</b>${details ? `<br/>${details}` : ""}`;
}
