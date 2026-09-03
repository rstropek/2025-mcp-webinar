import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { APP_MIME, contentUiMeta, uiResource } from "../lib/ui-meta.js";
import type { ViewStore } from "../lib/view-store.js";

/**
 * Step 6 — Display modes + external resources via CSP.
 *
 * Two new pieces of `_meta.ui` show up here, attached at the *content* level
 * of the `resources/read` result (see `contentUiMeta` in `lib/ui-meta.ts`):
 *   - `csp.resourceDomains` — origins the View may load
 *     `<img>`/`<script>`/font/media from (the `img-src`/`script-src`/… CSP
 *     buckets). Use `csp.connectDomains` for `fetch`/XHR/WebSocket targets.
 *     The host's default CSP is effectively `default-src 'none'`, so
 *     without this allow-list the `flagcdn.com` image is blocked.
 *   - `prefersBorder` — a cosmetic hint; a *direct* field of `_meta.ui`
 *     (sibling of `csp`/`permissions`), not nested under any wrapper.
 *
 * The View asks for fullscreen via `app.requestDisplayMode` — see
 * `src/ui/step6-fullscreen-csp/view.ts`.
 */
const RESOURCE_URI = "ui://step6-fullscreen-csp/app.html";

// The .NET original accepted any string and silently produced a 404 image
// for an unknown code. Modeling the code as an enum instead lets the host
// (and the model) validate the argument before the tool is even called, so
// "unknown country code" becomes a schema-level rejection instead of a
// broken image inside the iframe.
const COUNTRY_CODES = ["at", "de", "fr", "jp", "us", "br"] as const;

const COUNTRIES: Record<(typeof COUNTRY_CODES)[number], string> = {
  at: "Austria",
  de: "Germany",
  fr: "France",
  jp: "Japan",
  us: "United States",
  br: "Brazil",
};

export function register(server: McpServer, views: ViewStore): void {
  server.registerTool(
    "step6-flag",
    {
      title: "Step 6 — Country Flag",
      description:
        "Shows a country flag image from an external CDN inside a sandboxed iframe. " + "The View can toggle fullscreen.",
      inputSchema: z.object({
        code: z.enum(COUNTRY_CODES).default("at").describe("ISO 3166-1 alpha-2 code, e.g. 'at'"),
      }),
      outputSchema: z.object({
        country: z.string(),
        code: z.string(),
      }),
      _meta: uiResource(RESOURCE_URI),
    },
    async ({ code }) => {
      const country = COUNTRIES[code];
      return {
        content: [{ type: "text", text: `Showing flag of ${country} (${code}).` }],
        structuredContent: { country, code },
      };
    },
  );

  server.registerResource(
    "step6-fullscreen-csp-ui",
    RESOURCE_URI,
    {
      title: "Step 6 — Fullscreen + CSP view",
      description: "Step 6 — Fullscreen + CSP view",
      mimeType: APP_MIME,
    },
    async (uri) =>
      views.read(
        uri.href,
        "step6-fullscreen-csp",
        // Content-level _meta on the resource read result (takes precedence
        // over any listing-level _meta). Without the resourceDomains entry
        // the View's <img> is blocked by the host's default-deny CSP.
        contentUiMeta({
          csp: { resourceDomains: ["https://flagcdn.com"] },
          prefersBorder: true,
        }),
      ),
  );
}
