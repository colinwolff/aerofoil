//! MapLibre3dModelLayer — Custom WebGL 3D layer orchestrating aircraft, stems, trajectories, and HUD.

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import type { AirframeCategory } from "../icons/AircraftIconMatrix";
import { MapLibre3dLinesRenderer } from "./MapLibre3dLinesRenderer";
import { computeAircraftTransforms, extractProjectionMatrix } from "./MapLibre3dMath";
import { MapLibre3dInstancedRenderer, type Target3dState } from "./MapLibre3dInstancedRenderer";
import { MapLibre3dFallbackRenderer } from "./MapLibre3dFallbackRenderer";
import { computeFixError } from "./KinematicDeadReckoning";
import type { MapLibreAltitudeStems } from "./MapLibreAltitudeStems";
import type { MapLibreTrajectoryManager } from "./MapLibreTrajectoryManager";
import type { MapLibreHudOverlay } from "./MapLibreHudOverlay";

export type { Target3dState };

export class MapLibre3dModelLayer implements CustomLayerInterface {
  public readonly id = "aircraft-3d-models-layer";
  public readonly type = "custom" as const;
  public readonly renderingMode = "3d" as const;

  private targets: Map<string, Target3dState> = new Map();
  private map: MapLibreMap | null = null;
  private instanced: MapLibre3dInstancedRenderer | null = null;
  private fallback: MapLibre3dFallbackRenderer | null = null;
  private linesRenderer = new MapLibre3dLinesRenderer();
  private stemsSource: MapLibreAltitudeStems | null = null;
  private trajectorySource: MapLibreTrajectoryManager | null = null;
  private hudOverlay: MapLibreHudOverlay | null = null;

  public setLineSources(stems: MapLibreAltitudeStems, trajectories: MapLibreTrajectoryManager): void {
    this.stemsSource = stems;
    this.trajectorySource = trajectories;
  }

  public setHudOverlay(hud: MapLibreHudOverlay): void {
    this.hudOverlay = hud;
  }

  public updateTarget(
    address: string,
    lon: number,
    lat: number,
    altMeters: number,
    heading: number,
    pitch: number = 0,
    roll: number = 0,
    category: AirframeCategory = "Jet",
    color: [number, number, number, number] = [0.22, 0.74, 0.97, 1.0],
    groundSpeedKts: number = 0,
    verticalRateFpm: number = 0,
    nowMs: number = performance.now(),
  ): void {
    const key = address.toUpperCase();
    const err = computeFixError(this.targets.get(key), lon, lat, altMeters, nowMs);
    this.targets.set(key, {
      address: key, lon, lat, altMeters, heading, pitch, roll, category, color,
      groundSpeedKts, verticalRateFpm, updatedAtMs: nowMs, ...err,
    });
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
    this.linesRenderer.onAdd(gl);

    if (MapLibre3dInstancedRenderer.isSupported(gl)) {
      this.instanced = new MapLibre3dInstancedRenderer();
      this.instanced.onAdd(gl as WebGL2RenderingContext);
    } else {
      this.fallback = new MapLibre3dFallbackRenderer();
      this.fallback.onAdd(gl);
    }
  }

  public render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput | ArrayLike<number>): void {
    const matrix = MapLibre3dModelLayer.extractProjectionMatrix(options);
    if (!gl || !matrix) return;

    const now = performance.now();
    this.linesRenderer.render(gl, matrix, this.map, this.stemsSource, this.trajectorySource, this.targets, now);

    let animating = false;
    if (this.targets.size > 0) {
      const zoom = typeof this.map?.getZoom === "function" ? this.map.getZoom() : 8;
      if (this.instanced) {
        animating = this.instanced.render(gl as WebGL2RenderingContext, matrix, this.map, this.targets.values(), zoom, now);
      } else if (this.fallback) {
        animating = this.fallback.render(gl, matrix, this.map, this.targets.values(), zoom, now);
      }
    }

    this.hudOverlay?.draw(matrix, now);

    if (animating && typeof (this.map as any)?.triggerRepaint === "function") {
      const container = (this.map as any)?.getContainer?.();
      if (!container || !container.classList?.contains("hidden")) {
        (this.map as any).triggerRepaint();
      }
    }
  }

  public static extractProjectionMatrix(input: unknown): ArrayLike<number> | null {
    return extractProjectionMatrix(input);
  }

  public computeModelMatrix(
    p: ArrayLike<number>, x: number, y: number, z: number, scale: number, hdg: number, pitch: number = 0, roll: number = 0,
  ): Float32Array {
    return computeAircraftTransforms(p, x, y, z, scale, hdg, pitch, roll).modelMatrix;
  }
}
