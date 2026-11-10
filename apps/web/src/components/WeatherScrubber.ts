//! WeatherScrubber — Floating timeline playback scrubber control for live NEXRAD weather radar.

import type { WeatherRadarLayer, RadarFrame } from "../layers/WeatherRadarLayer";

export class WeatherScrubber {
  private containerEl: HTMLElement | null = null;
  private playBtn: HTMLButtonElement | null = null;
  private slider: HTMLInputElement | null = null;
  private timeLabel: HTMLElement | null = null;
  private opacitySlider: HTMLInputElement | null = null;

  constructor(private weatherLayer: WeatherRadarLayer) {}

  public init(containerId: string = "weather-scrubber-dock"): void {
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement("div");
      container.id = containerId;
      container.className = "weather-scrubber-dock hidden";
      document.body.appendChild(container);
    }
    this.containerEl = container;

    container.innerHTML = `
      <div class="scrubber-card">
        <button id="weather-play-btn" class="scrubber-btn" title="Play / Pause Radar Loop">▶</button>
        <div class="scrubber-timeline">
          <input type="range" id="weather-frame-slider" min="0" max="0" value="0" step="1" />
          <span id="weather-time-label" class="scrubber-timestamp">Live</span>
        </div>
        <div class="scrubber-opacity-group">
          <span class="scrubber-caption">Opacity:</span>
          <input type="range" id="weather-opacity-slider" min="0.1" max="1.0" step="0.05" value="0.65" />
        </div>
      </div>
    `;

    this.playBtn = document.getElementById("weather-play-btn") as HTMLButtonElement;
    this.slider = document.getElementById("weather-frame-slider") as HTMLInputElement;
    this.timeLabel = document.getElementById("weather-time-label");
    this.opacitySlider = document.getElementById("weather-opacity-slider") as HTMLInputElement;

    this.playBtn?.addEventListener("click", () => {
      const isPlaying = this.weatherLayer.togglePlay();
      if (this.playBtn) {
        this.playBtn.textContent = isPlaying ? "⏸" : "▶";
      }
    });

    this.slider?.addEventListener("input", (e) => {
      const idx = parseInt((e.target as HTMLInputElement).value, 10);
      this.weatherLayer.setFrameIndex(idx);
    });

    this.opacitySlider?.addEventListener("input", (e) => {
      const op = parseFloat((e.target as HTMLInputElement).value);
      this.weatherLayer.setOpacity(op);
    });

    this.weatherLayer.onFrameChanged((frame, index, total) => {
      if (this.slider) {
        this.slider.max = `${Math.max(0, total - 1)}`;
        this.slider.value = `${index}`;
      }
      if (this.timeLabel) {
        const d = new Date(frame.time * 1000);
        this.timeLabel.textContent = `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")} UTC`;
      }
    });
  }

  public setVisible(visible: boolean): void {
    if (this.containerEl) {
      if (visible) {
        this.containerEl.classList.remove("hidden");
        const frames = this.weatherLayer.getFrames();
        if (this.slider && frames.length > 0) {
          this.slider.max = `${frames.length - 1}`;
          this.slider.value = `${this.weatherLayer.getCurrentFrameIndex()}`;
        }
      } else {
        this.containerEl.classList.add("hidden");
        this.weatherLayer.pause();
        if (this.playBtn) this.playBtn.textContent = "▶";
      }
    }
  }
}
