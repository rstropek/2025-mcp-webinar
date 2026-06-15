import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Each `vite build` consumes ONE entry HTML (chosen via the INPUT env var) and
// writes ONE fully-inlined dist/stepN.html. That single file is what the .NET
// MCP App resource handler ships verbatim — no external JS/CSS to fetch, which
// keeps the sandboxed iframe happy under a default-deny CSP.
const INPUT = process.env.INPUT;
if (!INPUT) {
  throw new Error("INPUT environment variable is not set (e.g. INPUT=step1.html)");
}

const isDev = process.env.NODE_ENV === "development";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    sourcemap: isDev ? "inline" : false,
    cssMinify: !isDev,
    minify: !isDev,
    rollupOptions: { input: INPUT },
    outDir: "dist",
    emptyOutDir: false,
  },
});
