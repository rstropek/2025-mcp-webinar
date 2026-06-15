/**
 * Step 2 View — adapting to the host.
 *
 * MCP-Apps concepts on display:
 *  • `app.getHostContext()` exposes the *initial* context the host pushed
 *    during the `ui/initialize` handshake (theme, locale, timezone,
 *    displayMode, containerDimensions, safeAreaInsets, styles.variables).
 *  • `app.onhostcontextchanged` fires every time any of those change — most
 *    notably theme toggles and resize / display-mode changes. The View must
 *    re-render: there is no automatic CSS-variable injection.
 *  • `applyDocumentTheme` / `applyHostStyleVariables` / `applyHostFonts` are
 *    convenience helpers from the SDK that copy host-provided CSS variables
 *    onto `<html>` so the view's CSS picks them up natively.
 */
import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

const mainEl = document.getElementById("main")!;
const themeEl = document.getElementById("theme")!;
const displayModeEl = document.getElementById("display-mode")!;
const localeEl = document.getElementById("locale")!;
const tzEl = document.getElementById("tz")!;
const dimsEl = document.getElementById("dims")!;
const safeEl = document.getElementById("safe")!;

function render(ctx: McpUiHostContext | undefined) {
  if (!ctx) return;

  // The host advertises CSS variables (colors, fonts, spacing). We push them
  // onto :root so the View inherits the host's look-and-feel automatically.
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);

  // safeAreaInsets matter on mobile / notched displays — the View is responsible
  // for honoring them; the host won't pad the iframe.
  const insets = ctx.safeAreaInsets;
  if (insets) {
    mainEl.style.padding = `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`;
  }

  themeEl.textContent = ctx.theme ?? "—";
  displayModeEl.textContent = ctx.displayMode ?? "—";
  localeEl.textContent = ctx.locale ?? "—";
  tzEl.textContent = ctx.timeZone ?? "—";
  const dims = ctx.containerDimensions as
    | { width?: number; height?: number; maxWidth?: number; maxHeight?: number }
    | undefined;
  dimsEl.textContent = dims
    ? `${dims.width ?? dims.maxWidth ?? "?"}×${dims.height ?? dims.maxHeight ?? "?"}`
    : "—";
  safeEl.textContent = insets
    ? `t${insets.top} r${insets.right} b${insets.bottom} l${insets.left}`
    : "—";
}

const app = new App({ name: "Step 2 — Host Context", version: "1.0.0" });

// Fires whenever the host's environment changes — theme toggle, resize,
// display-mode change. Each notification carries a *delta*; we merge with
// the previous context via getHostContext().
app.onhostcontextchanged = () => render(app.getHostContext());

app.connect().then(
  () => render(app.getHostContext()),
  (err: unknown) => console.error("[step2] connect failed", err),
);
