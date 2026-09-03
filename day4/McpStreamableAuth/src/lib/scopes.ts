import type { AuthInfo } from "@modelcontextprotocol/server";

/** Shape of a tool-level error result (`CallToolResult` with `isError`). */
type ScopeError = { isError: true; content: { type: "text"; text: string }[] };

/**
 * Per-tool authorization check.
 *
 * Every `/mcp` request is already *authenticated* — `requireBearerAuth` made
 * sure of that before the handler ran. This is the *authorization* half: does
 * the caller's token actually carry the permission this particular tool needs?
 *
 * The failure is returned as a tool-level `{ isError: true, … }` result rather
 * than thrown. A thrown error would reach the client as a generic JSON-RPC
 * `-32603 "Internal error"`; a tool result names the missing scope, so the
 * model (and the user) can see what to ask for.
 *
 * @returns `null` when everything required is granted, otherwise the error result.
 */
export function checkScopes(
	authInfo: AuthInfo | undefined,
	...required: string[]
): ScopeError | null {
	if (!authInfo) {
		return {
			isError: true,
			content: [{ type: "text", text: "Authentication required." }],
		};
	}

	const granted = new Set(authInfo.scopes);
	const missing = required.filter((scope) => !granted.has(scope));
	if (missing.length > 0) {
		return {
			isError: true,
			content: [
				{
					type: "text",
					text: `Missing required OAuth scope(s): ${missing.join(", ")}`,
				},
			],
		};
	}

	return null;
}
