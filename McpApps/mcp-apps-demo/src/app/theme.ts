/**
 * Theme glue between the MCP host and our CSS variables.
 *
 * Hosts (Claude, ChatGPT, Goose, VS Code, ...) expose theming via:
 *   - hostContext.theme           : "light" | "dark"
 *   - hostContext.styles.variables: standardised --color-*, --font-*, ...
 *   - hostContext.styles.css.fonts: @font-face / @import blocks for fonts
 *
 * The MCP Apps SDK ships ready-made helpers for all three. We only thread
 * partial updates through `applyHostStyleVariables` so a host that only sends
 * a subset of variables still works. The CSS in styles.css supplies safe
 * fallbacks for everything we actually use.
 */
import {
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type App,
} from "@modelcontextprotocol/ext-apps";

export function applyHostTheme(app: App): void {
  const ctx = app.getHostContext();
  if (!ctx) return;

  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
  }
  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
  if (ctx.styles?.css?.fonts) {
    applyHostFonts(ctx.styles.css.fonts);
  }
}

/**
 * Toggle between inline and fullscreen, but only when the host actually
 * supports the requested mode. Falls back gracefully if not.
 */
export async function toggleDisplayMode(app: App): Promise<void> {
  const ctx = app.getHostContext();
  const current = ctx?.displayMode ?? "inline";
  const desired = current === "inline" ? "fullscreen" : "inline";

  // Check the host's available modes; spec says we MUST verify before asking.
  if (!ctx?.availableDisplayModes?.includes(desired)) {
    document.body.classList.toggle("fullscreen", desired === "fullscreen");
    return;
  }
  const result = await app.requestDisplayMode({ mode: desired });
  document.body.classList.toggle("fullscreen", result.mode === "fullscreen");
}
