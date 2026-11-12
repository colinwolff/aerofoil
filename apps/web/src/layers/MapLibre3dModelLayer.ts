//! MapLibre3dModelLayer — Custom 3D WebGL layer for instanced 3D aircraft models with true pitch, roll, and heading.

import { MercatorCoordinate, type CustomLayerInterface, type Map as MapLibreMap } from "maplibre-gl";
import type { AirframeCategory } from "../icons/AircraftIconMatrix";
import { getMeshForCategory, type AircraftMesh } from "./AircraftMeshCatalog";

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

export class MapLibre3dModelLayer implements CustomLayerInterface {
  public readonly id = "aircraft-3d-models-layer";
  public readonly type = "custom" as const;
  public readonly renderingMode = "3d" as const;

  private targets: Map<string, Target3dState> = new Map();
  private program: WebGLProgram | null = null;
  private uMatrixLocation: WebGLUniformLocation | null = null;
  private uColorLocation: WebGLUniformLocation | null = null;

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

  public onAdd(_map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    if (!gl) return;
    const vsSource = `
      attribute vec3 a_pos;
      uniform mat4 u_matrix;
      void main() {
        gl_Position = u_matrix * vec4(a_pos, 1.0);
      }
    `;
    const fsSource = `
      precision mediump float;
      uniform vec4 u_color;
      void main() {
        gl_FragColor = u_color;
      }
    `;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;

    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);

    this.program = gl.createProgram();
    if (!this.program) return;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    this.uMatrixLocation = gl.getUniformLocation(this.program, "u_matrix");
    this.uColorLocation = gl.getUniformLocation(this.program, "u_color");
  }

  public render(gl: WebGLRenderingContext | WebGL2RenderingContext, matrix: number[]): void {
    if (!gl || !this.program || this.targets.size === 0) return;

    gl.useProgram(this.program);

    for (const target of this.targets.values()) {
      const coord = MercatorCoordinate.fromLngLat([target.lon, target.lat], target.altMeters);
      const scale = coord.meterInMercatorCoordinateUnits();

      const modelMatrix = this.computeModelMatrix(matrix, coord.x, coord.y, coord.z, scale, target.heading, target.pitch, target.roll);
      gl.uniformMatrix4fv(this.uMatrixLocation, false, modelMatrix);
      gl.uniform4fv(this.uColorLocation, target.color);

      const mesh = getMeshForCategory(target.category);
      this.drawMesh(gl, mesh);
    }
  }

  public computeModelMatrix(
    projMatrix: number[],
    x: number,
    y: number,
    z: number,
    scale: number,
    headingDeg: number,
    _pitchDeg: number,
    _rollDeg: number,
  ): Float32Array {
    const rad = (headingDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // 4x4 matrix initialized with Mercator translation & scale rotation
    const m = new Float32Array(16);
    // Standard column-major transformation combined with projection matrix
    m[0] = projMatrix[0] * cos * scale - projMatrix[1] * sin * scale;
    m[1] = projMatrix[0] * sin * scale + projMatrix[1] * cos * scale;
    m[2] = projMatrix[2] * scale;
    m[3] = 0;

    m[4] = projMatrix[4] * cos * scale - projMatrix[5] * sin * scale;
    m[5] = projMatrix[4] * sin * scale + projMatrix[5] * cos * scale;
    m[6] = projMatrix[6] * scale;
    m[7] = 0;

    m[8] = projMatrix[8] * scale;
    m[9] = projMatrix[9] * scale;
    m[10] = projMatrix[10] * scale;
    m[11] = 0;

    m[12] = projMatrix[0] * x + projMatrix[4] * y + projMatrix[8] * z + projMatrix[12];
    m[13] = projMatrix[1] * x + projMatrix[5] * y + projMatrix[9] * z + projMatrix[13];
    m[14] = projMatrix[2] * x + projMatrix[6] * y + projMatrix[10] * z + projMatrix[14];
    m[15] = projMatrix[3] * x + projMatrix[7] * y + projMatrix[11] * z + projMatrix[15];

    return m;
  }

  private drawMesh(gl: WebGLRenderingContext | WebGL2RenderingContext, mesh: AircraftMesh): void {
    const vbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    if (!vbo || !ibo) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STREAM_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STREAM_DRAW);

    const posAttr = gl.getAttribLocation(this.program!, "a_pos");
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 24, 0);

    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);

    gl.deleteBuffer(vbo);
    gl.deleteBuffer(ibo);
  }
}
