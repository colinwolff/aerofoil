//! WeatherScrubber — Floating timeline playback scrubber control for live NEXRAD weather radar.

import type { WeatherRadarLayer, RadarFrame } from "../layers/WeatherRadarLayer";

export class WeatherScrubber {
  private containerEl: HTMLElement | null = null;
  private playBtn: HTMLButtonElement | null = null;
  private prevBtn: HTMLButtonElement | null = null;
  private nextBtn: HTMLButtonElement | null = null;
  private slider: HTMLInputElement | null = null;
  private timeLabel: HTMLElement | null = null;
  private opacitySlider: HTMLInputElement | null = null;
  private opacityPct: HTMLElement | null = null;

  constructor(private weatherLayer: WeatherRadarLayer) {}

  public init(containerId: string = "weather-scrubber-dock"): void {
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement("div");
      container.id = containerId;
      document.body.appendChild(container);
    }
    container.classList.add("weather-scrubber-dock", "hidden");
    this.containerEl = container;

    container.innerHTML = `
      <div class="scrubber-card">
        <button id="weather-prev-btn" class="scrubber-step-btn" title="Previous Radar Frame">⏮</button>
        <button id="weather-play-btn" class="scrubber-btn" title="Play / Pause Radar Loop">▶</button>
        <button id="weather-next-btn" class="scrubber-step-btn" title="Next Radar Frame">⏭</button>
        <div class="scrubber-timeline">
          <input type="range" id="weather-frame-slider" min="0" max="0" value="0" step="1" />
          <span id="weather-time-label" class="scrubber-timestamp">Live</span>
        </div>
        <div class="scrubber-opacity-group">
          <span class="scrubber-caption">Opacity:</span>
          <input type="range" id="weather-opacity-slider" min="0.1" max="1.0" step="0.05" value="0.65" />
          <span id="weather-opacity-pct" class="scrubber-pct">65%</span>
        </div>
        <button id="weather-close-btn" class="scrubber-close-btn" title="Close Scrubber Dock">&times;</button>
      </div>
    `;

    this.bindDomElements();
    this.bindEvents();
    this.syncFromLayer();
  }

  public setVisible(visible: boolean): void {
    if (this.containerEl) {
      if (visible) {
        this.containerEl.classList.remove("hidden");
        this.syncFromLayer();
      } else {
        this.containerEl.classList.add("hidden");
        this.weatherLayer.pause();
        if (this.playBtn) this.playBtn.textContent = "▶";
      }
    }
  }

  public toggleVisible(): boolean {
    const isHidden = this.containerEl?.classList.contains("hidden") ?? true;
    this.setVisible(isHidden);
    return isHidden;
  }

  public syncFromLayer(): void {
    const frames = this.weatherLayer.getFrames();
    const currIdx = this.weatherLayer.getCurrentFrameIndex();
    if (this.slider && frames.length > 0) {
      this.slider.max = `${frames.length - 1}`;
      this.slider.value = `${currIdx >= 0 ? currIdx : frames.length - 1}`;
    }
    if (frames.length > 0 && currIdx >= 0 && currIdx < frames.length) {
      this.updateTimestamp(frames[currIdx]);
    }
  }

  private bindDomElements(): void {
    this.playBtn = document.getElementById("weather-play-btn") as HTMLButtonElement;
    this.prevBtn = document.getElementById("weather-prev-btn") as HTMLButtonElement;
    this.nextBtn = document.getElementById("weather-next-btn") as HTMLButtonElement;
    this.slider = document.getElementById("weather-frame-slider") as HTMLInputElement;
    this.timeLabel = document.getElementById("weather-time-label");
    this.opacitySlider = document.getElementById("weather-opacity-slider") as HTMLInputElement;
    this.opacityPct = document.getElementById("weather-opacity-pct");
  }

  private bindEvents(): void {
    this.playBtn?.addEventListener("click", () => {
      const isPlaying = this.weatherLayer.togglePlay();
      if (this.playBtn) this.playBtn.textContent = isPlaying ? "⏸" : "▶";
    });

    this.prevBtn?.addEventListener("click", () => this.stepFrame(-1));
    this.nextBtn?.addEventListener("click", () => this.stepFrame(1));

    this.slider?.addEventListener("input", (e) => {
      const idx = parseInt((e.target as HTMLInputElement).value, 10);
      this.weatherLayer.setFrameIndex(idx);
    });

    this.opacitySlider?.addEventListener("input", (e) => {
      const op = parseFloat((e.target as HTMLInputElement).value);
      this.weatherLayer.setOpacity(op);
      if (this.opacityPct) this.opacityPct.textContent = `${Math.round(op * 100)}%`;
    });

    document.getElementById("weather-close-btn")?.addEventListener("click", () => this.setVisible(false));

    this.weatherLayer.onFrameChanged((frame, index, total) => {
      if (this.slider) {
        this.slider.max = `${Math.max(0, total - 1)}`;
        this.slider.value = `${index}`;
      }
      this.updateTimestamp(frame);
    });
  }

  private stepFrame(delta: number): void {
    const frames = this.weatherLayer.getFrames();
    if (frames.length === 0) return;
    const current = this.weatherLayer.getCurrentFrameIndex();
    const next = (current + delta + frames.length) % frames.length;
    this.weatherLayer.setFrameIndex(next);
  }

  private updateTimestamp(frame: RadarFrame): void {
    if (this.timeLabel) {
      const d = new Date(frame.time * 1000);
      const hours = d.getUTCHours().toString().padStart(2, "0");
      const mins = d.getUTCMinutes().toString().padStart(2, "0");
      this.timeLabel.textContent = `${hours}:${mins} UTC`;
    }
  }
}
