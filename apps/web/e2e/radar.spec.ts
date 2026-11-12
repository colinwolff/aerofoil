import { expect, test } from "@playwright/test";

test.describe("Airspace Radar E2E Suite", () => {
  test("mounts 2D Leaflet radar without JS or WebGL console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(`PageError: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(`ConsoleError: ${msg.text()}`);
      }
    });

    await page.goto("/");
    await expect(page).toHaveTitle(/aerofoil/i);

    // Header and clock
    await expect(page.locator("#header")).toBeVisible();
    await expect(page.locator("#utc-clock")).toContainText("UTC");

    // Leaflet 2D container mounted
    const leafletMap = page.locator("#map");
    await expect(leafletMap).toBeVisible();
    await expect(leafletMap).toHaveClass(/leaflet-container/);

    // 2D mode button is active
    await expect(page.locator("#btn-engine-2d")).toHaveClass(/active/);

    const fatalErrors = errors.filter(
      (e) => !e.includes("Failed to load resource") && !e.includes("net::ERR_"),
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test("toggles 2D and 3D mode, mounting MapLibre GL 3D canvas", async ({ page }) => {
    await page.goto("/");

    const btn3d = page.locator("#btn-engine-3d");
    const btn2d = page.locator("#btn-engine-2d");
    const map3d = page.locator("#map-3d");

    // Initially in 2D
    await expect(map3d).toHaveClass(/hidden/);
    await expect(btn2d).toHaveClass(/active/);

    // Toggle to 3D
    await btn3d.click();
    await expect(btn3d).toHaveClass(/active/);
    await expect(map3d).not.toHaveClass(/hidden/);

    // Verify MapLibre GL canvas is mounted
    const canvas = map3d.locator("canvas.maplibregl-canvas");
    await expect(canvas).toBeAttached();

    // Toggle back to 2D
    await btn2d.click();
    await expect(btn2d).toHaveClass(/active/);
    await expect(map3d).toHaveClass(/hidden/);
    await expect(page.locator("#map")).toBeVisible();
  });

  test("opens and controls Layer Drawer and settings modal", async ({ page }) => {
    await page.goto("/");

    // Toggle Layer Drawer
    const btnLayers = page.locator("#btn-toggle-layers");
    await btnLayers.click();

    const layerDrawer = page.locator("#layer-drawer-container");
    await expect(layerDrawer).toBeVisible();

    // Verify basemap options exist inside drawer
    await expect(layerDrawer.locator("text=Airspace & Chart Layers")).toBeVisible();
    await expect(layerDrawer.locator("#hud-basemap-select")).toContainText("CARTO Dark Matter");
    await expect(layerDrawer.locator("text=3D Topography & Relief")).toBeVisible();

    // Close drawer
    await btnLayers.click();

    // Open settings modal
    const btnSettings = page.locator("#btn-open-settings");
    await btnSettings.click();

    const modal = page.locator("#config-modal-container");
    await expect(modal.locator("text=Station & Map Configuration")).toBeVisible();

    // Close modal
    await modal.locator("#config-modal-close").click();
    await expect(modal.locator("#config-modal-backdrop")).toHaveClass(/hidden/);
  });

  test("inspects aircraft marker click and populates telemetry table", async ({ page }) => {
    await page.goto("/");

    // Inject target telemetry
    await page.evaluate(() => {
      const w = window as any;
      if (w.radarManager) {
        w.radarManager.updateTarget({
          address: "4840D6",
          callsign: "KLM1023",
          altitude: 32000,
          ground_speed: 450,
          heading: 240,
          squawk: "4201",
          lat: 52.3,
          lon: 4.76,
          source: "ModeS1090",
          reception: "Direct",
        });
      }
    });

    // Verify target count metric updates
    await expect(page.locator("#target-count")).toContainText("Targets: 1");

    // Verify telemetry table row
    const row = page.locator("#telemetry-body tr").first();
    await expect(row).toContainText("4840D6");
    await expect(row).toContainText("KLM1023");

    // Click table row to open Aircraft Inspector HUD card
    await row.click();
    const inspector = page.locator("#aircraft-inspector-container");
    await expect(inspector).toBeVisible();
    await expect(inspector.locator("text=KLM Royal Dutch Airlines")).toBeVisible();
    await expect(inspector.locator("text=4840D6")).toBeVisible();
    await expect(inspector.locator("text=450 kt")).toBeVisible();

    // Click marker on map and verify popup contents
    const marker = page.locator(".leaflet-marker-icon").first();
    await expect(marker).toBeVisible();
    await marker.click();

    const popup = page.locator(".leaflet-popup-content");
    await expect(popup).toBeVisible();
    await expect(popup).toContainText("KLM1023");
    await expect(popup).toContainText("Alt: 32000 ft");
    await expect(popup).toContainText("Spd: 450 kt");
    await expect(popup).toContainText("Squawk: 4201");
  });
});
