//! MapLibre3dMath — Projection matrix extraction and aircraft kinematic transform math.

import type { CustomRenderMethodInput } from "maplibre-gl";

const ROT_SCRATCH = new Float32Array(9);

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

function writeRotationScratch(hdg: number, pitch: number, roll: number): Float32Array {
  const psi = (hdg * Math.PI) / 180;
  const theta = (pitch * Math.PI) / 180;
  const phi = (roll * Math.PI) / 180;
  const cp = Math.cos(psi), sp = Math.sin(psi);
  const ct = Math.cos(theta), st = Math.sin(theta);
  const cr = Math.cos(phi), sr = Math.sin(phi);

  const fpx = sp * ct, fpy = -cp * ct, fpz = st;
  const upx = -sp * st, upy = cp * st, upz = ct;
  ROT_SCRATCH[0] = cp * cr - upx * sr; ROT_SCRATCH[1] = sp * cr - upy * sr; ROT_SCRATCH[2] = -upz * sr;
  ROT_SCRATCH[3] = fpx;                ROT_SCRATCH[4] = fpy;                ROT_SCRATCH[5] = fpz;
  ROT_SCRATCH[6] = cp * sr + upx * cr; ROT_SCRATCH[7] = sp * sr + upy * cr; ROT_SCRATCH[8] = upz * cr;
  return ROT_SCRATCH;
}

/** Write local Mercator model matrix directly into preallocated buffer (zero heap allocations). */
export function writeLocalAircraftMatrix(
  out: Float32Array,
  offset: number,
  x: number,
  y: number,
  z: number,
  s: number,
  hdg: number,
  pitch: number = 0,
  roll: number = 0,
): void {
  const r = writeRotationScratch(hdg, pitch, roll);
  out[offset]      = r[0] * s; out[offset + 1]  = r[1] * s; out[offset + 2]  = r[2] * s; out[offset + 3]  = 0;
  out[offset + 4]  = r[3] * s; out[offset + 5]  = r[4] * s; out[offset + 6]  = r[5] * s; out[offset + 7]  = 0;
  out[offset + 8]  = r[6] * s; out[offset + 9]  = r[7] * s; out[offset + 10] = r[8] * s; out[offset + 11] = 0;
  out[offset + 12] = x;        out[offset + 13] = y;        out[offset + 14] = z;        out[offset + 15] = 1;
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
  mOut?: Float32Array,
  normOut?: Float32Array,
): { modelMatrix: Float32Array; normalMatrix: Float32Array } {
  const r = writeRotationScratch(hdg, pitch, roll);
  const l0 = r[0] * s, l1 = r[1] * s, l2 = r[2] * s;
  const l4 = r[3] * s, l5 = r[4] * s, l6 = r[5] * s;
  const l8 = r[6] * s, l9 = r[7] * s, l10 = r[8] * s;

  const m = mOut ?? new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    const p0 = p[i], p1 = p[i + 4], p2 = p[i + 8], p3 = p[i + 12];
    m[i]      = p0 * l0 + p1 * l1 + p2 * l2;
    m[i + 4]  = p0 * l4 + p1 * l5 + p2 * l6;
    m[i + 8]  = p0 * l8 + p1 * l9 + p2 * l10;
    m[i + 12] = p0 * x  + p1 * y  + p2 * z  + p3;
  }
  const norm = normOut ?? new Float32Array(9);
  norm.set(r);
  return { modelMatrix: m, normalMatrix: norm };
}
