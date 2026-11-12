import { describe, expect, test } from "bun:test";
import { getMeshForCategory } from "../src/layers/AircraftMeshCatalog";
import { MapLibre3dModelLayer } from "../src/layers/MapLibre3dModelLayer";
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
});
