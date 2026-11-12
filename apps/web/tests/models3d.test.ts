import { describe, expect, test } from "bun:test";
import { getMeshForCategory } from "../src/layers/AircraftMeshCatalog";
import { MapLibre3dModelLayer } from "../src/layers/MapLibre3dModelLayer";
import { MapLibreAltitudeStems } from "../src/layers/MapLibreAltitudeStems";
import { MapLibreTrajectoryManager } from "../src/layers/MapLibreTrajectoryManager";
import type { AirframeCategory } from "../src/icons/AircraftIconMatrix";

describe("AircraftMeshCatalog Low-Poly Archetypes", () => {
  const categories: AirframeCategory[] = ["Jet", "Heavy", "Turboprop", "Heli", "LightGA"];

  test.each(categories)("generates valid 3D vertex and index buffers for %s", (category) => {
    const mesh = getMeshForCategory(category);
    expect(mesh.category).toBe(category);
    expect(mesh.vertices.length).toBeGreaterThan(18); // At least 3 vertices (3 pos + 3 norm)
    expect(mesh.indices.length).toBeGreaterThan(6);   // At least 2 triangles

    // Check vertex positions contain non-zero coordinates
    let hasNonZeroX = false;
    let hasNonZeroY = false;
    let hasNonZeroZ = false;
    for (let i = 0; i < mesh.vertices.length; i += 6) {
      if (mesh.vertices[i] !== 0) hasNonZeroX = true;
      if (mesh.vertices[i + 1] !== 0) hasNonZeroY = true;
      if (mesh.vertices[i + 2] !== 0) hasNonZeroZ = true;
    }
    expect(hasNonZeroX).toBe(true);
    expect(hasNonZeroY).toBe(true);
    expect(hasNonZeroZ).toBe(true);
  });
});

describe("MapLibre3dModelLayer Custom WebGL Layer", () => {
  test("maintains instanced 3D targets with kinematic attitude", () => {
    const layer = new MapLibre3dModelLayer();
    expect(layer.id).toBe("aircraft-3d-models-layer");
    expect(layer.type).toBe("custom");
    expect(layer.renderingMode).toBe("3d");

    layer.updateTarget(
      "A1234F",
      -122.3,
      47.5,
      3048, // 10000 ft in meters
      180,  // Heading South
      5,    // 5 deg climb pitch
      -15,  // 15 deg left bank roll
      "Jet",
      [0.1, 0.6, 0.9, 1.0],
    );

    const target = layer.getTarget("A1234F");
    expect(target).toBeDefined();
    expect(target?.heading).toBe(180);
    expect(target?.pitch).toBe(5);
    expect(target?.roll).toBe(-15);
    expect(target?.category).toBe("Jet");
    expect(layer.getTargets().length).toBe(1);

    layer.removeTarget("A1234F");
    expect(layer.getTarget("A1234F")).toBeUndefined();
    expect(layer.getTargets().length).toBe(0);
  });

  test("computes combined Mercator model projection matrix", () => {
    const layer = new MapLibre3dModelLayer();
    const identityProj = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];

    const modelMatrix = layer.computeModelMatrix(
      identityProj,
      0.5, // x
      0.5, // y
      0.01, // z
      0.0001, // scale
      90, // heading East
      0,
      0,
    );

    expect(modelMatrix.length).toBe(16);
    // Translation column elements
    expect(modelMatrix[12]).toBeCloseTo(0.5);
    expect(modelMatrix[13]).toBeCloseTo(0.5);
    expect(modelMatrix[14]).toBeCloseTo(0.01);
    expect(modelMatrix[15]).toBeCloseTo(1.0);
  });

  test("applies pitch and roll to model transformation matrix", () => {
    const layer = new MapLibre3dModelLayer();
    const identityProj = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];

    // Climb pitch 30 deg, right roll 45 deg, heading North (0 deg)
    const matrix = layer.computeModelMatrix(identityProj, 0.5, 0.5, 0.05, 0.001, 0, 30, 45);
    expect(matrix.length).toBe(16);
    // Forward vector (column 1) must have positive Z component (climb)
    expect(matrix[6]).toBeGreaterThan(0);
    // Starboard vector (column 0) must have negative Z component (right wing down)
    expect(matrix[2]).toBeLessThan(0);
  });

  test("extracts projection matrix from MapLibre v6 CustomRenderMethodInput and legacy arrays", () => {
    const mainMatrix = new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    const fallbackMatrix = [2,0,0,0, 0,2,0,0, 0,0,2,0, 0,0,0,1];

    expect(MapLibre3dModelLayer.extractProjectionMatrix(fallbackMatrix)).toBe(fallbackMatrix);
    expect(
      MapLibre3dModelLayer.extractProjectionMatrix({
        defaultProjectionData: { mainMatrix },
        modelViewProjectionMatrix: fallbackMatrix,
      }),
    ).toBe(mainMatrix);
    expect(
      MapLibre3dModelLayer.extractProjectionMatrix({
        modelViewProjectionMatrix: fallbackMatrix,
      }),
    ).toBe(fallbackMatrix);
    expect(MapLibre3dModelLayer.extractProjectionMatrix({})).toBeNull();
  });

  test("render unbinds WebGL2 VAO and uploads non-NaN u_matrix with MapLibre v6 options", () => {
    const layer = new MapLibre3dModelLayer();
    layer.updateTarget("A1234F", -122.3, 47.5, 3048, 90, 0, 0, "Jet");

    const vaoCalls: any[] = [];
    const uploadedMatrices: Float32Array[] = [];
    let drawCalls = 0;

    const fakeGl = {
      VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, ARRAY_BUFFER: 3, ELEMENT_ARRAY_BUFFER: 4,
      STATIC_DRAW: 5, DEPTH_TEST: 6, LEQUAL: 7, CULL_FACE: 8, BLEND: 9,
      SRC_ALPHA: 10, ONE_MINUS_SRC_ALPHA: 11, FLOAT: 12, TRIANGLES: 13, UNSIGNED_SHORT: 14,
      createShader: () => ({}),
      shaderSource: () => {},
      compileShader: () => {},
      createProgram: () => ({}),
      attachShader: () => {},
      linkProgram: () => {},
      getUniformLocation: (_p: any, name: string) => name,
      getAttribLocation: (_p: any, name: string) => (name === "a_pos" ? 0 : 1),
      bindVertexArray: (vao: any) => { vaoCalls.push(vao); },
      useProgram: () => {},
      enable: () => {},
      depthFunc: () => {},
      disable: () => {},
      blendFunc: () => {},
      enableVertexAttribArray: () => {},
      disableVertexAttribArray: () => {},
      createBuffer: () => ({}),
      bindBuffer: () => {},
      bufferData: () => {},
      vertexAttribPointer: () => {},
      uniformMatrix4fv: (_loc: any, _t: boolean, val: Float32Array) => { uploadedMatrices.push(new Float32Array(val)); },
      uniformMatrix3fv: () => {},
      uniform4fv: () => {},
      drawElements: () => { drawCalls++; },
    } as any;

    const fakeMap = { getZoom: () => 10, getTerrain: () => null } as any;
    layer.onAdd(fakeMap, fakeGl);
    layer.render(fakeGl, {
      defaultProjectionData: { mainMatrix: new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]) },
    } as any);

    expect(vaoCalls).toEqual([null]);
    expect(drawCalls).toBe(1);
    expect(uploadedMatrices.length).toBe(1);
    expect(Array.from(uploadedMatrices[0]).every((n) => Number.isFinite(n))).toBe(true);
  });

  test("renders 3D stems and trajectories natively via WebGL LINES without GeoJSON setData", () => {
    const layer = new MapLibre3dModelLayer();
    const stems = new MapLibreAltitudeStems();
    const trajs = new MapLibreTrajectoryManager();
    layer.setLineSources(stems, trajs);

    stems.updateTarget("A1234F", -122.3, 47.5, 3048);
    trajs.setTrailsMode("all");
    trajs.addCoordinate("A1234F", -122.3, 47.5, 3000, 600);
    trajs.addCoordinate("A1234F", -122.31, 47.51, 3048, 600);

    let lineVertexCount = 0;
    const fakeGl = {
      VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, ARRAY_BUFFER: 3, ELEMENT_ARRAY_BUFFER: 4,
      STATIC_DRAW: 5, DYNAMIC_DRAW: 6, DEPTH_TEST: 7, LEQUAL: 8, CULL_FACE: 9, BLEND: 10,
      SRC_ALPHA: 11, ONE_MINUS_SRC_ALPHA: 12, FLOAT: 13, TRIANGLES: 14, LINES: 15, UNSIGNED_SHORT: 16,
      createShader: () => ({}), shaderSource: () => {}, compileShader: () => {},
      createProgram: () => ({}), attachShader: () => {}, linkProgram: () => {},
      getUniformLocation: (_p: any, name: string) => name,
      getAttribLocation: (_p: any, name: string) => (name === "a_pos" ? 0 : 1),
      bindVertexArray: () => {}, useProgram: () => {}, enable: () => {}, depthFunc: () => {},
      disable: () => {}, blendFunc: () => {}, enableVertexAttribArray: () => {}, disableVertexAttribArray: () => {},
      createBuffer: () => ({}), bindBuffer: () => {}, bufferData: () => {}, vertexAttribPointer: () => {},
      uniformMatrix4fv: () => {}, uniformMatrix3fv: () => {}, uniform4fv: () => {},
      drawElements: () => {},
      drawArrays: (_mode: number, _first: number, count: number) => { lineVertexCount = count; },
    } as any;

    const fakeMap = { getZoom: () => 10, getTerrain: () => null } as any;
    layer.onAdd(fakeMap, fakeGl);
    layer.render(fakeGl, {
      defaultProjectionData: { mainMatrix: new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]) },
    } as any);

    // 1 stem (2 vertices) + 1 trajectory segment (2 vertices) = 4 vertices
    expect(lineVertexCount).toBe(4);
  });
});
