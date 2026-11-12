//! MapLibreHudOverlay — Zero-DOM 3D canvas HUD with dead-reckoning lockstep and click popups.

import { MercatorCoordinate, Popup, type Map as MapLibreMap } from "maplibre-gl";
import { getCachedTerrainElevation } from "./MapLibreTerrainElevCache";
import { computeFixError, deadReckonInto } from "./KinematicDeadReckoning";
import { paintHudLabelPills, type HudLabelEntry, type HudTargetMeta } from "./MapLibreHudDraw";

export type { HudTargetMeta };

export type HudUpsertInput = Omit<HudTargetMeta, "heading"> & { heading?: number };

export class MapLibreHudOverlay {
  private map: MapLibreMap | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private targets: Map<string, HudTargetMeta> = new Map();
  private sharedPopup: Popup | null = null;
  private onTargetSelect?: (address: string, multi: boolean) => void;
  private onTargetPopupOpen?: () => void;
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
    map.on("click", (e: any) => {
      const ev = e?.originalEvent as { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } | undefined;
      this.handleMapClick(e?.point, Boolean(ev?.shiftKey || ev?.ctrlKey || ev?.metaKey));
    });
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

    const labeled: HudLabelEntry[] = [];

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
    this.renderedLabels = paintHudLabelPills(ctx, canvas, cssW, cssH, labeled);
  }

  private clearCanvas(): void {
    if (this.canvas && this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  public setOnTargetSelect(cb?: (address: string, multi: boolean) => void): void {
    this.onTargetSelect = cb;
  }

  public setOnTargetPopupOpen(cb?: () => void): void {
    this.onTargetPopupOpen = cb;
  }

  public findTargetAt(pt?: { x: number; y: number }, radius = 28): { address: string; target: HudTargetMeta } | null {
    if (!pt) return null;
    let bestAddr: string | null = null;
    let bestTarget: HudTargetMeta | null = null;
    let bestDist = radius;
    for (const [address, t] of this.targets.entries()) {
      if (t.screenX == null || t.screenY == null) continue;
      const d = Math.hypot(t.screenX - pt.x, t.screenY - pt.y);
      if (d < bestDist) {
        bestDist = d;
        bestAddr = address;
        bestTarget = t;
      }
    }
    return bestAddr && bestTarget ? { address: bestAddr, target: bestTarget } : null;
  }

  public hasTargetAt(pt?: { x: number; y: number }): boolean {
    return this.findTargetAt(pt) !== null;
  }

  public closePopup(): void {
    const p = this.sharedPopup as unknown as { remove?: () => void } | null;
    if (typeof p?.remove === "function") p.remove();
  }

  private handleMapClick(pt?: { x: number; y: number }, multi = false): void {
    if (!this.map || !pt) return;
    const hit = this.findTargetAt(pt);
    if (!hit) {
      this.closePopup();
      return;
    }
    this.onTargetPopupOpen?.();
    if (!this.sharedPopup) this.sharedPopup = new Popup({ offset: 14, closeOnClick: false });
    deadReckonInto(hit.target, performance.now(), this.posScratch);
    this.sharedPopup.setLngLat([this.posScratch.lon, this.posScratch.lat]).setHTML(hit.target.popupHtml).addTo(this.map);
    this.onTargetSelect?.(hit.address, multi);
  }
}
