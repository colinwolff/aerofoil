//! WeatherRadarLayer — Integrates live RainViewer NEXRAD precipitation radar tiles.
//! Supports playback animation, timeline scrubbing, and configurable opacity.

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
  private onFrameChangedCallbacks: ((frame: RadarFrame, index: number, total: number) => void)[] = [];

  constructor(private engine: AirspaceMapEngine) {}

  public async init(): Promise<boolean> {
    try {
      const resp = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      if (!resp.ok) {
        console.warn(`[WeatherRadarLayer] RainViewer API returned HTTP ${resp.status}`);
        return false;
      }
      const data: RainViewerApiResponse = await resp.json();
      this.host = data.host || "https://tilecache.rainviewer.com";

      const past = data.radar?.past || [];
      const nowcast = data.radar?.nowcast || [];
      this.frames = [...past, ...nowcast];

      if (this.frames.length > 0) {
        // Start at most recent historical frame
        this.currentFrameIndex = past.length > 0 ? past.length - 1 : 0;
        return true;
      }
      return false;
    } catch (e) {
      console.warn("[WeatherRadarLayer] Failed to load RainViewer weather maps:", e);
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
      this.engine.removeTileLayer("rainviewer_nexrad");
    }
  }

  public getFrames(): RadarFrame[] {
    return this.frames;
  }

  public getCurrentFrameIndex(): number {
    return this.currentFrameIndex;
  }

  public setFrameIndex(index: number): void {
    if (index >= 0 && index < this.frames.length) {
      this.currentFrameIndex = index;
      if (this.isVisible) {
        this.renderCurrentFrame();
      }
      this.notifyFrameChanged();
    }
  }

  public setOpacity(opacity: number): void {
    this.opacity = opacity;
    this.engine.setLayerOpacity("rainviewer_nexrad", opacity);
  }

  public play(intervalMs: number = 800): void {
    if (this.isPlaying || this.frames.length === 0) return;
    this.isPlaying = true;
    this.playIntervalId = setInterval(() => {
      this.currentFrameIndex = (this.currentFrameIndex + 1) % this.frames.length;
      if (this.isVisible) {
        this.renderCurrentFrame();
      }
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
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
    return this.isPlaying;
  }

  public onFrameChanged(callback: (frame: RadarFrame, index: number, total: number) => void): void {
    this.onFrameChangedCallbacks.push(callback);
  }

  private notifyFrameChanged(): void {
    if (this.currentFrameIndex >= 0 && this.currentFrameIndex < this.frames.length) {
      const frame = this.frames[this.currentFrameIndex];
      for (const cb of this.onFrameChangedCallbacks) {
        cb(frame, this.currentFrameIndex, this.frames.length);
      }
    }
  }

  private renderCurrentFrame(): void {
    if (!this.isVisible || this.currentFrameIndex < 0 || this.currentFrameIndex >= this.frames.length) {
      return;
    }
    const frame = this.frames[this.currentFrameIndex];
    // RainViewer tile format: {host}{path}/256/{z}/{x}/{y}/2/1_1.png
    // path already contains /v2/radar/...
    const tileUrl = `${this.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;

    this.engine.addOverlayTileLayer(
      "rainviewer_nexrad",
      tileUrl,
      'Precipitation &copy; <a href="https://www.rainviewer.com/" target="_blank">RainViewer</a>',
      {
        opacity: this.opacity,
        maxZoom: 12,
        zIndex: 5,
        pane: "weatherPane",
      },
    );
  }
}
