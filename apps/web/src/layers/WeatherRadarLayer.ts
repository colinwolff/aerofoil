//! WeatherRadarLayer — Integrates live RainViewer NEXRAD precipitation radar tiles.
//! Preloads adjacent frames and swaps layer opacities for fluid, zero-flicker timeline playback.

import type { AirspaceMapEngine } from "./AirspaceMapEngine";

export interface RadarFrame {
  time: number;
  path: string;
}

export interface RainViewerApiResponse {
  host: string;
  radar?: {
    past?: RadarFrame[];
    nowcast?: RadarFrame[];
  };
}

export class WeatherRadarLayer {
  private frames: RadarFrame[] = [];
  private host: string = "https://tilecache.rainviewer.com";
  private currentFrameIndex: number = -1;
  private isPlaying: boolean = false;
  private playIntervalId: any = null;
  private opacity: number = 0.65;
  private isVisible: boolean = false;
  private cachedLayerIds: Set<string> = new Set();
  private activeLayerId: string | null = null;
  private onFrameChangedCallbacks: ((frame: RadarFrame, index: number, total: number) => void)[] = [];

  constructor(private engine: AirspaceMapEngine) {}

  public async init(): Promise<boolean> {
    try {
      const resp = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      if (!resp.ok) return false;
      const data: RainViewerApiResponse = await resp.json();
      this.host = data.host || "https://tilecache.rainviewer.com";

      const past = data.radar?.past || [];
      const nowcast = data.radar?.nowcast || [];
      this.frames = [...past, ...nowcast];

      if (this.frames.length > 0) {
        this.currentFrameIndex = past.length > 0 ? past.length - 1 : 0;
        this.notifyFrameChanged();
        if (this.isVisible) this.renderCurrentFrame();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (visible) {
      if (this.currentFrameIndex >= 0 && this.currentFrameIndex < this.frames.length) {
        this.renderCurrentFrame();
      }
    } else {
      this.pause();
      this.clearLayers();
    }
  }

  public setEngine(newEngine: AirspaceMapEngine): void {
    if (this.isVisible) this.clearLayers();
    this.engine = newEngine;
    if (this.isVisible) this.renderCurrentFrame();
  }

  public isLayerVisible(): boolean { return this.isVisible; }
  public getFrames(): RadarFrame[] { return this.frames; }
  public getCurrentFrameIndex(): number { return this.currentFrameIndex; }

  public setFrameIndex(index: number): void {
    if (index >= 0 && index < this.frames.length) {
      this.currentFrameIndex = index;
      if (this.isVisible) this.renderCurrentFrame();
      this.notifyFrameChanged();
    }
  }

  public setOpacity(opacity: number): void {
    this.opacity = opacity;
    if (this.activeLayerId) this.engine.setLayerOpacity(this.activeLayerId, opacity);
  }

  public play(intervalMs: number = 800): void {
    if (this.isPlaying || this.frames.length === 0) return;
    this.isPlaying = true;
    this.playIntervalId = setInterval(() => {
      this.currentFrameIndex = (this.currentFrameIndex + 1) % this.frames.length;
      if (this.isVisible) this.renderCurrentFrame();
      this.notifyFrameChanged();
    }, intervalMs);
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.playIntervalId) {
      clearInterval(this.playIntervalId);
      this.playIntervalId = null;
    }
  }

  public togglePlay(): boolean {
    if (this.isPlaying) this.pause();
    else this.play();
    return this.isPlaying;
  }

  public onFrameChanged(callback: (frame: RadarFrame, index: number, total: number) => void): void {
    this.onFrameChangedCallbacks.push(callback);
  }

  private notifyFrameChanged(): void {
    if (this.currentFrameIndex >= 0 && this.currentFrameIndex < this.frames.length) {
      const frame = this.frames[this.currentFrameIndex];
      for (const cb of this.onFrameChangedCallbacks) cb(frame, this.currentFrameIndex, this.frames.length);
    }
  }

  private mountFrame(frame: RadarFrame, opacity: number): string {
    const layerId = `rainviewer_${frame.time}`;
    if (!this.cachedLayerIds.has(layerId)) {
      const tileUrl = `${this.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
      this.engine.addOverlayTileLayer(layerId, tileUrl, 'Precipitation &copy; RainViewer', {
        opacity,
        maxZoom: 12,
        zIndex: 5,
        pane: "weatherPane",
      });
      this.cachedLayerIds.add(layerId);
    } else {
      this.engine.setLayerOpacity(layerId, opacity);
    }
    return layerId;
  }

  private renderCurrentFrame(): void {
    if (!this.isVisible || this.currentFrameIndex < 0 || this.currentFrameIndex >= this.frames.length) return;
    const newLayerId = this.mountFrame(this.frames[this.currentFrameIndex], this.opacity);
    if (this.activeLayerId && this.activeLayerId !== newLayerId) {
      this.engine.setLayerOpacity(this.activeLayerId, 0);
    }
    this.activeLayerId = newLayerId;
    this.preloadAdjacentFrames();
  }

  private preloadAdjacentFrames(): void {
    if (this.frames.length <= 1) return;
    const nextIdx = (this.currentFrameIndex + 1) % this.frames.length;
    const prevIdx = (this.currentFrameIndex - 1 + this.frames.length) % this.frames.length;
    for (const idx of [nextIdx, prevIdx]) {
      this.mountFrame(this.frames[idx], 0);
    }
  }

  private clearLayers(): void {
    for (const id of this.cachedLayerIds) this.engine.removeTileLayer(id);
    this.cachedLayerIds.clear();
    this.activeLayerId = null;
  }
}
