//! Keyed, throttled DOM renderer for the telemetry sidebar aircraft table.

import type { TargetWire } from "@aerofoil-rs/sdk";
import { matchesFilter, type AirspaceFilterCriteria } from "./AirspaceFilters";

export function isEmergencySquawk(squawk?: string): boolean {
  return squawk === "7500" || squawk === "7600" || squawk === "7700";
}

interface RowEntry {
  tr: HTMLTableRowElement;
  cells: HTMLTableCellElement[];
  cls: string;
  cs: string;
  alt: string;
  spd: string;
  hdg: string;
  sq: string;
  src: string;
  mlat: boolean;
}

type TableArgs = [
  Map<string, TargetWire>,
  AirspaceFilterCriteria,
  Set<string>,
  (icao: string, multi: boolean) => void,
];

export class TelemetryTableRenderer {
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRenderMs: number = 0;
  private readonly throttleMs = 500;
  private rows: Map<string, RowEntry> = new Map();
  private emptyShown: boolean = false;
  private latestArgs: TableArgs | null = null;

  public schedule(...args: TableArgs): void {
    this.latestArgs = args;
    const now = Date.now();
    const elapsed = now - this.lastRenderMs;
    if (elapsed >= this.throttleMs) {
      this.lastRenderMs = now;
      this.render(...args);
    } else if (!this.renderTimer) {
      this.renderTimer = setTimeout(() => {
        this.renderTimer = null;
        this.lastRenderMs = Date.now();
        if (this.latestArgs) this.render(...this.latestArgs);
      }, this.throttleMs - elapsed);
    }
  }

  public render(
    targets: Map<string, TargetWire>,
    criteria: AirspaceFilterCriteria,
    selectedIcaos: Set<string>,
    onSelect: (icao: string, multi: boolean) => void,
  ): void {
    if (typeof document === "undefined") return;
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }

    const tbody = document.getElementById("telemetry-body");
    const countEl = document.getElementById("target-count");
    const total = targets.size;
    const visible: TargetWire[] = [];
    for (const t of targets.values()) {
      if (matchesFilter(t, criteria)) visible.push(t);
    }

    if (countEl) {
      countEl.textContent = visible.length === total ? String(total) : `${visible.length}/${total}`;
    }
    if (!tbody) return;

    this.bindSelectionDelegate(tbody, onSelect);

    if (visible.length === 0) {
      this.rows.clear();
      if (!this.emptyShown) {
        const msg = total === 0 ? "Awaiting surveillance data..." : "No matching targets in filter...";
        tbody.innerHTML = `<tr class="empty-row"><td colspan="7">${msg}</td></tr>`;
        this.emptyShown = true;
      }
      return;
    }

    visible.sort((a, b) => b.last_seen_ms - a.last_seen_ms);

    if (typeof tbody.insertBefore === "function" && typeof document.createElement === "function") {
      this.reconcileKeyedRows(tbody, visible, selectedIcaos);
      return;
    }

    this.emptyShown = false;
    tbody.innerHTML = visible
      .map((t) => {
        const key = t.address.toUpperCase();
        const rowCls = [isEmergencySquawk(t.squawk) ? "emergency" : "", selectedIcaos.has(key) ? "selected" : ""].filter(Boolean).join(" ");
        const spd = t.ground_speed_knots ?? t.ground_speed ?? "--";
        const hdg = t.heading_degrees ?? t.heading ?? "--";
        const src = t.reception === "Mlat"
          ? `${t.source} <span class="badge bg-purple-700 text-white font-bold text-[10px] px-1 py-0.2 rounded">MLAT</span>`
          : t.source;
        return `<tr class="${rowCls}" data-address="${t.address}"><td>${t.address}</td><td>${t.callsign ?? "--"}</td><td>${t.altitude != null ? `${t.altitude} ft` : "--"}</td><td>${spd !== "--" ? `${spd} kt` : "--"}</td><td>${hdg !== "--" ? `${Math.round(Number(hdg))}°` : "--"}</td><td>${t.squawk ?? "--"}</td><td>${src}</td></tr>`;
      })
      .join("");
  }

  private reconcileKeyedRows(tbody: HTMLElement, visible: TargetWire[], selectedIcaos: Set<string>): void {
    if (this.emptyShown) {
      tbody.innerHTML = "";
      this.emptyShown = false;
    }

    const active = new Set<string>();
    for (let i = 0; i < visible.length; i++) {
      const t = visible[i];
      const key = t.address.toUpperCase();
      active.add(key);

      const rowCls = [isEmergencySquawk(t.squawk) ? "emergency" : "", selectedIcaos.has(key) ? "selected" : ""].filter(Boolean).join(" ");
      const cs = t.callsign ?? "--";
      const alt = t.altitude != null ? `${t.altitude} ft` : "--";
      const rawSpd = t.ground_speed_knots ?? t.ground_speed;
      const spd = rawSpd != null ? `${rawSpd} kt` : "--";
      const rawHdg = t.heading_degrees ?? t.heading;
      const hdg = rawHdg != null ? `${Math.round(Number(rawHdg))}°` : "--";
      const sq = t.squawk ?? "--";
      const mlat = t.reception === "Mlat";

      let rec = this.rows.get(key);
      if (!rec) {
        const tr = document.createElement("tr");
        tr.setAttribute("data-address", t.address);
        const cells: HTMLTableCellElement[] = [];
        for (let c = 0; c < 7; c++) {
          const td = document.createElement("td");
          tr.appendChild(td);
          cells.push(td);
        }
        cells[0].textContent = t.address;
        rec = { tr, cells, cls: "", cs: "", alt: "", spd: "", hdg: "", sq: "", src: "", mlat: false };
        this.rows.set(key, rec);
      }

      if (rec.cls !== rowCls) { rec.tr.className = rowCls; rec.cls = rowCls; }
      if (rec.cs !== cs) { rec.cells[1].textContent = cs; rec.cs = cs; }
      if (rec.alt !== alt) { rec.cells[2].textContent = alt; rec.alt = alt; }
      if (rec.spd !== spd) { rec.cells[3].textContent = spd; rec.spd = spd; }
      if (rec.hdg !== hdg) { rec.cells[4].textContent = hdg; rec.hdg = hdg; }
      if (rec.sq !== sq) { rec.cells[5].textContent = sq; rec.sq = sq; }
      if (rec.src !== t.source || rec.mlat !== mlat) {
        rec.cells[6].innerHTML = mlat
          ? `${t.source} <span class="badge bg-purple-700 text-white font-bold text-[10px] px-1 py-0.2 rounded">MLAT</span>`
          : t.source;
        rec.src = t.source;
        rec.mlat = mlat;
      }

      const currentAtIdx = tbody.children[i] ?? null;
      if (currentAtIdx !== rec.tr) {
        tbody.insertBefore(rec.tr, currentAtIdx);
      }
    }

    for (const [key, rec] of this.rows.entries()) {
      if (!active.has(key)) {
        rec.tr.remove?.();
        this.rows.delete(key);
      }
    }
  }

  private bindSelectionDelegate(tbody: HTMLElement, onSelect: (icao: string, multi: boolean) => void): void {
    if (tbody.hasAttribute("data-bound")) return;
    tbody.setAttribute("data-bound", "true");
    let lastMousedownMs = 0;
    const handle = (e: Event) => {
      const now = Date.now();
      if (e.type === "mousedown") lastMousedownMs = now;
      if (e.type === "click" && now - lastMousedownMs < 350) return;
      const tr = (e.target as HTMLElement | null)?.closest("tr[data-address]") as HTMLElement | null;
      const addr = tr?.getAttribute("data-address");
      if (addr) {
        const me = e as MouseEvent;
        onSelect(addr, Boolean(me.metaKey || me.ctrlKey || me.shiftKey));
      }
    };
    tbody.addEventListener("mousedown", handle);
    tbody.addEventListener("click", handle);
  }
}
