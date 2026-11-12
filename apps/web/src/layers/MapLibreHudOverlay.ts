//! MapLibreHudOverlay — Zero-DOM 3D canvas HUD for aircraft labels and projected click popups.
//! Eliminates persistent MapLibre DOM Marker instances and per-frame terrain raycasts.

import { MercatorCoordinate, Popup, type Map as MapLibreMap } from "maplibre-gl";
import { getCachedTerrainElevation } from "./MapLibreTerrainElevCache";

export interface HudTargetMeta {
  address: string;
  lat: number;
  lon: number;
  altMeters: number;
  callsign: string;
  telemetryText: string;
  isSelected: boolean;
  isEmergency: boolean;
  showLabel: boolean;
  popupHtml: string;
  screenX?: number;
  screenY?: number;
}

export class MapLibreHudOverlay {
  private map: MapLibreMap | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private targets: Map<string, HudTargetMeta> = new Map();
  private sharedPopup: Popup | null = null;
  private renderedLabels: string[] = [];

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

  public upsertTarget(meta: HudTargetMeta): void {
    const key = meta.address.toUpperCase();
    const prev = this.targets.get(key);
    this.targets.set(key, {
      ...meta,
      address: key,
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

  public draw(matrix: ArrayLike<number>): void {
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

    const now = performance.now();
    const labeled: (HudTargetMeta & { sx: number; sy: number; prio: number })[] = [];

    for (const t of this.targets.values()) {
      const groundElev = t.altMeters < 5000 ? getCachedTerrainElevation(this.map, t.lon, t.lat, now) : 0;
      const alt = Math.max(t.altMeters, groundElev + 15);
      const c = MercatorCoordinate.fromLngLat([t.lon, t.lat], alt);
      const cw = matrix[3] * c.x + matrix[7] * c.y + matrix[11] * c.z + matrix[15];
      if (cw <= 0) {
        t.screenX = undefined;
        t.screenY = undefined;
        continue;
      }
      const cx = (matrix[0] * c.x + matrix[4] * c.y + matrix[8] * c.z + matrix[12]) / cw;
      const cy = (matrix[1] * c.x + matrix[5] * c.y + matrix[9] * c.z + matrix[13]) / cw;
      const sx = (cx + 1) * 0.5 * cssW;
      const sy = (1 - cy) * 0.5 * cssH;
      t.screenX = sx;
      t.screenY = sy;

      if (t.showLabel && sx >= -80 && sx <= cssW + 80 && sy >= -40 && sy <= cssH + 40) {
        const prio = (t.isEmergency ? 1000 : 0) + (t.isSelected ? 500 : 0);
        labeled.push({ ...t, sx, sy, prio });
      }
    }

    this.renderedLabels = [];
    if (!canvas || !ctx) return;

    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    const reqW = Math.round(cssW * dpr);
    const reqH = Math.round(cssH * dpr);
    if (canvas.width !== reqW || canvas.height !== reqH) {
      canvas.width = reqW;
      canvas.height = reqH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (labeled.length === 0) return;
    labeled.sort((a, b) => b.prio - a.prio);

    const occupied: { x: number; y: number }[] = [];
    ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";

    for (const item of labeled) {
      const bx = Math.round(item.sx + 14);
      const by = Math.round(item.sy - 14);
      let collides = false;
      if (!item.isSelected && !item.isEmergency) {
        for (const o of occupied) {
          if (Math.abs(o.x - bx) < 76 && Math.abs(o.y - by) < 28) {
            collides = true;
            break;
          }
        }
      }
      if (collides) continue;
      occupied.push({ x: bx, y: by });
      this.renderedLabels.push(item.callsign);

      ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      const w1 = ctx.measureText(item.callsign).width;
      ctx.font = "400 9px ui-monospace, SFMono-Regular, Menlo, monospace";
      const w2 = item.telemetryText ? ctx.measureText(item.telemetryText).width : 0;
      const bw = Math.ceil(Math.max(w1, w2)) + 10;
      const bh = item.telemetryText ? 26 : 15;

      ctx.fillStyle = item.isEmergency
        ? "rgba(185, 28, 28, 0.92)"
        : item.isSelected
          ? "rgba(14, 116, 144, 0.92)"
          : "rgba(15, 23, 42, 0.88)";
      ctx.strokeStyle = item.isEmergency ? "#ef4444" : item.isSelected ? "#38bdf8" : "rgba(56, 189, 248, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect?.(bx, by, bw, bh, 4);
      if (!ctx.roundRect) ctx.rect(bx, by, bw, bh);
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
    if (this.canvas && this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private handleMapClick(pt?: { x: number; y: number }): void {
    if (!this.map || !pt) return;
    let best: HudTargetMeta | null = null;
    let bestDist = 26;
    for (const t of this.targets.values()) {
      if (t.screenX == null || t.screenY == null) continue;
      const d = Math.hypot(t.screenX - pt.x, t.screenY - pt.y);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    if (!best) return;
    if (!this.sharedPopup) {
      this.sharedPopup = new Popup({ offset: 14 });
    }
    this.sharedPopup.setLngLat([best.lon, best.lat]).setHTML(best.popupHtml).addTo(this.map);
  }
}
