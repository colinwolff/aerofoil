//! LeafletMarkerDom — In-place DOM mutation helpers for 2D Leaflet aircraft markers.
//! Eliminates `marker.setIcon(new DivIcon(...))` allocations and full SVG DOM teardowns.

import { DivIcon, Marker, type LatLngExpression, type Map as LeafletMap } from "leaflet";
import { getAltitudeColor, getSvgPathForCategory, type AircraftCategory } from "../icons/AircraftIconMatrix";
import type { TargetVisualUpdate } from "./AirspaceMapEngine";

function buildWrapperHtml(u: TargetVisualUpdate): string {
  const color = getAltitudeColor(u.altitudeFt, u.isEmergency);
  const path = getSvgPathForCategory(u.category as AircraftCategory);
  const rot = Math.round(u.heading);
  const pulse = u.isEmergency ? 'class="emergency-pulse"' : "";
  const wCls = u.isSelected ? "plane-marker-wrapper selected-plane" : "plane-marker-wrapper";
  const lblCls = [
    "plane-label",
    u.isSelected ? "selected" : "",
    u.isEmergency ? "emergency" : "",
    !u.showLabel ? "decluttered" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `<div class="${wCls}">
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${rot}deg); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));">
      <g fill="${color}" stroke="#0b1120" stroke-width="0.75" ${pulse}>${path}</g>
    </svg>
    <div class="${lblCls}"><span class="label-cs">${u.callsign}</span><span class="label-telemetry">${u.telemetryText}</span></div>
  </div>`;
}

export function bindLeafletMarkerClick(
  marker: Marker,
  address: string,
  onTargetClick?: (address: string, multi: boolean) => void,
): void {
  marker.on("click", (ev: any) => {
    const oe = ev?.originalEvent as { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; stopPropagation?: () => void } | undefined;
    oe?.stopPropagation?.();
    onTargetClick?.(address, Boolean(oe?.shiftKey || oe?.ctrlKey || oe?.metaKey));
  });
}

export function upsertLeafletMarkerFast(
  map: LeafletMap,
  markers: Map<string, Marker>,
  u: TargetVisualUpdate,
  onTargetClick?: (address: string, multi: boolean) => void,
): void {
  const key = u.address.toUpperCase();
  const rot = Math.round(u.heading);
  const color = getAltitudeColor(u.altitudeFt, u.isEmergency);
  let marker = markers.get(key) as any;

  if (!marker) {
    const icon = new DivIcon({
      html: buildWrapperHtml(u),
      className: "custom-plane-icon",
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    marker = new Marker([u.lat, u.lon] as LatLngExpression, { icon }).addTo(map);
    marker.bindPopup(u.popupHtml);
    bindLeafletMarkerClick(marker, u.address, onTargetClick);
    marker.__st = { lat: u.lat, lon: u.lon, rot, color, cat: u.category, cs: u.callsign, tel: u.telemetryText, sel: u.isSelected, emg: u.isEmergency, vis: u.showLabel, pop: u.popupHtml };
    markers.set(key, marker);
    return;
  }

  const st = marker.__st;
  if (!st || st.cat !== u.category) {
    marker.setLatLng([u.lat, u.lon] as LatLngExpression);
    marker.setIcon(new DivIcon({ html: buildWrapperHtml(u), className: "custom-plane-icon", iconSize: [32, 32], iconAnchor: [16, 16] }));
    if (st?.pop !== u.popupHtml) marker.setPopupContent(u.popupHtml);
    marker.__st = { lat: u.lat, lon: u.lon, rot, color, cat: u.category, cs: u.callsign, tel: u.telemetryText, sel: u.isSelected, emg: u.isEmergency, vis: u.showLabel, pop: u.popupHtml };
    return;
  }

  if (st.lat !== u.lat || st.lon !== u.lon) {
    marker.setLatLng([u.lat, u.lon] as LatLngExpression);
    st.lat = u.lat; st.lon = u.lon;
  }

  const iconEl = marker.getElement?.() as HTMLElement | undefined;
  const wrapper = iconEl?.querySelector(".plane-marker-wrapper") as HTMLElement | null;
  if (wrapper) {
    if (st.rot !== rot) {
      const svg = wrapper.querySelector("svg") as SVGElement | null;
      if (svg) svg.style.transform = `rotate(${rot}deg)`;
      st.rot = rot;
    }
    if (st.color !== color || st.emg !== u.isEmergency) {
      const g = wrapper.querySelector("svg > g") as SVGGElement | null;
      if (g) { g.setAttribute("fill", color); g.classList.toggle("emergency-pulse", u.isEmergency); }
      st.color = color;
    }
    if (st.sel !== u.isSelected) {
      wrapper.classList.toggle("selected-plane", u.isSelected);
      st.sel = u.isSelected;
    }
    const lbl = wrapper.querySelector(".plane-label") as HTMLElement | null;
    if (lbl) {
      lbl.classList.toggle("selected", u.isSelected);
      lbl.classList.toggle("emergency", u.isEmergency);
      lbl.classList.toggle("decluttered", !u.showLabel);
      if (st.cs !== u.callsign) {
        const csEl = lbl.querySelector(".label-cs");
        if (csEl) csEl.textContent = u.callsign;
        st.cs = u.callsign;
      }
      if (st.tel !== u.telemetryText) {
        const telEl = lbl.querySelector(".label-telemetry");
        if (telEl) telEl.textContent = u.telemetryText;
        st.tel = u.telemetryText;
      }
    }
  }
  if (st.pop !== u.popupHtml) {
    marker.setPopupContent(u.popupHtml);
    st.pop = u.popupHtml;
  }
}
