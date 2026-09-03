/**
 * Shared "adapt to the host" helper.
 *
 * MCP-Apps concepts on display:
 *  • The host pushes its look-and-feel (color theme, CSS variables, fonts)
 *    through `McpUiHostContext` — once during the `ui/initialize` handshake
 *    (`app.getHostContext()`) and again on every `onhostcontextchanged`
 *    notification (theme toggles, resize, …). Nothing is applied
 *    automatically: a View must call the SDK's `applyDocumentTheme` /
 *    `applyHostStyleVariables` / `applyHostFonts` helpers itself, and it must
 *    do so from BOTH places or it only reflects the host's style until the
 *    next change.
 *  • `safeAreaInsets` matters on mobile / notched displays — the host does
 *    not pad the iframe for you, so a View that ignores it can render under
 *    a device notch or home-indicator bar.
 *
 * Steps 2 and 6 both react to host context changes, so this one function is
 * shared between them instead of duplicating the same four `if` statements
 * in two views.
 */
import {
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

/**
 * Applies theme, host style variables, host fonts, and (optionally)
 * safe-area-inset padding from a host context snapshot.
 *
 * @param ctx The context to apply — pass `app.getHostContext()` right after
 *   `connect()` resolves, and again inside `onhostcontextchanged`.
 * @param paddingTarget An element to pad with `safeAreaInsets`, usually the
 *   View's top-level layout container. Omit if the View doesn't need it.
 */
export function applyHostContext(ctx: McpUiHostContext | undefined, paddingTarget?: HTMLElement): void {
  if (!ctx) return;

  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);

  const insets = ctx.safeAreaInsets;
  if (insets && paddingTarget) {
    paddingTarget.style.padding = `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`;
  }
}
