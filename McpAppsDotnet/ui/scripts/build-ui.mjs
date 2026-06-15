#!/usr/bin/env node
/**
 * Builds each step's HTML view as a single self-contained file via Vite.
 * Each call to `vite build` consumes one INPUT html and writes one inlined
 * dist/stepN.html — which is what the .NET MCP App resource handler ships
 * verbatim to the host.
 */
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

const STEPS = [
  "step1.html",
  "step2.html",
  "step3.html",
  "step4.html",
  "step5.html",
  "step6.html",
];

const watch = process.argv.includes("--watch");

// vite.config uses emptyOutDir:false so the six sequential per-entry builds don't
// wipe each other's output. The price is that dist/ is never auto-cleaned, so a
// removed/renamed step would leave a stale stepN.html behind (which the server
// would then happily serve). Clean it once up front for a full (non-watch) build.
const distDir = new URL("../dist", import.meta.url);

function runVite(input) {
  return new Promise((resolve, reject) => {
    const args = ["vite", "build", ...(watch ? ["--watch"] : [])];
    const child = spawn("npx", args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, INPUT: input },
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`vite exit ${code} for ${input}`)),
    );
  });
}

if (watch) {
  // In watch mode, run all builds in parallel so each entry watches its own files.
  for (const step of STEPS) runVite(step).catch((e) => console.error(e));
} else {
  await rm(distDir, { recursive: true, force: true });
  for (const step of STEPS) {
    console.log(`\n[build-ui] ${step}`);
    await runVite(step);
  }
}
