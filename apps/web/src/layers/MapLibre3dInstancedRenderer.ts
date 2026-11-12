//! MapLibre3dInstancedRenderer — WebGL2 instanced aircraft mesh renderer.
//! Batches hundreds of 3D aircraft targets into <= 5 drawElementsInstanced calls per frame.

import { MercatorCoordinate, type Map as MapLibreMap } from "maplibre-gl";
import type { AirframeCategory } from "../icons/AircraftIconMatrix";
import { getMeshForCategory } from "./AircraftMeshCatalog";
import { writeLocalAircraftMatrix } from "./MapLibre3dMath";
import { getCachedTerrainElevation } from "./MapLibreTerrainElevCache";

export interface Target3dState {
  address: string;
  lon: number;
  lat: number;
  altMeters: number;
  heading: number;
  pitch: number;
  roll: number;
  category: AirframeCategory;
  color: [number, number, number, number];
}

const INSTANCE_FLOATS = 20; // 16 (mat4 model) + 4 (vec4 color)
const INSTANCE_STRIDE = INSTANCE_FLOATS * 4;

interface InstancedBucket {
  vao: WebGLVertexArrayObject | null;
  vbo: WebGLBuffer | null;
  ibo: WebGLBuffer | null;
  instanceVbo: WebGLBuffer | null;
  count: number;
  scratch: Float32Array;
  items: Target3dState[];
}

export class MapLibre3dInstancedRenderer {
  private program: WebGLProgram | null = null;
  private uVpLoc: WebGLUniformLocation | null = null;
  private vpScratch = new Float32Array(16);
  private attrs = { pos: -1, norm: -1, m: [-1, -1, -1, -1], color: -1 };
  private buckets: Map<AirframeCategory, InstancedBucket> = new Map();

  public static isSupported(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
    const g = gl as WebGL2RenderingContext;
    return (
      typeof g.drawElementsInstanced === "function" &&
      typeof g.vertexAttribDivisor === "function" &&
      typeof g.createVertexArray === "function"
    );
  }

  public onAdd(gl: WebGL2RenderingContext): void {
    const vsSrc = `attribute vec3 a_pos; attribute vec3 a_normal;
      attribute vec4 a_m0; attribute vec4 a_m1; attribute vec4 a_m2; attribute vec4 a_m3;
      attribute vec4 a_color; uniform mat4 u_vp; varying float v_light; varying vec4 v_color;
      void main() {
        gl_Position = u_vp * mat4(a_m0, a_m1, a_m2, a_m3) * vec4(a_pos, 1.0);
        vec3 norm = normalize(mat3(a_m0.xyz, a_m1.xyz, a_m2.xyz) * a_normal);
        v_light = 0.45 + 0.55 * max(dot(norm, normalize(vec3(0.2, -0.4, 0.9))), 0.0);
        v_color = a_color;
      }`;
    const fsSrc = `precision mediump float; varying float v_light; varying vec4 v_color;
      void main() { gl_FragColor = vec4(v_color.rgb * v_light, v_color.a); }`;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;
    gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
    gl.shaderSource(fs, fsSrc); gl.compileShader(fs);

    this.program = gl.createProgram();
    if (!this.program) return;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    this.uVpLoc = gl.getUniformLocation(this.program, "u_vp");
    this.attrs.pos = gl.getAttribLocation(this.program, "a_pos");
    this.attrs.norm = gl.getAttribLocation(this.program, "a_normal");
    this.attrs.m = [0, 1, 2, 3].map((i) => gl.getAttribLocation(this.program!, `a_m${i}`));
    this.attrs.color = gl.getAttribLocation(this.program, "a_color");
  }

  public render(
    gl: WebGL2RenderingContext,
    matrix: ArrayLike<number>,
    map: MapLibreMap | null,
    targets: IterableIterator<Target3dState>,
    zoom: number,
  ): void {
    if (!this.program) return;
    for (const b of this.buckets.values()) b.items.length = 0;

    let anyActive = false;
    for (const t of targets) {
      let b = this.buckets.get(t.category);
      if (!b) b = this.createBucket(gl, t.category);
      b.items.push(t);
      anyActive = true;
    }
    if (!anyActive) return;

    for (let i = 0; i < 16; i++) this.vpScratch[i] = matrix[i];
    const minScale = 26.0 / (32.0 * 256.0 * Math.pow(2, zoom));
    const now = performance.now();

    gl.useProgram(this.program);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(this.uVpLoc, false, this.vpScratch);

    for (const b of this.buckets.values()) {
      const n = b.items.length;
      if (n === 0 || !b.vao || !b.instanceVbo) continue;

      const req = n * INSTANCE_FLOATS;
      if (b.scratch.length < req) b.scratch = new Float32Array(req * 2);

      for (let i = 0; i < n; i++) {
        const t = b.items[i];
        const ground = t.altMeters < 5000 ? getCachedTerrainElevation(map, t.lon, t.lat, now) : 0;
        const coord = MercatorCoordinate.fromLngLat([t.lon, t.lat], Math.max(t.altMeters, ground + 15));
        const scale = Math.max(coord.meterInMercatorCoordinateUnits(), minScale);
        const off = i * INSTANCE_FLOATS;
        writeLocalAircraftMatrix(b.scratch, off, coord.x, coord.y, coord.z, scale, t.heading, t.pitch, t.roll);
        b.scratch[off + 16] = t.color[0];
        b.scratch[off + 17] = t.color[1];
        b.scratch[off + 18] = t.color[2];
        b.scratch[off + 19] = t.color[3];
      }

      gl.bindVertexArray(b.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.instanceVbo);
      gl.bufferData(gl.ARRAY_BUFFER, b.scratch.subarray(0, req), gl.DYNAMIC_DRAW);
      gl.drawElementsInstanced(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0, n);
    }

    gl.bindVertexArray(null);
  }

  private createBucket(gl: WebGL2RenderingContext, cat: AirframeCategory): InstancedBucket {
    const mesh = getMeshForCategory(cat);
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    const instanceVbo = gl.createBuffer();

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    if (this.attrs.pos >= 0) {
      gl.enableVertexAttribArray(this.attrs.pos);
      gl.vertexAttribPointer(this.attrs.pos, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribDivisor(this.attrs.pos, 0);
    }
    if (this.attrs.norm >= 0) {
      gl.enableVertexAttribArray(this.attrs.norm);
      gl.vertexAttribPointer(this.attrs.norm, 3, gl.FLOAT, false, 24, 12);
      gl.vertexAttribDivisor(this.attrs.norm, 0);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, instanceVbo);
    for (let c = 0; c < 4; c++) {
      const loc = this.attrs.m[c];
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, INSTANCE_STRIDE, c * 16);
        gl.vertexAttribDivisor(loc, 1);
      }
    }
    if (this.attrs.color >= 0) {
      gl.enableVertexAttribArray(this.attrs.color);
      gl.vertexAttribPointer(this.attrs.color, 4, gl.FLOAT, false, INSTANCE_STRIDE, 64);
      gl.vertexAttribDivisor(this.attrs.color, 1);
    }
    gl.bindVertexArray(null);

    const bucket: InstancedBucket = {
      vao, vbo, ibo, instanceVbo,
      count: mesh.indices.length,
      scratch: new Float32Array(32 * INSTANCE_FLOATS),
      items: [],
    };
    this.buckets.set(cat, bucket);
    return bucket;
  }
}
