//! In-app "Data Sources & Legal Notices" modal dialog.
//! Itemizes licensing terms, copyright boundaries, and tile-usage policies.

export class LegalModal {
  private modalEl: HTMLElement | null = null;

  public init(): void {
    if (document.getElementById("legal-notices-modal")) return;

    const modal = document.createElement("div");
    modal.id = "legal-notices-modal";
    modal.className = "legal-modal-overlay hidden";
    modal.innerHTML = `
      <div class="legal-modal-card">
        <div class="legal-modal-header">
          <h3>Data Sources & Legal Notices</h3>
          <button id="close-legal-modal-btn" class="modal-close-btn">&times;</button>
        </div>
        <div class="legal-modal-body">
          <section>
            <h4>aerofoil Core Architecture</h4>
            <p>Licensed under the dual <b>Apache License, Version 2.0</b> or <b>MIT License</b>. Zero proprietary or restrictive copyleft dependencies are bundled into the core engine.</p>
          </section>

          <section>
            <h4>FAA Airspace & Aeronautical Charts (US Public Domain)</h4>
            <p>Aeronautical boundaries, Class B/C/D airspace sectors, and VFR Sectional / IFR Enroute chart services are authored by the <b>Federal Aviation Administration (FAA)</b> and provided under <b>17 U.S.C. § 105</b> (US Public Domain). These federal government works carry zero copyright restrictions.</p>
          </section>

          <section>
            <h4>OpenStreetMap (OSM)</h4>
            <p>Basemap data is &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>, made available under the <b>Open Database License (ODbL 1.0)</b>. In accordance with the OSMF Tile Usage Policy, production deployments should route through local tile caching or dedicated commercial providers.</p>
          </section>

          <section>
            <h4>Precipitation & NEXRAD Radar (RainViewer)</h4>
            <p>Live weather radar mosaics and infrared satellite frames are provided courtesy of <a href="https://www.rainviewer.com/" target="_blank">RainViewer</a> public weather radar API.</p>
          </section>

          <section>
            <h4>OpenAIP CC BY-NC-SA 4.0 Guardrail Notice</h4>
            <p class="warning-text">openAIP navigation data contains Non-Commercial and Share-Alike restrictions (CC BY-NC-SA 4.0). To preserve aerofoil's commercially permissive MIT/Apache-2.0 status, <b>openAIP data is NOT bundled in aerofoil</b>. Any user-configured openAIP tile endpoint is strictly subject to openAIP terms.</p>
          </section>
        </div>
        <div class="legal-modal-footer">
          <button id="confirm-legal-modal-btn" class="btn-primary">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;

    const closeBtn = document.getElementById("close-legal-modal-btn");
    const confirmBtn = document.getElementById("confirm-legal-modal-btn");

    closeBtn?.addEventListener("click", () => this.hide());
    confirmBtn?.addEventListener("click", () => this.hide());
    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.hide();
    });
  }

  public show(): void {
    if (this.modalEl) {
      this.modalEl.classList.remove("hidden");
    }
  }

  public hide(): void {
    if (this.modalEl) {
      this.modalEl.classList.add("hidden");
    }
  }
}
