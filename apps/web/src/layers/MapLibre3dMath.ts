//! MapLibre3dMath — Projection matrix extraction and aircraft kinematic transform math.

import type { CustomRenderMethodInput } from "maplibre-gl";

export function extractProjectionMatrix(input: unknown): ArrayLike<number> | null {
  if (!input) return null;
  if (Array.isArray(input) || ArrayBuffer.isView(input)) {
    const arr = input as ArrayLike<number>;
    return arr.length >= 16 ? arr : null;
  }
  const opts = input as Partial<CustomRenderMethodInput>;
  const m = opts.defaultProjectionData?.mainMatrix ?? opts.modelViewProjectionMatrix;
  return m && m.length >= 16 ? m : null;
}

export function computeAircraftTransforms(
  p: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  s: number,
  hdg: number,
  pitch: number = 0,
  roll: number = 0,
): { modelMatrix: Float32Array; normalMatrix: Float32Array } {
  const psi = (hdg * Math.PI) / 180;
  const theta = (pitch * Math.PI) / 180;
  const phi = (roll * Math.PI) / 180;
  const cp = Math.cos(psi), sp = Math.sin(psi);
  const ct = Math.cos(theta), st = Math.sin(theta);
  const cr = Math.cos(phi), sr = Math.sin(phi);

  const Fpx = sp * ct, Fpy = -cp * ct, Fpz = st;
  const Upx = -sp * st, Upy = cp * st, Upz = ct;
  const Sppx = cp * cr - Upx * sr, Sppy = sp * cr - Upy * sr, Sppz = -Upz * sr;
  const Uppx = cp * sr + Upx * cr, Uppy = sp * sr + Upy * cr, Uppz = Upz * cr;

  const l0 = Sppx * s, l1 = Sppy * s, l2 = Sppz * s;
  const l4 = Fpx * s,  l5 = Fpy * s,  l6 = Fpz * s;
  const l8 = Uppx * s, l9 = Uppy * s, l10 = Uppz * s;

  const m = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    const p0 = p[i], p1 = p[i + 4], p2 = p[i + 8], p3 = p[i + 12];
    m[i]      = p0 * l0 + p1 * l1 + p2 * l2;
    m[i + 4]  = p0 * l4 + p1 * l5 + p2 * l6;
    m[i + 8]  = p0 * l8 + p1 * l9 + p2 * l10;
    m[i + 12] = p0 * x  + p1 * y  + p2 * z  + p3;
  }
  const norm = new Float32Array([Sppx, Sppy, Sppz, Fpx, Fpy, Fpz, Uppx, Uppy, Uppz]);
  return { modelMatrix: m, normalMatrix: norm };
}
