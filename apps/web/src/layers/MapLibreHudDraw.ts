import type { KinematicState } from "./KinematicDeadReckoning";

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

export interface HudLabelEntry {
  callsign: string;
  telemetryText: string;
  isSelected: boolean;
  isEmergency: boolean;
  sx: number;
  sy: number;
  prio: number;
}

/** Paints de-conflicted callsign/telemetry HUD pills and returns rendered callsigns. */
export function paintHudLabelPills(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  labeled: HudLabelEntry[],
): string[] {
  const rendered: string[] = [];
  const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
  const reqW = Math.round(cssW * dpr), reqH = Math.round(cssH * dpr);
  if (canvas.width !== reqW || canvas.height !== reqH) {
    canvas.width = reqW;
    canvas.height = reqH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  if (labeled.length === 0) return rendered;
  labeled.sort((a, b) => b.prio - a.prio);
  const occupied: { x: number; y: number }[] = [];

  for (const item of labeled) {
    const bx = Math.round(item.sx + 14), by = Math.round(item.sy - 14);
    if (!item.isSelected && !item.isEmergency && occupied.some((o) => Math.abs(o.x - bx) < 76 && Math.abs(o.y - by) < 28)) {
      continue;
    }
    occupied.push({ x: bx, y: by });
    rendered.push(item.callsign);

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
  return rendered;
}
