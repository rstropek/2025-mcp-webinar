#!/usr/bin/env tsx
/**
 * Builds each step's HTML view as one self-contained file via Vite's JS API.
 *
 * Why one file per view: every `ui://` view is delivered to the host inside
 * a `resources/read` result and rendered in a sandboxed iframe whose CSP
 * starts at `default-src 'none'`. There is no server to fetch a separate
 * `.js`/`.css` chunk from — everything the iframe needs (markup, styles,
 * script) has to be inlined into the single HTML document the resource
 * handler ships verbatim. `vite-plugin-singlefile` does exactly that.
 *
 * Why a loop of single-entry builds instead of one multi-entry build:
 * `vite-plugin-singlefile` inlines each entry's own JS/CSS chunk into that
 * entry's HTML, but with several inputs in one Rollup build the entries can
 * end up sharing a common chunk that is emitted as a separate file and
 * *imported* rather than inlined — defeating the CSP-friendly single-file
 * property for that shared code (verified against this project: a
 * multi-input build leaves an external `<script type="module" src=...>` in
 * some of the outputs). Building each view in its own isolated Vite run
 * sidesteps chunk-sharing entirely, at the cost of running Vite seven times
 * instead of once.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { build } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const STEPS = [
  "step1-hello",
  "step2-host-context",
  "step3-call-tool",
  "step4-talk-to-model",
  "step5-live-polling",
  "step6-fullscreen-csp",
  "step7-tool-input",
];

const isDev = process.env.NODE_ENV === "development";
const watch = process.argv.includes("--watch");

const uiRoot = path.resolve(import.meta.dirname, "../src/ui");
const outDir = path.resolve(import.meta.dirname, "../dist/ui");

/**
 * Runs one Vite build for a single step. With `root: uiRoot` and an input of
 * `src/ui/<step>/index.html`, Vite mirrors that input's path relative to the
 * root into the output directory, so this lands at `dist/ui/<step>/index.html`
 * — exactly where `src/server/lib/view-store.ts` expects to find it.
 */
function buildStep(step: string) {
  return build({
    configFile: false,
    root: uiRoot,
    plugins: [viteSingleFile()],
    logLevel: "warn",
    build: {
      outDir,
      emptyOutDir: false,
      sourcemap: isDev ? "inline" : false,
      minify: !isDev,
      cssMinify: !isDev,
      rollupOptions: {
        input: path.resolve(uiRoot, step, "index.html"),
      },
      watch: watch ? {} : null,
    },
  });
}

if (watch) {
  // Each step gets its own Vite watcher so they can rebuild independently;
  // `build()` resolves as soon as the watcher is set up, and the watcher's
  // open file handles are what keep this process alive — no explicit "wait
  // forever" needed.
  for (const step of STEPS) {
    console.log(`[build-ui] watching ${step}`);
    try {
      const result = await buildStep(step);
      if ("on" in result) {
        result.on("event", (event) => {
          if (event.code === "BUNDLE_END") {
            console.log(`[build-ui] ${step} rebuilt (${event.duration}ms)`);
          } else if (event.code === "ERROR") {
            console.error(`[build-ui] ${step} build error:`, event.error.message);
          }
        });
      }
    } catch (err) {
      // A config-time failure (e.g. missing index.html) — don't kill the
      // other watchers, just make the failure impossible to miss.
      console.error(`[build-ui] ${step} failed to start watching:`, err);
    }
  }
} else {
  // emptyOutDir:false lets the seven sequential per-step builds coexist
  // without wiping each other's output — but that also means dist/ui is
  // never auto-cleaned, so a removed/renamed step would leave a stale
  // directory behind that the server would happily keep serving. Clear it
  // once, up front, for a full (non-watch) build.
  await rm(outDir, { recursive: true, force: true });

  let failed = false;
  for (const step of STEPS) {
    try {
      await buildStep(step);
      console.log(`[build-ui] built ${step}`);
    } catch (err) {
      failed = true;
      console.error(`[build-ui] ${step} failed:`, err);
    }
  }

  if (failed) {
    process.exit(1);
  }
}
