//! MapLibre3dModelLayer — Custom 3D WebGL layer for instanced 3D aircraft models with true pitch, roll, and heading.

import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MapLibreMap } from "maplibre-gl";
import type { AirframeCategory } from "../icons/AircraftIconMatrix";
import { getMeshForCategory } from "./AircraftMeshCatalog";

export interface Target3dState {
  address: string;
  lon: number;
  lat: number;
  altMeters: number;
  heading: number; // 0..360 deg
  pitch: number;   // -90..+90 deg
  roll: number;    // -180..+180 deg
  category: AirframeCategory;
  color: [number, number, number, number];
}

interface MeshGpuBuffer {
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  count: number;
}

export class MapLibre3dModelLayer implements CustomLayerInterface {
  public readonly id = "aircraft-3d-models-layer";
  public readonly type = "custom" as const;
  public readonly renderingMode = "3d" as const;

  private targets: Map<string, Target3dState> = new Map();
  private map: MapLibreMap | null = null;
  private program: WebGLProgram | null = null;
  private uMatrixLoc: WebGLUniformLocation | null = null;
  private uNormalMatrixLoc: WebGLUniformLocation | null = null;
  private uColorLoc: WebGLUniformLocation | null = null;
  private posAttr: number = -1;
  private normalAttr: number = -1;
  private buffers: Map<AirframeCategory, MeshGpuBuffer> = new Map();

  public updateTarget(
    address: string,
    lon: number,
    lat: number,
    altMeters: number,
    heading: number = 0,
    pitch: number = 0,
    roll: number = 0,
    category: AirframeCategory = "Jet",
    color: [number, number, number, number] = [0.02, 0.71, 0.83, 1.0],
  ): void {
    const key = address.toUpperCase();
    this.targets.set(key, { address: key, lon, lat, altMeters, heading, pitch, roll, category, color });
  }

  public removeTarget(address: string): void {
    this.targets.delete(address.toUpperCase());
  }

  public getTarget(address: string): Target3dState | undefined {
    return this.targets.get(address.toUpperCase());
  }

  public getTargets(): Target3dState[] {
    return Array.from(this.targets.values());
  }

  public onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    if (!gl) return;
    this.map = map;
    const vsSource = `attribute vec3 a_pos; attribute vec3 a_normal; uniform mat4 u_matrix; uniform mat3 u_normal_matrix; varying float v_light;
      void main() {
        vec3 norm = normalize(u_normal_matrix * a_normal);
        v_light = 0.45 + 0.55 * max(dot(norm, normalize(vec3(0.2, -0.4, 0.9))), 0.0);
        gl_Position = u_matrix * vec4(a_pos, 1.0);
      }`;
    const fsSource = `precision mediump float; uniform vec4 u_color; varying float v_light;
      void main() { gl_FragColor = vec4(u_color.rgb * v_light, u_color.a); }`;

    const vs = gl.createShader(gl.VERTEX_SHADER); const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;
    gl.shaderSource(vs, vsSource); gl.compileShader(vs);
    gl.shaderSource(fs, fsSource); gl.compileShader(fs);

    this.program = gl.createProgram();
    if (!this.program) return;
    gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program);

    this.uMatrixLoc = gl.getUniformLocation(this.program, "u_matrix");
    this.uNormalMatrixLoc = gl.getUniformLocation(this.program, "u_normal_matrix");
    this.uColorLoc = gl.getUniformLocation(this.program, "u_color");
    this.posAttr = gl.getAttribLocation(this.program, "a_pos");
    this.normalAttr = gl.getAttribLocation(this.program, "a_normal");
  }

  public render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput | ArrayLike<number>): void {
    const matrix = MapLibre3dModelLayer.extractProjectionMatrix(options);
    if (!gl || !this.program || !matrix || this.targets.size === 0) return;

    const gl2 = gl as WebGL2RenderingContext;
    if (typeof gl2.bindVertexArray === "function") gl2.bindVertexArray(null);

    gl.useProgram(this.program);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.enableVertexAttribArray(this.posAttr);
    gl.enableVertexAttribArray(this.normalAttr);

    const zoom = this.map ? this.map.getZoom() : 10;
    const hasTerrain = Boolean(this.map?.getTerrain());

    for (const target of this.targets.values()) {
      const groundElev = hasTerrain ? (this.map!.queryTerrainElevation([target.lon, target.lat]) ?? 0) : 0;
      const altMeters = Math.max(target.altMeters, groundElev + 15);
      const coord = MercatorCoordinate.fromLngLat([target.lon, target.lat], altMeters);
      const meterScale = coord.meterInMercatorCoordinateUnits();
      const minScale = 26.0 / (32.0 * 256.0 * Math.pow(2, zoom));
      const scale = Math.max(meterScale, minScale);

      const { modelMatrix, normalMatrix } = this.computeTransforms(
        matrix, coord.x, coord.y, coord.z, scale, target.heading, target.pitch, target.roll,
      );

      gl.uniformMatrix4fv(this.uMatrixLoc, false, modelMatrix);
      if (this.uNormalMatrixLoc) gl.uniformMatrix3fv(this.uNormalMatrixLoc, false, normalMatrix);
      gl.uniform4fv(this.uColorLoc, target.color);

      const buf = this.getBuffer(gl, target.category);
      if (!buf) continue;

      gl.bindBuffer(gl.ARRAY_BUFFER, buf.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.ibo);
      gl.vertexAttribPointer(this.posAttr, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(this.normalAttr, 3, gl.FLOAT, false, 24, 12);

      gl.drawElements(gl.TRIANGLES, buf.count, gl.UNSIGNED_SHORT, 0);
    }

    gl.disableVertexAttribArray(this.posAttr);
    gl.disableVertexAttribArray(this.normalAttr);
  }

  public static extractProjectionMatrix(input: unknown): ArrayLike<number> | null {
    if (!input) return null;
    if (Array.isArray(input) || ArrayBuffer.isView(input)) {
      const arr = input as ArrayLike<number>;
      return arr.length >= 16 ? arr : null;
    }
    const opts = input as Partial<CustomRenderMethodInput>;
    const m = opts.defaultProjectionData?.mainMatrix ?? opts.modelViewProjectionMatrix;
    return m && m.length >= 16 ? m : null;
  }

  public computeModelMatrix(
    p: ArrayLike<number>, x: number, y: number, z: number, scale: number, hdg: number, pitch: number = 0, roll: number = 0,
  ): Float32Array {
    return this.computeTransforms(p, x, y, z, scale, hdg, pitch, roll).modelMatrix;
  }

  private computeTransforms(
    p: ArrayLike<number>, x: number, y: number, z: number, s: number, hdg: number, pitch: number = 0, roll: number = 0,
  ): { modelMatrix: Float32Array; normalMatrix: Float32Array } {
    const psi = (hdg * Math.PI) / 180, theta = (pitch * Math.PI) / 180, phi = (roll * Math.PI) / 180;
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

  private getBuffer(gl: WebGLRenderingContext | WebGL2RenderingContext, cat: AirframeCategory): MeshGpuBuffer | null {
    let buf = this.buffers.get(cat);
    if (!buf) {
      const mesh = getMeshForCategory(cat);
      const vbo = gl.createBuffer(); const ibo = gl.createBuffer();
      if (!vbo || !ibo) return null;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      buf = { vbo, ibo, count: mesh.indices.length };
      this.buffers.set(cat, buf);
    }
    return buf;
  }
}
