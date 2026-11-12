//! AircraftMeshCatalog — Low-poly 3D geometry definitions for instanced aircraft in WebGL.

import type { AirframeCategory } from "../icons/AircraftIconMatrix";

export interface AircraftMesh {
  category: AirframeCategory;
  vertices: Float32Array; // [x, y, z, nx, ny, nz] interleaved
  indices: Uint16Array;
}

function createJetMesh(): AircraftMesh {
  // Low-poly Commercial Jet (length: 32m, span: 28m, height: 7m)
  // Coordinates: X: Starboard/Port, Y: Forward/Aft, Z: Up/Down
  const vertices = new Float32Array([
    // 0: Nose tip
    0, 16, 0, 0, 1, 0,
    // 1: Fuselage top
    0, 2, 3, 0, 0.5, 0.86,
    // 2: Fuselage belly
    0, 0, -2, 0, -0.5, -0.86,
    // 3: Tail cone
    0, -16, 1, 0, -1, 0.2,
    // 4: Port wingtip
    -14, -6, 0.5, -0.2, 0, 0.98,
    // 5: Starboard wingtip
    14, -6, 0.5, 0.2, 0, 0.98,
    // 6: Vertical fin tip
    0, -15, 6.5, 0, -0.3, 0.95,
  ]);

  const indices = new Uint16Array([
    // Nose to wings & top
    0, 1, 4,
    0, 5, 1,
    0, 4, 2,
    0, 2, 5,
    // Mid fuselage & wings
    1, 3, 4,
    1, 5, 3,
    2, 4, 3,
    2, 3, 5,
    // Vertical tail fin
    1, 6, 3,
  ]);

  return { category: "Jet", vertices, indices };
}

function createHeavyMesh(): AircraftMesh {
  // Low-poly Heavy Transport (length: 48m, span: 44m, height: 10m)
  const vertices = new Float32Array([
    0, 24, 0, 0, 1, 0,
    0, 4, 4.5, 0, 0.5, 0.86,
    0, -2, -3, 0, -0.5, -0.86,
    0, -24, 1.5, 0, -1, 0.2,
    -22, -9, 1, -0.2, 0, 0.98,
    22, -9, 1, 0.2, 0, 0.98,
    0, -22, 9.5, 0, -0.3, 0.95,
  ]);

  const indices = new Uint16Array([
    0, 1, 4,
    0, 5, 1,
    0, 4, 2,
    0, 2, 5,
    1, 3, 4,
    1, 5, 3,
    2, 4, 3,
    2, 3, 5,
    1, 6, 3,
  ]);

  return { category: "Heavy", vertices, indices };
}

function createTurbopropMesh(): AircraftMesh {
  // Regional Turboprop with high straight wing and T-tail
  const vertices = new Float32Array([
    0, 14, -0.5, 0, 1, 0,
    0, 2, 2.8, 0, 0.5, 0.86,
    0, -2, -1.8, 0, -0.5, -0.86,
    0, -14, 0.5, 0, -1, 0.2,
    -14, 0, 2.5, -0.1, 0, 0.99,
    14, 0, 2.5, 0.1, 0, 0.99,
    0, -13, 5.5, 0, -0.3, 0.95,
  ]);

  const indices = new Uint16Array([
    0, 1, 4,
    0, 5, 1,
    0, 4, 2,
    0, 2, 5,
    1, 3, 4,
    1, 5, 3,
    2, 4, 3,
    2, 3, 5,
    1, 6, 3,
  ]);

  return { category: "Turboprop", vertices, indices };
}

function createHelicopterMesh(): AircraftMesh {
  // Helicopter with rotor blade disc and tail boom
  const vertices = new Float32Array([
    0, 7, 0, 0, 1, 0,
    0, 1, 2.5, 0, 0.5, 0.86,
    0, 0, -1.5, 0, -0.5, -0.86,
    0, -10, 1.2, 0, -1, 0.2,
    -6, 1, 3.2, 0, 0, 1,
    6, 1, 3.2, 0, 0, 1,
    0, -9, 3.5, 0, -0.3, 0.95,
  ]);

  const indices = new Uint16Array([
    0, 1, 2,
    1, 3, 2,
    1, 4, 3,
    1, 3, 5,
    3, 6, 1,
  ]);

  return { category: "Heli", vertices, indices };
}

function createLightGaMesh(): AircraftMesh {
  // Light General Aviation (Cessna/Piper style, length: 9m, span: 11m)
  const vertices = new Float32Array([
    0, 5, 0, 0, 1, 0,
    0, 0.8, 1.5, 0, 0.5, 0.86,
    0, -0.5, -0.9, 0, -0.5, -0.86,
    0, -5, 0.3, 0, -1, 0.2,
    -5.5, -0.5, 0.8, -0.2, 0, 0.98,
    5.5, -0.5, 0.8, 0.2, 0, 0.98,
    0, -4.5, 2.8, 0, -0.3, 0.95,
  ]);

  const indices = new Uint16Array([
    0, 1, 4,
    0, 5, 1,
    0, 4, 2,
    0, 2, 5,
    1, 3, 4,
    1, 5, 3,
    2, 4, 3,
    2, 3, 5,
    1, 6, 3,
  ]);

  return { category: "LightGA", vertices, indices };
}

const MESH_CACHE: Partial<Record<AirframeCategory, AircraftMesh>> = {};

export function getMeshForCategory(category: AirframeCategory): AircraftMesh {
  if (!MESH_CACHE[category]) {
    switch (category) {
      case "Heavy": MESH_CACHE[category] = createHeavyMesh(); break;
      case "Turboprop": MESH_CACHE[category] = createTurbopropMesh(); break;
      case "Heli": MESH_CACHE[category] = createHelicopterMesh(); break;
      case "LightGA": MESH_CACHE[category] = createLightGaMesh(); break;
      case "Jet":
      default:
        MESH_CACHE[category] = createJetMesh();
        break;
    }
  }
  return MESH_CACHE[category]!;
}
