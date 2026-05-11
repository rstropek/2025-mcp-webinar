/**
 * Vite build config for the MCP App UI.
 *
 * We use vite-plugin-singlefile to inline ALL JS, CSS and assets into a single
 * HTML file. This is the recommended approach for MCP Apps because:
 *   - The default CSP for UI resources blocks external script/style sources
 *     (default-src 'none'; script-src 'self' 'unsafe-inline'; ...).
 *   - The MCP server only has to serve one HTML resource via resources/read.
 *
 * Output: dist/mcp-app.html (a fully self-contained sandboxable view).
 */
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Setting `root` to the UI source folder keeps the emitted HTML flat:
  // `dist/mcp-app.html` instead of `dist/src/app/mcp-app.html`.
  root: path.resolve(__dirname, "src/app"),
  plugins: [viteSingleFile()],
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      // Use the cockpit's HTML page as the explicit entry; without this Vite
      // would look for an `index.html` next to the root.
      input: path.resolve(__dirname, "src/app/mcp-app.html"),
    },
  },
});
