import type { TargetWire } from "@aerofoil-rs/sdk";
import type { AirspaceMapEngine } from "./layers/AirspaceMapEngine";
import type { AircraftLabelsManager } from "./layers/AircraftLabelsManager";
import { classifyAirframe } from "./icons/AircraftIconMatrix";
import { isEmergencySquawk } from "./components/TelemetryTableRenderer";

/** Dispatches a single target update to the active map engine and trajectory buffer. */
export function dispatchTargetRender(
  engine: AirspaceMapEngine | any,
  labelsMgr: AircraftLabelsManager,
  selectedIcaos: Set<string>,
  antennaLayer: any,
  key: string,
  target: TargetWire,
  recordTraj: boolean,
): void {
  const lat = target.latitude ?? target.lat;
  const lon = target.longitude ?? target.lon;
  if (lat == null || lon == null) return;

  if (recordTraj) antennaLayer?.recordTargetSignal?.(lat, lon, (target as any).rssi, target.altitude);
  if (!engine) return;

  const heading = target.heading_degrees ?? target.heading ?? 0;
  const isEmergency = isEmergencySquawk(target.squawk);
  const speed = target.ground_speed_knots ?? target.ground_speed;
  const category = classifyAirframe(target.callsign, target.altitude, speed);

  const isSelected = selectedIcaos.has(key);
  const zoom = typeof engine.getZoom === "function" ? engine.getZoom() : 8;
  const showLabel = labelsMgr.shouldShowLabel(zoom, isSelected, isEmergency);
  const mlatBadge = target.reception === "Mlat" ? ' <span class="badge bg-purple-700 text-white font-bold text-[10px] px-1 py-0.2 rounded">MLAT</span>' : "";
  const popupHtml = `<b>${target.callsign ?? target.address}</b>${mlatBadge}<br/>Type: ${category}<br/>Alt: ${target.altitude ?? "--"} ft<br/>Spd: ${speed ?? "--"} kt<br/>Hdg: ${Math.round(heading)}°<br/>Squawk: ${target.squawk ?? "--"}`;

  const alt = target.altitude ?? 0;
  const altMeters = alt * 0.3048;
  const vRate = (target as any).vertical_rate ?? (target as any).vertical_rate_fpm ?? 0;

  if (typeof engine.updateTargetVisual === "function") {
    const altStr = target.altitude != null ? `FL${Math.round(target.altitude / 100).toString().padStart(3, "0")}` : "---";
    const trend = vRate > 250 ? "↑" : vRate < -250 ? "↓" : "";
    const spdStr = speed != null ? `${Math.round(speed)}k` : "";
    engine.updateTargetVisual({
      address: key, lat, lon, altMeters, altitudeFt: target.altitude, heading, category,
      groundSpeedKts: speed, verticalRateFpm: vRate,
      callsign: target.callsign?.trim() || key, telemetryText: `${altStr}${trend} ${spdStr}`.trim(),
      isSelected, isEmergency, showLabel, popupHtml,
    });
  } else {
    const labelHtml = labelsMgr.formatLabel(target, isSelected, isEmergency, !showLabel);
    const markerHtml = labelsMgr.buildMarkerHtml(category, heading, target.altitude, isEmergency, labelHtml, isSelected);
    engine.updateTargetMarker?.(key, lat, lon, markerHtml, popupHtml);
  }
  if (!recordTraj) return;
  const col: [number, number, number, number] = isEmergency
    ? [0.94, 0.27, 0.27, 1.0]
    : isSelected
      ? [0.22, 0.74, 0.97, 1.0]
      : alt < 10000 ? [0.06, 0.72, 0.51, 1.0] : alt < 25000 ? [0.02, 0.71, 0.83, 1.0] : alt < 35000 ? [0.92, 0.70, 0.03, 1.0] : [0.66, 0.33, 0.97, 1.0];
  if (typeof engine.updateTargetTrajectory === "function") {
    engine.updateTargetTrajectory(key, lon, lat, altMeters, vRate, heading, (target as any).pitch ?? 0, (target as any).roll ?? 0, category, col, speed ?? 0);
  } else {
    engine.trajectoryManager?.addCoordinate?.(key, lon, lat, altMeters, vRate);
  }
}
