import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  envPrefix: ["VITE_", "CARTO_", "MAPTILER_", "MAPBOX_", "AEROFOIL_"],
  server: {
    port: 5173,
  },
});
