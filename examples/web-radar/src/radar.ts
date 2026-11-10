import type { TargetWire } from "@aerofoil/sdk";
import type L from "leaflet";

export function isEmergencySquawk(squawk?: string): boolean {
  if (!squawk) return false;
  return squawk === "7500" || squawk === "7600" || squawk === "7700";
}

export function createPlaneSvg(heading: number, emergency: boolean): string {
  const cls = emergency ? "plane-marker emergency" : "plane-marker";
  return `
    <div class="${cls}" style="transform: rotate(${heading}deg);">
      <svg class="plane-svg" viewBox="0 0 24 24">
        <path d="M12 2L15 9H22L19 13L21 21L12 17L3 21L5 13L2 9H9L12 2Z" />
      </svg>
    </div>
  `;
}

export class AirspaceRadarManager {
  private targets: Map<string, TargetWire> = new Map();
  private markers: Map<string, L.Marker> = new Map();

  constructor(
    private map: L.Map | null,
    private leafletLib: typeof L | null,
  ) {}

  public updateTarget(target: TargetWire): void {
    const key = target.address.toUpperCase();
    this.targets.set(key, target);

    const lat = target.latitude ?? target.lat;
    const lon = target.longitude ?? target.lon;

    if (lat != null && lon != null && this.map && this.leafletLib) {
      const heading = target.heading_degrees ?? target.heading ?? 0;
      const isEmergency = isEmergencySquawk(target.squawk);

      const iconHtml = createPlaneSvg(heading, isEmergency);
      const icon = this.leafletLib.divIcon({
        html: iconHtml,
        className: "custom-plane-icon",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      let marker = this.markers.get(key);
      if (!marker) {
        marker = this.leafletLib.marker([lat, lon], { icon }).addTo(this.map);
        marker.bindPopup(`<b>${target.callsign ?? target.address}</b><br/>Alt: ${target.altitude ?? "--"} ft<br/>Squawk: ${target.squawk ?? "--"}`);
        this.markers.set(key, marker);
      } else {
        marker.setLatLng([lat, lon]);
        marker.setIcon(icon);
      }
    }

    this.renderTable();
  }

  public getTargets(): TargetWire[] {
    return Array.from(this.targets.values());
  }

  public renderTable(): void {
    if (typeof document === "undefined") return;
    const tbody = document.getElementById("telemetry-body");
    const countEl = document.getElementById("target-count");
    if (countEl) {
      countEl.textContent = `Targets: ${this.targets.size}`;
    }

    if (!tbody) return;

    if (this.targets.size === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Awaiting surveillance broadcasts...</td></tr>';
      return;
    }

    const rows = Array.from(this.targets.values())
      .sort((a, b) => b.last_seen_ms - a.last_seen_ms)
      .map((t) => {
        const isEmg = isEmergencySquawk(t.squawk);
        const rowCls = isEmg ? "emergency" : "";
        const spd = t.ground_speed_knots ?? t.ground_speed ?? "--";
        const hdg = t.heading_degrees ?? t.heading ?? "--";
        return `
          <tr class="${rowCls}">
            <td>${t.address}</td>
            <td>${t.callsign ?? "--"}</td>
            <td>${t.altitude != null ? `${t.altitude} ft` : "--"}</td>
            <td>${spd !== "--" ? `${spd} kt` : "--"}</td>
            <td>${hdg !== "--" ? `${Math.round(Number(hdg))}°` : "--"}</td>
            <td>${t.squawk ?? "--"}</td>
            <td>${t.source}</td>
          </tr>
        `;
      })
      .join("");

    tbody.innerHTML = rows;
  }
}
