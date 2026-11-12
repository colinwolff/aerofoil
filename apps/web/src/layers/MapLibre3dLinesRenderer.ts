//! MapLibre3dLinesRenderer — Native 3D WebGL line renderer for altitude stems and flight trajectories.
//! Avoids 10 Hz GeoJSON setData() calls that invalidate MapLibre 3D terrain drape tiles.

import { MercatorCoordinate, type Map as MapLibreMap } from "maplibre-gl";
import type { StemTarget } from "./MapLibreAltitudeStems";
import type { TargetTrajectory } from "./MapLibreTrajectoryManager";

const FLOATS_PER_VERTEX = 7; // x, y, z, r, g, b, a

export class MapLibre3dLinesRenderer {
  private program: WebGLProgram | null = null;
  private uMatrixLoc: WebGLUniformLocation | null = null;
  private posAttr: number = -1;
  private colorAttr: number = -1;
  private vbo: WebGLBuffer | null = null;
  private scratch: Float32Array = new Float32Array(2048 * FLOATS_PER_VERTEX);

  public onAdd(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    const vsSrc = `attribute vec3 a_pos; attribute vec4 a_color; uniform mat4 u_matrix; varying vec4 v_color;
      void main() { v_color = a_color; gl_Position = u_matrix * vec4(a_pos, 1.0); }`;
    const fsSrc = `precision mediump float; varying vec4 v_color;
      void main() { gl_FragColor = v_color; }`;

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

    this.uMatrixLoc = gl.getUniformLocation(this.program, "u_matrix");
    this.posAttr = gl.getAttribLocation(this.program, "a_pos");
    this.colorAttr = gl.getAttribLocation(this.program, "a_color");
    this.vbo = gl.createBuffer();
  }

  public render(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    matrix: ArrayLike<number>,
    map: MapLibreMap | null,
    stems: StemTarget[],
    trajectories: TargetTrajectory[],
  ): void {
    if (!this.program || !this.vbo || (stems.length === 0 && trajectories.length === 0)) return;

    let segCount = 0;
    for (const s of stems) {
      if (s.altMeters >= 30) segCount++;
    }
    for (const t of trajectories) {
      if (t.points.length >= 2) segCount += t.points.length - 1;
    }
    if (segCount === 0) return;

    const needed = segCount * 2 * FLOATS_PER_VERTEX;
    if (this.scratch.length < needed) {
      this.scratch = new Float32Array(needed * 2);
    }

    const hasTerrain = Boolean(map?.getTerrain());
    let idx = 0;

    const pushVertex = (x: number, y: number, z: number, r: number, g: number, b: number, a: number) => {
      this.scratch[idx++] = x;
      this.scratch[idx++] = y;
      this.scratch[idx++] = z;
      this.scratch[idx++] = r;
      this.scratch[idx++] = g;
      this.scratch[idx++] = b;
      this.scratch[idx++] = a;
    };

    for (const s of stems) {
      if (s.altMeters < 30) continue;
      const groundElev = hasTerrain ? (map!.queryTerrainElevation([s.lon, s.lat]) ?? 0) : 0;
      const topAlt = Math.max(s.altMeters, groundElev + 15);
      const bot = MercatorCoordinate.fromLngLat([s.lon, s.lat], groundElev);
      const top = MercatorCoordinate.fromLngLat([s.lon, s.lat], topAlt);
      pushVertex(bot.x, bot.y, bot.z, 0.58, 0.64, 0.72, 0.45);
      pushVertex(top.x, top.y, top.z, 0.58, 0.64, 0.72, 0.45);
    }

    for (const t of trajectories) {
      if (t.points.length < 2) continue;
      const [r, g, b] = t.verticalRateFpm > 250
        ? [0.06, 0.73, 0.51]
        : t.verticalRateFpm < -250
          ? [0.94, 0.27, 0.27]
          : [0.02, 0.71, 0.83];

      let prev = MercatorCoordinate.fromLngLat([t.points[0].lon, t.points[0].lat], t.points[0].altMeters);
      for (let i = 1; i < t.points.length; i++) {
        const pt = t.points[i];
        const curr = MercatorCoordinate.fromLngLat([pt.lon, pt.lat], pt.altMeters);
        pushVertex(prev.x, prev.y, prev.z, r, g, b, 0.85);
        pushVertex(curr.x, curr.y, curr.z, r, g, b, 0.85);
        prev = curr;
      }
    }

    const vertexCount = idx / FLOATS_PER_VERTEX;
    if (vertexCount === 0) return;

    const gl2 = gl as WebGL2RenderingContext;
    if (typeof gl2.bindVertexArray === "function") gl2.bindVertexArray(null);

    gl.useProgram(this.program);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.uniformMatrix4fv(this.uMatrixLoc, false, new Float32Array(matrix));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.scratch.subarray(0, idx), gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(this.posAttr);
    gl.enableVertexAttribArray(this.colorAttr);
    gl.vertexAttribPointer(this.posAttr, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(this.colorAttr, 4, gl.FLOAT, false, stride, 12);

    gl.drawArrays(gl.LINES, 0, vertexCount);

    gl.disableVertexAttribArray(this.posAttr);
    gl.disableVertexAttribArray(this.colorAttr);
  }
}
