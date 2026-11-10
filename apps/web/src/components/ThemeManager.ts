//! ThemeManager — Manages Light and Dark theme switching and persistence.

export type AppTheme = "dark" | "light";

export class ThemeManager {
  private currentTheme: AppTheme = "dark";

  constructor(private buttonId: string = "btn-toggle-theme") {}

  public init(): void {
    const saved = localStorage.getItem("aerofoil_theme") as AppTheme | null;
    if (saved === "light" || saved === "dark") {
      this.setTheme(saved);
    } else if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      this.setTheme("light");
    } else {
      this.setTheme("dark");
    }

    document.getElementById(this.buttonId)?.addEventListener("click", () => this.toggleTheme());
  }

  public getTheme(): AppTheme {
    return this.currentTheme;
  }

  public toggleTheme(): AppTheme {
    const next = this.currentTheme === "dark" ? "light" : "dark";
    this.setTheme(next);
    return next;
  }

  public setTheme(theme: AppTheme): void {
    this.currentTheme = theme;
    if (typeof document !== "undefined") {
      document.body.classList.remove("dark-theme", "light-theme");
      document.body.classList.add(`${theme}-theme`);

      const btn = document.getElementById(this.buttonId);
      if (btn) {
        btn.innerHTML = theme === "dark" ? "<span>☼</span>" : "<span>☾</span>";
        btn.title = theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme";
      }

      const mapEl = document.getElementById("map");
      if (mapEl) {
        if (theme === "light") {
          mapEl.classList.remove("dark-tiles");
        } else {
          const isDarkRecommended = mapEl.dataset.darkFilter === "true";
          if (isDarkRecommended) mapEl.classList.add("dark-tiles");
        }
      }
    }

    try {
      localStorage.setItem("aerofoil_theme", theme);
    } catch {}
  }
}
