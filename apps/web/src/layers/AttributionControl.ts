//! Dynamic legal attribution control.
//! Dynamically updates based on active basemaps, chart tile services, and vector overlays.

export interface AttributionItem {
  id: string;
  name: string;
  html: string;
  license: string;
}

export class AttributionControl {
  private activeAttributions: Map<string, AttributionItem> = new Map();
  private container: HTMLElement | null = null;
  private onOpenModalCallback: (() => void) | null = null;

  constructor(containerElementId: string = "attribution-container") {
    this.container = document.getElementById(containerElementId);
  }

  public setOpenModalHandler(callback: () => void): void {
    this.onOpenModalCallback = callback;
  }

  public register(item: AttributionItem): void {
    this.activeAttributions.set(item.id, item);
    this.render();
  }

  public unregister(id: string): void {
    this.activeAttributions.delete(id);
    this.render();
  }

  public render(): void {
    if (!this.container) return;

    const parts: string[] = [];
    for (const item of this.activeAttributions.values()) {
      parts.push(item.html);
    }

    const modalLink = `<a href="#" id="open-legal-notices-btn" class="legal-notices-link" title="View provider licenses and usage restrictions">Legal Notices</a>`;
    const fullHtml = `${parts.join(" | ")} | ${modalLink}`;

    this.container.innerHTML = fullHtml;

    const btn = document.getElementById("open-legal-notices-btn");
    if (btn && this.onOpenModalCallback) {
      btn.onclick = (e) => {
        e.preventDefault();
        this.onOpenModalCallback?.();
      };
    }
  }
}
