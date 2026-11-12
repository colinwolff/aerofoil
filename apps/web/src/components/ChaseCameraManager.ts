//! ChaseCameraManager — Frame-synced 3D kinematic chase camera and aircraft follow tracking.

import type { TargetWire } from "@aerofoil-rs/sdk";
import type { EngineToggleManager } from "./EngineToggleManager";
import { computeFixError, deadReckonInto, isActivelyExtrapolating, type KinematicState } from "../layers/KinematicDeadReckoning";

export type CameraFollowMode = "off" | "follow" | "chase";

export class ChaseCameraManager {
  private mode: CameraFollowMode = "off";
  private targetIcao: string | null = null;
  private lastHeading: number = 0;
  private smoothedBearing: number | null = null;
  private chasedState: KinematicState | null = null;
  private lastStepAt: number = 0;
  private lastFollowAt: number = -1000;
  private rafId: number | null = null;
  private posScratch = { lon: 0, lat: 0, altMeters: 0 };
  private onModeChangeCallbacks: ((mode: CameraFollowMode, icao: string | null) => void)[] = [];

  constructor(private toggleMgr: EngineToggleManager) {
    this.bindInterruption();
  }

  public getMode(): CameraFollowMode { return this.mode; }
  public getTargetIcao(): string | null { return this.targetIcao; }
  public onModeChange(callback: (mode: CameraFollowMode, icao: string | null) => void): void {
    this.onModeChangeCallbacks.push(callback);
  }

  public toggleChase(icao: string): boolean {
    const key = icao.toUpperCase();
    if (this.mode === "chase" && this.targetIcao === key) { this.stop(); return false; }
    this.startChase(key);
    return true;
  }

  public startChase(icao: string): void {
    const key = icao.toUpperCase();
    if (this.targetIcao !== key) { this.chasedState = null; this.smoothedBearing = null; }
    this.targetIcao = key;
    this.mode = "chase";
    if (this.toggleMgr.getMode() !== "3D") this.toggleMgr.setMode("3D");
    this.notify();
  }

  public startFollow(icao: string): void {
    const key = icao.toUpperCase();
    if (this.targetIcao !== key) { this.chasedState = null; this.smoothedBearing = null; }
    this.targetIcao = key;
    this.mode = "follow";
    this.notify();
  }

  public stop(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.chasedState = null;
    this.smoothedBearing = null;
    if (this.mode !== "off") {
      this.mode = "off";
      this.targetIcao = null;
      this.notify();
    }
  }

  public onTargetUpdate(target: TargetWire, nowMs: number = performance.now()): void {
    if (this.mode === "off" || !this.targetIcao) return;
    if (target.address.toUpperCase() !== this.targetIcao) return;

    const lat = target.latitude ?? target.lat;
    const lon = target.longitude ?? target.lon;
    if (lat == null || lon == null) return;

    const heading = target.heading_degrees ?? target.heading ?? this.lastHeading;
    this.lastHeading = heading;
    const altMeters = (target.altitude ?? 0) * 0.3048;
    const speedKts = target.ground_speed_knots ?? target.ground_speed ?? 0;
    const vRateFpm = (target as any).vertical_rate_fpm ?? (target as any).vertical_rate ?? 0;

    const err = computeFixError(this.chasedState ?? undefined, lon, lat, altMeters, nowMs);
    this.chasedState = {
      lon, lat, altMeters, heading, groundSpeedKts: speedKts, verticalRateFpm: vRateFpm,
      updatedAtMs: nowMs, ...err,
    };
    if (this.smoothedBearing === null) this.smoothedBearing = heading;

    this.stepFrame(nowMs);
    this.ensureAnimationLoop();
  }

  public stepFrame(nowMs: number = performance.now()): void {
    if (this.mode === "off" || !this.chasedState) return;
    deadReckonInto(this.chasedState, nowMs, this.posScratch);

    const engine = this.toggleMgr.getActiveEngine();
    if (this.mode === "follow") {
      if (nowMs - this.lastFollowAt < 250) return;
      this.lastFollowAt = nowMs;
      engine.setView(this.posScratch.lat, this.posScratch.lon, engine.getZoom());
      return;
    }

    const dt = this.lastStepAt > 0 ? Math.min(0.1, Math.max(0, (nowMs - this.lastStepAt) / 1000)) : 0;
    this.lastStepAt = nowMs;
    const targetB = this.chasedState.heading;
    if (this.smoothedBearing === null) {
      this.smoothedBearing = targetB;
    } else if (dt > 0) {
      const delta = ((targetB - this.smoothedBearing + 540) % 360) - 180;
      this.smoothedBearing = (this.smoothedBearing + delta * Math.min(1, dt * 6) + 360) % 360;
    }

    const map = (engine as any).map;
    const camOpts = {
      center: [this.posScratch.lon, this.posScratch.lat],
      bearing: this.smoothedBearing,
      pitch: 72,
      zoom: Math.max(13, engine.getZoom()),
    };
    if (map && typeof map.jumpTo === "function") {
      map.jumpTo(camOpts);
    } else if (map && typeof map.easeTo === "function") {
      map.easeTo({ ...camOpts, duration: 0, essential: true });
    } else {
      engine.setView(this.posScratch.lat, this.posScratch.lon, 13);
    }
  }

  private ensureAnimationLoop(): void {
    if (this.mode !== "chase" || this.rafId !== null || typeof requestAnimationFrame !== "function") return;
    const tick = (t: number) => {
      this.rafId = null;
      if (this.mode !== "chase" || !this.chasedState) return;
      if (isActivelyExtrapolating(this.chasedState, t)) {
        this.stepFrame(t);
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private notify(): void {
    for (const cb of this.onModeChangeCallbacks) cb(this.mode, this.targetIcao);
  }

  private bindInterruption(): void {
    if (typeof window === "undefined") return;
    const onUserInteraction = (e: Event) => {
      if (this.mode === "off") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("#map") || target?.closest("#map-3d")) this.stop();
    };
    window.addEventListener("mousedown", onUserInteraction);
    window.addEventListener("touchstart", onUserInteraction);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.mode !== "off") this.stop();
    });
  }
}
