import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReadResourceResult } from "@modelcontextprotocol/server";
import { APP_MIME } from "./ui-meta.js";

/**
 * Loads the Vite-bundled single-file HTML views (see `scripts/build-ui.ts`
 * and `src/ui/**`) and wraps them in the `resources/read` result shape an
 * MCP App host expects.
 *
 * Each view is built to `dist/ui/<step>/index.html` — one fully self
 * contained file (inlined CSS and JS, no external `src=`/`href=`) because
 * the host's CSP for a `ui://` resource starts at `default-src 'none'`.
 *
 * Caching is deliberately conditional. The .NET original (`ViewStore.cs`)
 * caches forever with a `ConcurrentDictionary`, which is fine for a
 * published binary but bit us during live demos of *this* sample: with
 * `npm run watch:ui` rebuilding a view in the background, a cached server
 * would keep serving the stale HTML until restarted, and "why doesn't my
 * change show up" is a bad thing to debug in front of an audience. So here
 * we only cache in production (`NODE_ENV=production`, i.e. the built,
 * deployed case where the files never change again); every other run
 * re-reads the file on every `resources/read`, trading a few milliseconds
 * for views that always reflect the latest build.
 */
export class ViewStore {
  private readonly cache = new Map<string, string>();

  /**
   * Builds the `resources/read` result for a UI resource.
   *
   * @param uri The resource URI as requested (usually the `ui://` URI the
   *   resource was registered under), echoed back into the content item.
   * @param step The step folder name under `dist/ui/`, e.g. `"step1-hello"`.
   * @param contentMeta Optional content-level `_meta` (see `ui-meta.ts`);
   *   step 6 uses this for its CSP allow-list.
   */
  async read(uri: string, step: string, contentMeta?: Record<string, unknown>): Promise<ReadResourceResult> {
    const html = await this.loadHtml(step);
    return {
      contents: [
        {
          uri,
          mimeType: APP_MIME,
          text: html,
          _meta: contentMeta,
        },
      ],
    };
  }

  private async loadHtml(step: string): Promise<string> {
    const cached = this.cache.get(step);
    if (cached !== undefined) {
      return cached;
    }

    // `import.meta.dirname` is this file's directory:
    // `McpApps/src/server/lib`. Three levels up is the repo's `McpApps/`
    // root, from which the build output lives at `dist/ui/<step>/index.html`.
    const filePath = path.resolve(import.meta.dirname, "../../../dist/ui", step, "index.html");

    let html: string;
    try {
      html = await readFile(filePath, "utf-8");
    } catch {
      throw new Error(`View "${step}" not built — run "npm run build:ui" first.`);
    }

    if (process.env.NODE_ENV === "production") {
      this.cache.set(step, html);
    }
    return html;
  }
}
