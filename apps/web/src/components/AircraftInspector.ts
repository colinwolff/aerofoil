//! AircraftInspector — Glassmorphic floating avionics telemetry HUD card (`AF-69`).
//! Displays real-time avionics, operator metadata, and an altitude sparkline.

import type { TargetWire } from "@aerofoil-rs/sdk";
import { classifyAirframe, getAltitudeColor } from "../icons/AircraftIconMatrix";
import { isEmergencySquawk } from "../radar";
import { buildInspectorCardHtml, computeInspectorFields, patchInspectorFields } from "./InspectorDom";

export interface AltitudePoint {
  time_ms: number;
  altitude_ft: number;
}

const AIRLINE_PREFIXES: Record<string, string> = {
  KLM: "KLM Royal Dutch Airlines",
  DLH: "Lufthansa",
  BAW: "British Airways",
  AFR: "Air France",
  UAL: "United Airlines",
  AAL: "American Airlines",
  DAL: "Delta Air Lines",
  SWA: "Southwest Airlines",
  UAE: "Emirates",
  QFA: "Qantas",
  SIA: "Singapore Airlines",
  EZY: "easyJet",
  RYR: "Ryanair",
};

export class AircraftInspector {
  private container: HTMLElement | null = null;
  private currentTarget: TargetWire | null = null;
  private altitudeHistory: AltitudePoint[] = [];
  private renderedIcao: string | null = null;
  private lastRenderMs: number = 0;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private onCenterCallback: ((lat: number, lon: number) => void) | null = null;
  private onChaseCallback: ((icao: string) => void) | null = null;
  private onCloseCallback: (() => void) | null = null;

  public init(containerId: string = "aircraft-inspector-container"): void {
    let el = document.getElementById(containerId);
    if (!el) {
      el = document.createElement("div");
      el.id = containerId;
      document.body.appendChild(el);
    }
    el.className = "aircraft-inspector-hud hidden";
    this.container = el;
  }

  public setOnCenter(cb: (lat: number, lon: number) => void): void {
    this.onCenterCallback = cb;
  }

  public setOnChase(cb: (icao: string) => void): void {
    this.onChaseCallback = cb;
  }

  public setOnClose(cb: () => void): void {
    this.onCloseCallback = cb;
  }

  public selectTarget(target: TargetWire, history: AltitudePoint[] = []): void {
    const key = target.address.toUpperCase();
    const switching = this.renderedIcao !== key || !this.isVisible();
    this.currentTarget = target;
    this.altitudeHistory = history;
    this.container?.classList.remove("hidden");

    const now = Date.now();
    if (switching || now - this.lastRenderMs >= 500) {
      if (this.throttleTimer) { clearTimeout(this.throttleTimer); this.throttleTimer = null; }
      this.lastRenderMs = now;
      this.render();
    } else if (!this.throttleTimer) {
      this.throttleTimer = setTimeout(() => {
        this.throttleTimer = null;
        this.lastRenderMs = Date.now();
        if (this.currentTarget && this.isVisible()) this.render();
      }, 500 - (now - this.lastRenderMs));
    }
  }

  public close(): void {
    if (this.throttleTimer) { clearTimeout(this.throttleTimer); this.throttleTimer = null; }
    const hadTarget = this.currentTarget !== null;
    this.currentTarget = null;
    this.renderedIcao = null;
    this.container?.classList.add("hidden");
    if (hadTarget) this.onCloseCallback?.();
  }

  public isVisible(): boolean {
    return !this.container?.classList.contains("hidden");
  }

  public getSelectedIcao(): string | null {
    return this.currentTarget ? this.currentTarget.address.toUpperCase() : null;
  }

  private resolveOperator(callsign?: string): string {
    if (!callsign || callsign.length < 3) return "General Aviation / Private";
    const prefix = callsign.slice(0, 3).toUpperCase();
    return AIRLINE_PREFIXES[prefix] ?? "Commercial Operator";
  }

  private renderSparkline(history: AltitudePoint[]): string {
    if (history.length < 2) {
      return '<div class="text-xs text-slate-500 italic py-2 text-center">Collecting flight level telemetry...</div>';
    }
    const alts = history.map((p) => p.altitude_ft);
    const minAlt = Math.min(...alts);
    const maxAlt = Math.max(...alts);
    const range = Math.max(100, maxAlt - minAlt);

    const w = 260;
    const h = 44;
    const pts = history
      .map((p, idx) => {
        const x = (idx / (history.length - 1)) * w;
        const y = h - ((p.altitude_ft - minAlt) / range) * (h - 8) - 4;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    const strokeColor = getAltitudeColor(alts[alts.length - 1]);
    return `
      <div class="sparkline-wrapper mt-1 mb-2">
        <div class="flex justify-between text-[10px] text-slate-400 font-mono mb-0.5">
          <span>FL${Math.round(minAlt / 100)}</span>
          <span class="text-cyan-400 font-bold">ALT PROFILE</span>
          <span>FL${Math.round(maxAlt / 100)}</span>
        </div>
        <svg viewBox="0 0 ${w} ${h}" class="w-full h-11 bg-slate-900/60 rounded border border-slate-700/50">
          <polyline fill="none" stroke="${strokeColor}" stroke-width="2" points="${pts}" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
    `;
  }

  public render(): void {
    if (!this.container || !this.currentTarget) return;
    const t = this.currentTarget;
    const key = t.address.toUpperCase();
    const spd = t.ground_speed_knots ?? t.ground_speed;
    const fields = computeInspectorFields(
      t,
      classifyAirframe(t.callsign, t.altitude, spd),
      this.resolveOperator(t.callsign),
      isEmergencySquawk(t.squawk),
      this.renderSparkline(this.altitudeHistory),
    );

    if (this.renderedIcao === key && patchInspectorFields(this.container, fields)) {
      return;
    }

    this.renderedIcao = key;
    this.container.innerHTML = buildInspectorCardHtml(fields);

    document.getElementById("inspector-close-btn")?.addEventListener("click", () => this.close());
    document.getElementById("inspector-dismiss-btn")?.addEventListener("click", () => this.close());
    document.getElementById("inspector-chase-btn")?.addEventListener("click", () => {
      if (this.currentTarget) this.onChaseCallback?.(this.currentTarget.address);
    });
    document.getElementById("inspector-center-btn")?.addEventListener("click", () => {
      const cur = this.currentTarget;
      const lat = cur?.latitude ?? cur?.lat;
      const lon = cur?.longitude ?? cur?.lon;
      if (lat != null && lon != null) this.onCenterCallback?.(lat, lon);
    });
  }
}
