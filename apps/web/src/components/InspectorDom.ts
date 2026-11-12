//! InspectorDom — HTML builder and non-destructive field patcher for AircraftInspector.

import type { TargetWire } from "@aerofoil-rs/sdk";

export interface InspectorViewFields {
  cs: string;
  cat: string;
  operator: string;
  icao: string;
  squawk: string;
  squawkCls: string;
  alt: string;
  vrate: string;
  vrateCls: string;
  gs: string;
  mach: string;
  track: string;
  provHtml: string;
  sparkHtml: string;
}

export function buildInspectorCardHtml(f: InspectorViewFields): string {
  return `
      <div class="inspector-card glass-panel">
        <div class="inspector-header flex justify-between items-center border-b border-slate-700/60 pb-2">
          <div class="flex items-center gap-2">
            <span data-f="cs" class="text-base font-bold text-sky-400 font-mono">${f.cs}</span>
            <span data-f="cat" class="text-xs text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">${f.cat}</span>
          </div>
          <button type="button" id="inspector-close-btn" class="modal-close-btn" title="Close Inspector">&times;</button>
        </div>

        <div data-f="op" class="text-[11px] text-slate-300 font-medium mt-1.5 mb-2">${f.operator}</div>

        <div data-f="spark">${f.sparkHtml}</div>

        <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs font-mono">
          <div><span class="text-slate-500">ICAO:</span> <span class="text-slate-200">${f.icao}</span></div>
          <div><span class="text-slate-500">Squawk:</span> <span data-f="sq" class="${f.squawkCls}">${f.squawk}</span></div>
          <div><span class="text-slate-500">Alt:</span> <span data-f="alt" class="text-slate-200">${f.alt}</span></div>
          <div><span class="text-slate-500">V.Rate:</span> <span data-f="vr" class="${f.vrateCls}">${f.vrate}</span></div>
          <div><span class="text-slate-500">GS:</span> <span data-f="gs" class="text-slate-200">${f.gs}</span></div>
          <div><span class="text-slate-500">Mach:</span> <span data-f="mach" class="text-slate-200">${f.mach}</span></div>
          <div><span class="text-slate-500">Track:</span> <span data-f="trk" class="text-slate-200">${f.track}</span></div>
          <div><span class="text-slate-500">Source:</span> <span data-f="prov">${f.provHtml}</span></div>
        </div>

        <div class="flex gap-2 mt-3 pt-2 border-t border-slate-800/80">
          <button type="button" id="inspector-center-btn" class="btn-tag flex-1 py-1 text-center" title="Center map on aircraft">⌖ Center</button>
          <button type="button" id="inspector-chase-btn" class="btn-tag flex-1 py-1 text-center text-sky-400 font-bold" title="3D chase camera">🎥 Chase 3D</button>
          <button type="button" id="inspector-dismiss-btn" class="btn-tag py-1 px-2 text-center text-slate-400">✕</button>
        </div>
      </div>
    `;
}

export function patchInspectorFields(container: HTMLElement, f: InspectorViewFields): boolean {
  if (typeof container.querySelector !== "function") return false;
  const setTxt = (key: string, val: string, cls?: string) => {
    const el = container.querySelector(`[data-f="${key}"]`) as HTMLElement | null;
    if (!el) return false;
    if (el.textContent !== val) el.textContent = val;
    if (cls !== undefined && el.className !== cls) el.className = cls;
    return true;
  };
  if (!setTxt("cs", f.cs)) return false;
  setTxt("cat", f.cat);
  setTxt("op", f.operator);
  setTxt("sq", f.squawk, f.squawkCls);
  setTxt("alt", f.alt);
  setTxt("vr", f.vrate, f.vrateCls);
  setTxt("gs", f.gs);
  setTxt("mach", f.mach);
  setTxt("trk", f.track);
  const prov = container.querySelector('[data-f="prov"]') as HTMLElement | null;
  if (prov && prov.innerHTML !== f.provHtml) prov.innerHTML = f.provHtml;
  const spark = container.querySelector('[data-f="spark"]') as HTMLElement | null;
  if (spark && spark.innerHTML !== f.sparkHtml) spark.innerHTML = f.sparkHtml;
  return true;
}

export function computeInspectorFields(
  t: TargetWire,
  cat: string,
  operator: string,
  isEmg: boolean,
  sparkHtml: string,
): InspectorViewFields {
  const spd = t.ground_speed_knots ?? t.ground_speed;
  const machNum = spd != null && t.altitude != null ? (spd / 573.8).toFixed(2) : null;
  const vRate = (t as any).vertical_rate ?? (t as any).vertical_rate_fpm ?? 0;
  const vRateSign = vRate > 0 ? "+" : "";
  const isMlat = t.reception === "Mlat";
  return {
    cs: t.callsign ?? t.address,
    cat,
    operator,
    icao: t.address.toUpperCase(),
    squawk: t.squawk ?? "--",
    squawkCls: isEmg ? "text-red-400 font-bold animate-pulse" : "text-slate-200",
    alt: t.altitude ? `${t.altitude.toLocaleString()} ft` : "--",
    vrate: vRate !== 0 ? `${vRateSign}${vRate} fpm` : "0 fpm",
    vrateCls: vRate > 100 ? "text-emerald-400" : vRate < -100 ? "text-amber-400" : "text-slate-400",
    gs: spd ? `${spd} kt` : "--",
    mach: machNum ? `M${machNum}` : "--",
    track: t.heading != null ? `${Math.round(t.heading)}°` : "--",
    provHtml: isMlat
      ? '<span class="badge bg-purple-700 text-white font-bold text-[10px] px-1.5 py-0.5 rounded">MLAT</span>'
      : `<span class="badge bg-sky-700 text-white font-bold text-[10px] px-1.5 py-0.5 rounded">${t.source}</span>`,
    sparkHtml,
  };
}
