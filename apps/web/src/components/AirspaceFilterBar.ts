//! AirspaceFilterBar — Manages search bar, regex input, altitude/speed bounds, and source toggles.

import {
  DEFAULT_FILTER_CRITERIA,
  isFilterActive,
  type AirspaceFilterCriteria,
} from "./AirspaceFilters";

export class AirspaceFilterBar {
  private criteria: AirspaceFilterCriteria = {
    ...DEFAULT_FILTER_CRITERIA,
    sources: { ...DEFAULT_FILTER_CRITERIA.sources },
  };
  private onChangeCallbacks: ((criteria: AirspaceFilterCriteria) => void)[] = [];

  constructor() {
    this.bindEvents();
  }

  public getCriteria(): AirspaceFilterCriteria {
    return { ...this.criteria, sources: { ...this.criteria.sources } };
  }

  public onFilterChange(callback: (criteria: AirspaceFilterCriteria) => void): void {
    this.onChangeCallbacks.push(callback);
  }

  public setQuery(query: string): void {
    this.criteria.query = query;
    const input = document.getElementById("filter-search-input") as HTMLInputElement | null;
    if (input) input.value = query;
    this.updateClearBtn();
    this.notify();
  }

  public resetFilters(): void {
    this.criteria = {
      ...DEFAULT_FILTER_CRITERIA,
      sources: { ...DEFAULT_FILTER_CRITERIA.sources },
    };
    this.syncFormValues();
    this.notify();
  }

  private notify(): void {
    const c = this.getCriteria();
    for (const cb of this.onChangeCallbacks) {
      cb(c);
    }
  }

  private syncFormValues(): void {
    if (typeof document === "undefined") return;
    const searchInput = document.getElementById("filter-search-input") as HTMLInputElement | null;
    if (searchInput) searchInput.value = this.criteria.query;
    this.updateClearBtn();

    const altMin = document.getElementById("filter-alt-min") as HTMLInputElement | null;
    const altMax = document.getElementById("filter-alt-max") as HTMLInputElement | null;
    if (altMin) altMin.value = String(this.criteria.minAltitudeFt / 100);
    if (altMax) altMax.value = String(this.criteria.maxAltitudeFt / 100);
    this.updateAltLabel();

    const spdMin = document.getElementById("filter-spd-min") as HTMLInputElement | null;
    const spdMax = document.getElementById("filter-spd-max") as HTMLInputElement | null;
    if (spdMin) spdMin.value = String(this.criteria.minSpeedKt);
    if (spdMax) spdMax.value = String(this.criteria.maxSpeedKt);
    this.updateSpdLabel();

    const srcAdsb = document.getElementById("filter-src-adsb") as HTMLInputElement | null;
    const srcUat = document.getElementById("filter-src-uat") as HTMLInputElement | null;
    const srcMlat = document.getElementById("filter-src-mlat") as HTMLInputElement | null;
    if (srcAdsb) srcAdsb.checked = this.criteria.sources.adsb;
    if (srcUat) srcUat.checked = this.criteria.sources.uat;
    if (srcMlat) srcMlat.checked = this.criteria.sources.mlat;

    const btnToggle = document.getElementById("btn-toggle-filters");
    btnToggle?.classList.toggle("active", isFilterActive(this.criteria));
  }

  private updateClearBtn(): void {
    const clearBtn = document.getElementById("btn-clear-search");
    if (clearBtn) {
      clearBtn.classList.toggle("hidden", !this.criteria.query);
    }
  }

  private updateAltLabel(): void {
    const lbl = document.getElementById("filter-alt-label");
    if (lbl) {
      const minFL = Math.round(this.criteria.minAltitudeFt / 100);
      const maxFL = Math.round(this.criteria.maxAltitudeFt / 100);
      lbl.textContent = `FL${minFL} – FL${maxFL}`;
    }
  }

  private updateSpdLabel(): void {
    const lbl = document.getElementById("filter-spd-label");
    if (lbl) {
      lbl.textContent = `${this.criteria.minSpeedKt} – ${this.criteria.maxSpeedKt} kt`;
    }
  }

  private bindEvents(): void {
    if (typeof document === "undefined") return;

    const searchInput = document.getElementById("filter-search-input") as HTMLInputElement | null;
    searchInput?.addEventListener("input", () => {
      this.criteria.query = searchInput.value;
      this.updateClearBtn();
      this.notify();
    });

    const clearBtn = document.getElementById("btn-clear-search");
    clearBtn?.addEventListener("click", () => {
      this.setQuery("");
      searchInput?.focus();
    });

    const drawer = document.getElementById("filter-drawer");
    const toggleBtn = document.getElementById("btn-toggle-filters");
    toggleBtn?.addEventListener("click", () => {
      drawer?.classList.toggle("hidden");
    });

    const altMin = document.getElementById("filter-alt-min") as HTMLInputElement | null;
    const altMax = document.getElementById("filter-alt-max") as HTMLInputElement | null;
    const onAltChange = () => {
      let min = Number(altMin?.value ?? 0) * 100;
      let max = Number(altMax?.value ?? 600) * 100;
      if (min > max) [min, max] = [max, min];
      this.criteria.minAltitudeFt = min;
      this.criteria.maxAltitudeFt = max;
      this.updateAltLabel();
      toggleBtn?.classList.toggle("active", isFilterActive(this.criteria));
      this.notify();
    };
    altMin?.addEventListener("input", onAltChange);
    altMax?.addEventListener("input", onAltChange);

    const spdMin = document.getElementById("filter-spd-min") as HTMLInputElement | null;
    const spdMax = document.getElementById("filter-spd-max") as HTMLInputElement | null;
    const onSpdChange = () => {
      let min = Number(spdMin?.value ?? 0);
      let max = Number(spdMax?.value ?? 1200);
      if (min > max) [min, max] = [max, min];
      this.criteria.minSpeedKt = min;
      this.criteria.maxSpeedKt = max;
      this.updateSpdLabel();
      toggleBtn?.classList.toggle("active", isFilterActive(this.criteria));
      this.notify();
    };
    spdMin?.addEventListener("input", onSpdChange);
    spdMax?.addEventListener("input", onSpdChange);

    const onSrcChange = () => {
      const srcAdsb = document.getElementById("filter-src-adsb") as HTMLInputElement | null;
      const srcUat = document.getElementById("filter-src-uat") as HTMLInputElement | null;
      const srcMlat = document.getElementById("filter-src-mlat") as HTMLInputElement | null;
      this.criteria.sources.adsb = srcAdsb?.checked ?? true;
      this.criteria.sources.uat = srcUat?.checked ?? true;
      this.criteria.sources.mlat = srcMlat?.checked ?? true;
      toggleBtn?.classList.toggle("active", isFilterActive(this.criteria));
      this.notify();
    };
    document.getElementById("filter-src-adsb")?.addEventListener("change", onSrcChange);
    document.getElementById("filter-src-uat")?.addEventListener("change", onSrcChange);
    document.getElementById("filter-src-mlat")?.addEventListener("change", onSrcChange);

    document.getElementById("btn-reset-filters")?.addEventListener("click", () => {
      this.resetFilters();
    });

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", (e) => {
        if (e.key === "/" && document.activeElement !== searchInput) {
          e.preventDefault();
          searchInput?.focus();
          searchInput?.select();
        } else if (e.key === "Escape" && document.activeElement === searchInput) {
          searchInput.blur();
        }
      });
    }
  }
}
