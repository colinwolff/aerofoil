import type { Map as MapLibreMap } from "maplibre-gl";

export const MODEL_LAYER_ID = "aircraft-3d-models-layer";
const DOME_LABELS_LAYER_ID = "surveillance-dome-labels";

function isExtrusionVolumeLayer(id: string): boolean {
  return id.startsWith("vol-fill-") || id === "surveillance-dome-ribbons";
}

/** Returns the layer ID immediately after volumetric fill-extrusion overlays, if present. */
export function beforeVolumetricLayerId(map: MapLibreMap): string | undefined {
  return map.getLayer(DOME_LABELS_LAYER_ID) ? DOME_LABELS_LAYER_ID : undefined;
}

/** Returns the first 3D volumetric fill-extrusion layer ID in the active style stack. */
export function firstExtrusionLayerId(map: MapLibreMap): string | undefined {
  const m = map as unknown as { getStyle?: () => { layers?: Array<{ id: string }> } };
  const layers = m.getStyle?.()?.layers;
  if (!Array.isArray(layers)) return undefined;
  return layers.find((layer) => isExtrusionVolumeLayer(layer.id))?.id;
}

/** Ensures 3D aircraft meshes render before any translucent volumetric fill-extrusion layers. */
export function ensureModelsBeforeExtrusions(
  map: MapLibreMap,
  modelLayerId: string = MODEL_LAYER_ID,
): void {
  if (!map.getLayer(modelLayerId)) return;
  const extrusionId = firstExtrusionLayerId(map);
  if (!extrusionId) return;
  const m = map as unknown as {
    getStyle?: () => { layers?: Array<{ id: string }> };
    moveLayer?: (id: string, beforeId?: string) => void;
  };
  const layers = m.getStyle?.()?.layers;
  if (Array.isArray(layers)) {
    const modelIdx = layers.findIndex((l) => l.id === modelLayerId);
    const extIdx = layers.findIndex((l) => l.id === extrusionId);
    if (modelIdx !== -1 && extIdx !== -1 && modelIdx < extIdx) return;
  }
  m.moveLayer?.(modelLayerId, extrusionId);
}
