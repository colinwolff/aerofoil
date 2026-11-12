//! ChaseCameraManager — Manages 3D kinematic chase camera and aircraft follow tracking in MapLibre GL.

import type { TargetWire } from "@aerofoil-rs/sdk";
import type { EngineToggleManager } from "./EngineToggleManager";

export type CameraFollowMode = "off" | "follow" | "chase";

export class ChaseCameraManager {
  private mode: CameraFollowMode = "off";
  private targetIcao: string | null = null;
  private lastHeading: number = 0;
  private lastChaseAt: number = -1000;
  private onModeChangeCallbacks: ((mode: CameraFollowMode, icao: string | null) => void)[] = [];

  constructor(private toggleMgr: EngineToggleManager) {
    this.bindInterruption();
  }

  public getMode(): CameraFollowMode {
    return this.mode;
  }

  public getTargetIcao(): string | null {
    return this.targetIcao;
  }

  public onModeChange(callback: (mode: CameraFollowMode, icao: string | null) => void): void {
    this.onModeChangeCallbacks.push(callback);
  }

  public toggleChase(icao: string): boolean {
    const key = icao.toUpperCase();
    if (this.mode === "chase" && this.targetIcao === key) {
      this.stop();
      return false;
    }
    this.startChase(key);
    return true;
  }

  public startChase(icao: string): void {
    this.targetIcao = icao.toUpperCase();
    this.mode = "chase";
    if (this.toggleMgr.getMode() !== "3D") {
      this.toggleMgr.setMode("3D");
    }
    this.notify();
  }

  public startFollow(icao: string): void {
    this.targetIcao = icao.toUpperCase();
    this.mode = "follow";
    this.notify();
  }

  public stop(): void {
    if (this.mode !== "off") {
      this.mode = "off";
      this.targetIcao = null;
      this.notify();
    }
  }

  public onTargetUpdate(target: TargetWire): void {
    if (this.mode === "off" || !this.targetIcao) return;
    if (target.address.toUpperCase() !== this.targetIcao) return;

    const lat = target.latitude ?? target.lat;
    const lon = target.longitude ?? target.lon;
    if (lat == null || lon == null) return;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - this.lastChaseAt < 400) return;
    this.lastChaseAt = now;

    const engine = this.toggleMgr.getActiveEngine();
    const heading = target.heading_degrees ?? target.heading ?? this.lastHeading;
    this.lastHeading = heading;

    if (this.mode === "follow") {
      engine.setView(lat, lon, engine.getZoom());
    } else if (this.mode === "chase") {
      const map = (engine as any).map;
      if (map && typeof map.easeTo === "function") {
        map.easeTo({
          center: [lon, lat],
          bearing: heading,
          pitch: 72,
          zoom: Math.max(13, engine.getZoom()),
          duration: 380,
          essential: true,
        });
      } else {
        engine.setView(lat, lon, 13);
      }
    }
  }

  private notify(): void {
    for (const cb of this.onModeChangeCallbacks) {
      cb(this.mode, this.targetIcao);
    }
  }

  private bindInterruption(): void {
    if (typeof window === "undefined") return;

    // Disengage on drag or pan gestures on map
    const onUserInteraction = (e: Event) => {
      if (this.mode === "off") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("#map") || target?.closest("#map-3d")) {
        // Disengage chase tracking when user manually pans camera
        this.stop();
      }
    };

    window.addEventListener("mousedown", onUserInteraction);
    window.addEventListener("touchstart", onUserInteraction);

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.mode !== "off") {
        this.stop();
      }
    });
  }
}
