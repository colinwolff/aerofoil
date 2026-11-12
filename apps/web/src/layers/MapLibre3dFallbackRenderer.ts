//! MapLibre3dFallbackRenderer — WebGL1 / non-instanced fallback path for 3D aircraft meshes.

import { MercatorCoordinate, type Map as MapLibreMap } from "maplibre-gl";
import type { AirframeCategory } from "../icons/AircraftIconMatrix";
import { getMeshForCategory } from "./AircraftMeshCatalog";
import { computeAircraftTransforms } from "./MapLibre3dMath";
import type { Target3dState } from "./MapLibre3dInstancedRenderer";
import { getCachedTerrainElevation } from "./MapLibreTerrainElevCache";
import { deadReckonInto, isActivelyExtrapolating } from "./KinematicDeadReckoning";

interface MeshGpuBuffer {
  vbo: WebGLBuffer | null;
  ibo: WebGLBuffer | null;
  count: number;
}

export class MapLibre3dFallbackRenderer {
  private program: WebGLProgram | null = null;
  private uMatrixLoc: WebGLUniformLocation | null = null;
  private uNormalMatrixLoc: WebGLUniformLocation | null = null;
  private uColorLoc: WebGLUniformLocation | null = null;
  private posAttr: number = -1;
  private normalAttr: number = -1;
  private buffers: Map<AirframeCategory, MeshGpuBuffer> = new Map();
  private matScratch = new Float32Array(16);
  private normScratch = new Float32Array(9);
  private posScratch = { lon: 0, lat: 0, altMeters: 0 };

  public onAdd(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    const vsSrc = `attribute vec3 a_pos; attribute vec3 a_normal; uniform mat4 u_matrix; uniform mat3 u_normalMatrix; varying float v_light;
      void main() {
        gl_Position = u_matrix * vec4(a_pos, 1.0);
        vec3 norm = normalize(u_normalMatrix * a_normal);
        v_light = 0.45 + 0.55 * max(dot(norm, normalize(vec3(0.2, -0.4, 0.9))), 0.0);
      }`;
    const fsSrc = `precision mediump float; uniform vec4 u_color; varying float v_light;
      void main() { gl_FragColor = vec4(u_color.rgb * v_light, u_color.a); }`;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;
    gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
    gl.shaderSource(fs, fsSrc); gl.compileShader(fs);

    this.program = gl.createProgram();
    if (!this.program) return;
    gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program);

    this.uMatrixLoc = gl.getUniformLocation(this.program, "u_matrix");
    this.uNormalMatrixLoc = gl.getUniformLocation(this.program, "u_normalMatrix");
    this.uColorLoc = gl.getUniformLocation(this.program, "u_color");
    this.posAttr = gl.getAttribLocation(this.program, "a_pos");
    this.normalAttr = gl.getAttribLocation(this.program, "a_normal");
  }

  public render(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    matrix: ArrayLike<number>,
    map: MapLibreMap | null,
    targets: IterableIterator<Target3dState>,
    zoom: number,
    nowMs: number = performance.now(),
  ): boolean {
    if (!this.program) return false;
    const gl2 = gl as WebGL2RenderingContext;
    if (typeof gl2.bindVertexArray === "function") gl2.bindVertexArray(null);

    gl.useProgram(this.program);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enableVertexAttribArray(this.posAttr);
    gl.enableVertexAttribArray(this.normalAttr);

    const minScale = 26.0 / (32.0 * 256.0 * Math.pow(2, zoom));
    let animating = false;

    for (const target of targets) {
      const buf = this.getBuffer(gl, target.category);
      if (!buf || !buf.vbo || !buf.ibo) continue;
      if (!animating && isActivelyExtrapolating(target, nowMs)) animating = true;

      deadReckonInto(target, nowMs, this.posScratch);
      const groundElev = this.posScratch.altMeters < 5000
        ? getCachedTerrainElevation(map, this.posScratch.lon, this.posScratch.lat, nowMs)
        : 0;
      const coord = MercatorCoordinate.fromLngLat(
        [this.posScratch.lon, this.posScratch.lat],
        Math.max(this.posScratch.altMeters, groundElev + 15),
      );
      const scale = Math.max(coord.meterInMercatorCoordinateUnits(), minScale);
      computeAircraftTransforms(
        matrix, coord.x, coord.y, coord.z, scale, target.heading, target.pitch, target.roll,
        this.matScratch, this.normScratch,
      );

      gl.uniformMatrix4fv(this.uMatrixLoc, false, this.matScratch);
      gl.uniformMatrix3fv(this.uNormalMatrixLoc, false, this.normScratch);
      gl.uniform4fv(this.uColorLoc, target.color);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.ibo);
      gl.vertexAttribPointer(this.posAttr, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(this.normalAttr, 3, gl.FLOAT, false, 24, 12);
      gl.drawElements(gl.TRIANGLES, buf.count, gl.UNSIGNED_SHORT, 0);
    }

    gl.disableVertexAttribArray(this.posAttr);
    gl.disableVertexAttribArray(this.normalAttr);
    return animating;
  }

  private getBuffer(gl: WebGLRenderingContext | WebGL2RenderingContext, cat: AirframeCategory): MeshGpuBuffer | null {
    const cached = this.buffers.get(cat);
    if (cached) return cached;
    const mesh = getMeshForCategory(cat);
    const vbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    if (!vbo || !ibo) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    const entry = { vbo, ibo, count: mesh.indices.length };
    this.buffers.set(cat, entry);
    return entry;
  }
}
