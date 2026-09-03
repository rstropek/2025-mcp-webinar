/**
 * Helpers that build the `_meta.ui` objects an MCP App host reads.
 *
 * The Apps extension is layered entirely on top of ordinary MCP `_meta`
 * fields — there is no special "app tool" or "app resource" type. The
 * `@modelcontextprotocol/ext-apps/server` helpers (`registerAppTool`,
 * `registerAppResource`) only work with SDK v1; this server uses SDK v2, so
 * we build these objects by hand (the TS equivalent of the .NET sample's
 * `UiMeta.cs`). Keeping that construction in one tiny file
 * makes the extension's presence in the code obvious rather than burying a
 * magic string literal in every step.
 */

/** The MCP Apps profile MIME type that marks a resource as an embeddable UI. */
export const APP_MIME = "text/html;profile=mcp-app";

/**
 * Tool-level `_meta.ui.resourceUri` — the single line that turns a plain
 * tool into an MCP App tool. When the host calls a tool carrying this
 * `_meta`, it fetches the named `ui://` resource via `resources/read` and
 * renders the returned HTML in a sandboxed iframe next to the tool result.
 */
export function uiResource(resourceUri: string): Record<string, unknown> {
  return { ui: { resourceUri } };
}

/**
 * Tool-level `_meta.ui.visibility = ["app"]` — hides the tool from the
 * model's tool list while leaving it callable from the View via
 * `app.callServerTool(...)`. Use this for "chatty" follow-up tools (fetch
 * another quote, poll live stats, …) that the View calls on its own so the
 * model never sees the traffic and no conversation turn is consumed.
 */
export function appOnly(): Record<string, unknown> {
  return { ui: { visibility: ["app"] } };
}

/**
 * Content-level `_meta.ui` attached to a single `resources/read` content
 * item (as opposed to the listing-level `_meta` passed to
 * `registerResource`). Content-level `_meta` wins over listing-level `_meta`
 * when both are present, so this is the place to put anything that must
 * definitely reach the host for a given read — step 6 uses it for CSP.
 *
 * Note the shape: `csp` and `prefersBorder` are BOTH direct children of
 * `ui` — there is no `preferences` wrapper. A host silently ignores keys it
 * does not recognize, so nesting `prefersBorder` under a made-up wrapper
 * object would not error, it would just be dropped.
 *
 *   - `csp.resourceDomains`: origins the View may load `<img>`/`<script>`/
 *     font/media from (the `img-src`/`script-src`/… CSP buckets). Use
 *     `csp.connectDomains` for `fetch`/XHR/WebSocket targets instead. The
 *     host's default CSP is effectively `default-src 'none'`, so without an
 *     explicit allow-list any request to an external domain is blocked.
 *   - `prefersBorder`: a cosmetic hint asking the host to draw a border
 *     around the iframe.
 *   - `permissions`: optional iframe permissions, an object keyed by feature
 *     (`{ camera: {}, clipboardWrite: {} }`), not used by any step here.
 *   - `domain`: optional origin override for the sandboxed iframe, also not
 *     used here.
 */
export function contentUiMeta(options: {
  csp?: { resourceDomains?: string[]; connectDomains?: string[] };
  prefersBorder?: boolean;
  permissions?: Record<string, Record<string, never>>;
  domain?: string;
}): Record<string, unknown> {
  return { ui: options };
}
