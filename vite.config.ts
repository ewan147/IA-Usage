import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;
const root = import.meta.dirname;

export default defineConfig(() => ({
  plugins: [react()],
  // Relative asset URLs for the dashboard (Tauri custom protocol).
  base: "./",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // Dashboard only — widget is a static public/widget.html (no Vite/React).
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
      },
    },
  },
}));
