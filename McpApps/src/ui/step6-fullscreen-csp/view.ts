/**
 * Step 6 View — display modes + external resources behind CSP.
 *
 * MCP-Apps concepts on display:
 *  • The View runs under a *default-deny* CSP. Any cross-origin asset (image,
 *    font, script, fetch target) must be allow-listed by the *server* in the
 *    resource's `_meta.ui.csp.{resourceDomains,connectDomains}`. The View
 *    cannot loosen its own CSP from inside the sandbox.
 *  • `app.requestDisplayMode({ mode })` asks the host to move the iframe
 *    between `inline`, `fullscreen`, and `pip`. The host has final say — the
 *    method resolves with the *granted* mode, which may differ from the ask.
 *  • `app.getHostContext().availableDisplayModes` lists what the host is
 *    willing to grant — feature-detect before showing the toggle button.
 *  • `onhostcontextchanged` keeps the toggle label and visibility in sync if
 *    the host changes the display mode out from under us (e.g. the user
 *    exits fullscreen with Escape).
 */
import { App, type McpUiDisplayMode } from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import { requireElement } from "../shared/dom.js";
import { applyHostContext } from "../shared/host-theme.js";
import "./style.css";

const FlagResultSchema = z.object({
  country: z.string(),
  code: z.string(),
});
type FlagResult = z.infer<typeof FlagResultSchema>;

const countryEl = requireElement("country");
const modeEl = requireElement("mode");
const toggleBtn = requireElement<HTMLButtonElement>("toggle");
const flagContainer = requireElement("flag-container");

let mode: McpUiDisplayMode = "inline";

function renderMode() {
  modeEl.textContent = mode;
  toggleBtn.textContent = mode === "fullscreen" ? "Exit fullscreen" : "Go fullscreen";
}

function renderFlag(data: FlagResult) {
  countryEl.textContent = data.country;
  // The image URL crosses origins. It loads only because the server attached
  // `_meta.ui.csp.resourceDomains: ["https://flagcdn.com"]` to the resource.
  // Strip that entry server-side and the image is blocked silently — so make
  // that failure visible with an onerror fallback instead of a broken-image icon.
  const img = document.createElement("img");
  img.alt = `Flag of ${data.country}`;
  img.onerror = () => {
    flagContainer.replaceChildren(
      Object.assign(document.createElement("p"), {
        textContent:
          `Could not load the flag for "${data.code}". If the server's ` +
          `_meta.ui.csp.resourceDomains is missing flagcdn.com, the host's ` +
          `default-deny CSP blocked it (or the country code is unknown).`,
      }),
    );
  };
  img.src = `https://flagcdn.com/w640/${data.code}.png`;
  flagContainer.replaceChildren(img);
}

function renderError(message: string) {
  flagContainer.replaceChildren(Object.assign(document.createElement("p"), { textContent: message }));
}

const app = new App({ name: "Step 6 — Fullscreen + CSP", version: "1.0.0" });

app.ontoolresult = (result) => {
  if (result.isError) {
    renderError("The tool call failed — see the conversation for details.");
    return;
  }
  const parsed = FlagResultSchema.safeParse(result.structuredContent);
  if (!parsed.success) {
    renderError(`Unexpected structuredContent shape: ${parsed.error.message}`);
    return;
  }
  renderFlag(parsed.data);
};

function syncFromHost() {
  const ctx = app.getHostContext();
  applyHostContext(ctx);
  if (ctx?.displayMode) mode = ctx.displayMode;
  const available = ctx?.availableDisplayModes ?? [];
  // Feature-detect: only offer the toggle if the host is willing to grant it.
  toggleBtn.hidden = !available.includes("fullscreen");
  renderMode();
}

toggleBtn.addEventListener("click", async () => {
  const target: McpUiDisplayMode = mode === "fullscreen" ? "inline" : "fullscreen";
  try {
    const result = await app.requestDisplayMode({ mode: target });
    // The granted mode may differ from the requested one — always trust what
    // the host returns.
    mode = result.mode;
    renderMode();
  } catch (err) {
    // Host declined the change (e.g. fullscreen revoked since feature-detect).
    console.error("[step6] requestDisplayMode failed", err);
  }
});

app.onhostcontextchanged = syncFromHost;

app.connect().then(syncFromHost, (err: unknown) => console.error("[step6] connect failed", err));
