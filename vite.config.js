import { defineConfig } from "vite";

// GitHub Pages serves a project site from https://<user>.github.io/<repo>/, so
// production assets must be requested under that sub-path. Local dev/preview
// stay at the root. Override with VITE_BASE for a custom domain or user site
// (e.g. VITE_BASE=/ for <user>.github.io).
export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE ?? (command === "build" ? "/SchematicViewer/" : "/"),
}));
