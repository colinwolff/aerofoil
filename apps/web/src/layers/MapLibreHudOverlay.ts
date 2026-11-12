//! MapLibreHudOverlay — Zero-DOM 3D canvas HUD with dead-reckoning lockstep and click popups.

import { MercatorCoordinate, Popup, type Map as MapLibreMap } from "maplibre-gl";
import { getCachedTerrainElevation } from "./MapLibreTerrainElevCache";
import { computeFixError, deadReckonInto, type KinematicState } from "./KinematicDeadReckoning";

export interface HudTargetMeta extends KinematicState {
  address: string;
  callsign: string;
  telemetryText: string;
  isSelected: boolean;
  isEmergency: boolean;
  showLabel: boolean;
  popupHtml: string;
  screenX?: number;
  screenY?: number;
}

export type HudUpsertInput = Omit<HudTargetMeta, "heading"> & { heading?: number };

export class MapLibreHudOverlay {
  private map: MapLibreMap | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private targets: Map<string, HudTargetMeta> = new Map();
  private sharedPopup: Popup | null = null;
  private renderedLabels: string[] = [];
  private posScratch = { lon: 0, lat: 0, altMeters: 0 };

  public attach(map: MapLibreMap): void {
    this.map = map;
    if (typeof document === "undefined") return;
    const container = map.getContainer?.();
    if (!container) return;

    const canvas = document.createElement("canvas");
    canvas.className = "maplibre-3d-hud-canvas";
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6;";
    container.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    map.on("click", (e: any) => this.handleMapClick(e?.point));
  }

  public upsertTarget(meta: HudUpsertInput, nowMs: number = performance.now()): void {
    const key = meta.address.toUpperCase();
    const prev = this.targets.get(key);
    const altM = Number.isFinite(meta.altMeters) ? meta.altMeters : 0;
    const err = computeFixError(prev, meta.lon, meta.lat, altM, nowMs);
    this.targets.set(key, {
      ...meta,
      address: key,
      altMeters: altM,
      heading: meta.heading ?? 0,
      updatedAtMs: nowMs,
      ...err,
      screenX: prev?.screenX,
      screenY: prev?.screenY,
    });
  }

  public removeTarget(address: string): void {
    this.targets.delete(address.toUpperCase());
  }

  public getTargetCount(): number {
    return this.targets.size;
  }

  public getRenderedLabels(): string[] {
    return this.renderedLabels;
  }

  public draw(matrix: ArrayLike<number>, now: number = performance.now()): void {
    if (!this.map || this.targets.size === 0) {
      this.clearCanvas();
      this.renderedLabels = [];
      return;
    }

    const canvas = this.canvas;
    const ctx = this.ctx;
    const cssW = canvas?.clientWidth || this.map.getCanvas?.()?.clientWidth || 0;
    const cssH = canvas?.clientHeight || this.map.getCanvas?.()?.clientHeight || 0;
    if (cssW <= 0 || cssH <= 0) return;

    const labeled: (HudTargetMeta & { sx: number; sy: number; prio: number })[] = [];

    for (const t of this.targets.values()) {
      deadReckonInto(t, now, this.posScratch);
      const groundElev = this.posScratch.altMeters < 5000
        ? getCachedTerrainElevation(this.map, this.posScratch.lon, this.posScratch.lat, now)
        : 0;
      const alt = Math.max(this.posScratch.altMeters, groundElev + 15);
      const c = MercatorCoordinate.fromLngLat([this.posScratch.lon, this.posScratch.lat], alt);
      const cw = matrix[3] * c.x + matrix[7] * c.y + matrix[11] * c.z + matrix[15];
      if (cw <= 0) { t.screenX = undefined; t.screenY = undefined; continue; }

      const cx = (matrix[0] * c.x + matrix[4] * c.y + matrix[8] * c.z + matrix[12]) / cw;
      const cy = (matrix[1] * c.x + matrix[5] * c.y + matrix[9] * c.z + matrix[13]) / cw;
      const sx = (cx + 1) * 0.5 * cssW;
      const sy = (1 - cy) * 0.5 * cssH;
      t.screenX = sx;
      t.screenY = sy;

      if (t.showLabel && sx >= -80 && sx <= cssW + 80 && sy >= -40 && sy <= cssH + 40) {
        labeled.push({ ...t, sx, sy, prio: (t.isEmergency ? 1000 : 0) + (t.isSelected ? 500 : 0) });
      }
    }

    this.renderedLabels = [];
    if (!canvas || !ctx) return;

    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    const reqW = Math.round(cssW * dpr), reqH = Math.round(cssH * dpr);
    if (canvas.width !== reqW || canvas.height !== reqH) { canvas.width = reqW; canvas.height = reqH; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (labeled.length === 0) return;
    labeled.sort((a, b) => b.prio - a.prio);
    const occupied: { x: number; y: number }[] = [];

    for (const item of labeled) {
      const bx = Math.round(item.sx + 14), by = Math.round(item.sy - 14);
      if (!item.isSelected && !item.isEmergency && occupied.some((o) => Math.abs(o.x - bx) < 76 && Math.abs(o.y - by) < 28)) {
        continue;
      }
      occupied.push({ x: bx, y: by });
      this.renderedLabels.push(item.callsign);

      ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      const w1 = ctx.measureText(item.callsign).width;
      ctx.font = "400 9px ui-monospace, SFMono-Regular, Menlo, monospace";
      const w2 = item.telemetryText ? ctx.measureText(item.telemetryText).width : 0;
      const bw = Math.ceil(Math.max(w1, w2)) + 10, bh = item.telemetryText ? 26 : 15;

      ctx.fillStyle = item.isEmergency ? "rgba(185, 28, 28, 0.92)" : item.isSelected ? "rgba(14, 116, 144, 0.92)" : "rgba(15, 23, 42, 0.88)";
      ctx.strokeStyle = item.isEmergency ? "#ef4444" : item.isSelected ? "#38bdf8" : "rgba(56, 189, 248, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 4); else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();

      ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = item.isSelected ? "#ffffff" : "#38bdf8";
      ctx.fillText(item.callsign, bx + 5, by + 11);

      if (item.telemetryText) {
        ctx.font = "400 9px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(item.telemetryText, bx + 5, by + 22);
      }
    }
  }

  private clearCanvas(): void {
    if (this.canvas && this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private handleMapClick(pt?: { x: number; y: number }): void {
    if (!this.map || !pt) return;
    let best: HudTargetMeta | null = null;
    let bestDist = 26;
    for (const t of this.targets.values()) {
      if (t.screenX == null || t.screenY == null) continue;
      const d = Math.hypot(t.screenX - pt.x, t.screenY - pt.y);
      if (d < bestDist) { bestDist = d; best = t; }
    }
    if (!best) return;
    if (!this.sharedPopup) this.sharedPopup = new Popup({ offset: 14 });
    deadReckonInto(best, performance.now(), this.posScratch);
    this.sharedPopup.setLngLat([this.posScratch.lon, this.posScratch.lat]).setHTML(best.popupHtml).addTo(this.map);
  }
}
