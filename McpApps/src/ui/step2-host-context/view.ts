/**
 * Step 2 View — adapting to the host.
 *
 * MCP-Apps concepts on display:
 *  • `app.getHostContext()` exposes the *current* context the host pushed —
 *    first during the `ui/initialize` handshake, then merged with every
 *    `onhostcontextchanged` delta. It returns `undefined` until `connect()`
 *    resolves.
 *  • `app.onhostcontextchanged` fires whenever any of those change — most
 *    notably theme toggles, resize, or a display-mode change. The View must
 *    re-render itself: there is no automatic CSS re-injection.
 *  • `applyDocumentTheme` / `applyHostStyleVariables` / `applyHostFonts`
 *    (wrapped here in `../shared/host-theme.ts`) copy host-provided theme
 *    and CSS variables onto `<html>` so this View's own CSS — the
 *    `light-dark()` fallbacks and `var(--color-*)` references in
 *    `style.css` — picks them up natively, without bespoke theming code.
 *  • This tool has no interesting `structuredContent` — the resource exists
 *    purely to mount the View next to a text acknowledgement.
 */
import { App, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { requireElement } from "../shared/dom.js";
import { applyHostContext } from "../shared/host-theme.js";
import "./style.css";

const mainEl = requireElement("main");
const themeEl = requireElement("theme");
const displayModeEl = requireElement("display-mode");
const localeEl = requireElement("locale");
const tzEl = requireElement("tz");
const platformEl = requireElement("platform");
const dimsEl = requireElement("dims");
const safeEl = requireElement("safe");

function render(ctx: McpUiHostContext | undefined) {
  if (!ctx) return;

  applyHostContext(ctx, mainEl);

  themeEl.textContent = ctx.theme ?? "—";
  displayModeEl.textContent = ctx.displayMode ?? "—";
  localeEl.textContent = ctx.locale ?? "—";
  tzEl.textContent = ctx.timeZone ?? "—";
  platformEl.textContent = ctx.platform ?? "—";

  const dims = ctx.containerDimensions as
    | { width?: number; height?: number; maxWidth?: number; maxHeight?: number }
    | undefined;
  dimsEl.textContent = dims ? `${dims.width ?? dims.maxWidth ?? "?"}×${dims.height ?? dims.maxHeight ?? "?"}` : "—";

  const insets = ctx.safeAreaInsets;
  safeEl.textContent = insets ? `t${insets.top} r${insets.right} b${insets.bottom} l${insets.left}` : "—";
}

const app = new App({ name: "Step 2 — Host Context", version: "1.0.0" });

// Fires whenever the host's environment changes — theme toggle, resize,
// display-mode change. Each notification carries a *delta*; getHostContext()
// returns the merged, up-to-date snapshot, so we always re-read from there.
app.onhostcontextchanged = () => render(app.getHostContext());

app.connect().then(
  () => render(app.getHostContext()),
  (err: unknown) => console.error("[step2] connect failed", err),
);
