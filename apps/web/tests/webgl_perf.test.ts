import { describe, expect, test } from "bun:test";
import { MapLibre3dModelLayer } from "../src/layers/MapLibre3dModelLayer";
import { MapLibreAltitudeStems } from "../src/layers/MapLibreAltitudeStems";
import { MapLibreTrajectoryManager } from "../src/layers/MapLibreTrajectoryManager";
import { getCachedTerrainElevation } from "../src/layers/MapLibreTerrainElevCache";

function createMockWebGL2() {
  const instancedCounts: number[] = [];
  const lineBufferUploads: number[] = [];
  const lineDraws: number[] = [];
  const vaoBindings: any[] = [];
  const vpUploads: number[] = [];
  let currentVao: any = null;
  let nextVao = 1;

  const gl: any = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, ARRAY_BUFFER: 3, ELEMENT_ARRAY_BUFFER: 4,
    STATIC_DRAW: 5, DYNAMIC_DRAW: 6, DEPTH_TEST: 7, LEQUAL: 8, CULL_FACE: 9, BLEND: 10,
    SRC_ALPHA: 11, ONE_MINUS_SRC_ALPHA: 12, FLOAT: 13, TRIANGLES: 14, LINES: 15, UNSIGNED_SHORT: 16,
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getUniformLocation: (_p: any, name: string) => name,
    getAttribLocation: (_p: any, name: string) => {
      if (name === "a_pos") return 0;
      if (name === "a_normal" || name === "a_color") return 1;
      if (name.startsWith("a_m")) return 2 + Number(name.slice(3));
      return -1;
    },
    createVertexArray: () => ({ id: nextVao++ }),
    bindVertexArray: (vao: any) => { currentVao = vao; vaoBindings.push(vao); },
    vertexAttribDivisor: () => {},
    useProgram: () => {},
    enable: () => {},
    depthFunc: () => {},
    disable: () => {},
    blendFunc: () => {},
    enableVertexAttribArray: () => {},
    disableVertexAttribArray: () => {},
    createBuffer: () => ({}),
    bindBuffer: () => {},
    bufferData: (_target: number, data: ArrayBufferView, usage: number) => {
      // Count dynamic line buffer uploads when not binding an instanced VAO
      if (usage === gl.DYNAMIC_DRAW && (!currentVao || currentVao.id === 1)) {
        lineBufferUploads.push(data.byteLength);
      }
    },
    vertexAttribPointer: () => {},
    uniformMatrix4fv: (loc: string) => { if (loc === "u_vp") vpUploads.push(1); },
    drawElementsInstanced: (_mode: number, _count: number, _type: number, _off: number, instances: number) => {
      instancedCounts.push(instances);
    },
    drawArrays: (_mode: number, _first: number, count: number) => {
      lineDraws.push(count);
    },
  };
  return { gl, instancedCounts, lineBufferUploads, lineDraws, vaoBindings, vpUploads };
}

describe("AF-94 WebGL2 Instancing, DEM Cache, and Dirty Line VBOs", () => {
  test("batches 10 aircraft across 2 categories into 2 drawElementsInstanced calls with single u_vp upload", () => {
    const layer = new MapLibre3dModelLayer();
    for (let i = 0; i < 6; i++) {
      layer.updateTarget(`JET${i}`, 4.9 + i * 0.01, 52.3, 3000, 90, 0, 0, "Jet");
    }
    for (let i = 0; i < 4; i++) {
      layer.updateTarget(`HVY${i}`, 4.8 + i * 0.01, 52.4, 5000, 180, 0, 0, "Heavy");
    }

    const { gl, instancedCounts, vaoBindings, vpUploads } = createMockWebGL2();
    const fakeMap = { getZoom: () => 10, getTerrain: () => null } as any;
    const identityOpts = {
      defaultProjectionData: { mainMatrix: new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]) },
    } as any;

    layer.onAdd(fakeMap, gl);
    layer.render(gl, identityOpts);

    expect(vpUploads.length).toBe(1);
    expect(instancedCounts.sort((a, b) => a - b)).toEqual([4, 6]);
    expect(vaoBindings[vaoBindings.length - 1]).toBeNull();
  });

  test("caches DEM terrain elevation by spatial cell with TTL and fast null-tile retry", () => {
    let queries = 0;
    let fakeElevation: number | null = 425;
    const fakeMap = {
      getTerrain: () => ({ source: "dem" }),
      queryTerrainElevation: () => {
        queries++;
        return fakeElevation;
      },
    } as any;

    expect(getCachedTerrainElevation(fakeMap, 4.9041, 52.3676, 1000)).toBe(425);
    expect(getCachedTerrainElevation(fakeMap, 4.9042, 52.3677, 2500)).toBe(425); // same ~111m cell
    expect(queries).toBe(1);

    // Adjacent distinct cell triggers new query
    expect(getCachedTerrainElevation(fakeMap, 4.910, 52.370, 3000)).toBe(425);
    expect(queries).toBe(2);

    // After 10s TTL expires on cell 1, re-queries
    fakeElevation = 430;
    expect(getCachedTerrainElevation(fakeMap, 4.9041, 52.3676, 12000)).toBe(430);
    expect(queries).toBe(3);

    // Null elevation tile caches 0 briefly and retries after 500ms
    fakeElevation = null;
    expect(getCachedTerrainElevation(fakeMap, 6.0, 50.0, 12000)).toBe(0);
    expect(getCachedTerrainElevation(fakeMap, 6.0, 50.0, 12300)).toBe(0);
    expect(queries).toBe(4);
    fakeElevation = 150;
    expect(getCachedTerrainElevation(fakeMap, 6.0, 50.0, 12600)).toBe(150);
    expect(queries).toBe(5);
  });

  test("skips line VBO CPU rebuilds and bufferData across unchanged camera pan frames", () => {
    const layer = new MapLibre3dModelLayer();
    const stems = new MapLibreAltitudeStems();
    const trajs = new MapLibreTrajectoryManager();
    layer.setLineSources(stems, trajs);

    stems.updateTarget("A1234F", 4.9, 52.3, 3048);
    trajs.setTrailsMode("all");
    trajs.addCoordinate("A1234F", 4.9, 52.3, 3000, 500);
    trajs.addCoordinate("A1234F", 4.91, 52.31, 3048, 500);

    const { gl, lineBufferUploads, lineDraws } = createMockWebGL2();
    const fakeMap = { getZoom: () => 10, getTerrain: () => null } as any;
    const identityOpts = {
      defaultProjectionData: { mainMatrix: new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]) },
    } as any;

    layer.onAdd(fakeMap, gl);
    for (let f = 0; f < 5; f++) layer.render(gl, identityOpts);

    // 1 initial VBO upload; all 5 frames draw 4 vertices (1 stem + 1 traj segment)
    expect(lineBufferUploads.length).toBe(1);
    expect(lineDraws).toEqual([4, 4, 4, 4, 4]);

    // Adding a trajectory point dirties version -> triggers 2nd VBO upload with 6 vertices
    trajs.addCoordinate("A1234F", 4.92, 52.32, 3100, 500);
    layer.render(gl, identityOpts);
    expect(lineBufferUploads.length).toBe(2);
    expect(lineDraws[5]).toBe(6);
  });
});
