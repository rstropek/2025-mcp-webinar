import {
	getOAuthProtectedResourceMetadataUrl,
	requireBearerAuth,
} from "@modelcontextprotocol/express";
import type { NodeMcpRequestHandler } from "@modelcontextprotocol/node";
import cors from "cors";
import express from "express";
import { SCALEKIT_CONFIG } from "./scalekit-config.js";
import { scalekitVerifier } from "./scalekit-verifier.js";

/**
 * Express harness around an MCP handler, protected with OAuth 2.0 bearer tokens.
 *
 * Routes:
 * - `ALL  /mcp` — the MCP endpoint. Requires a bearer token; `POST` carries the
 *   JSON-RPC traffic, `GET`/`DELETE` are answered with `405` by the handler
 *   itself (the 2026-07-28 revision has no sessions and no server-push stream).
 * - `GET  /.well-known/oauth-protected-resource[/mcp]` — RFC 9728 metadata (public).
 * - `GET  /health` — liveness probe for the container platform (public).
 */
export function createStreamableHTTPServer(
	mcp: NodeMcpRequestHandler,
	serverName: string,
	serverVersion: string,
	port: number,
): void {
	// A plain Express app, not `createMcpExpressApp()`: that helper's
	// DNS-rebinding protection validates `Host` and `Origin` against localhost,
	// which is exactly wrong here. This server is deployed publicly and is
	// talked to by browser-based MCP clients (MCPJam, the MCP Inspector) from
	// origins we cannot enumerate. The protection it provides is also not
	// needed: DNS rebinding lets an attacker's page *reach* the server, but
	// every `/mcp` request still needs a bearer token whose `aud` is bound to
	// this resource — and a rebinding attack yields no such token.
	const app = express();

	app.use((req, _res, next) => {
		// Skip the noisy `/health` line that load balancers hammer every
		// few seconds.
		if (req.url !== "/health") {
			console.log("Request received:", req.method, req.url);
		}
		next();
	});

	/**
	 * CORS configuration for the MCP server.
	 *
	 * - `origin`: accepts all origins — browser-based MCP clients are hosted
	 *   wherever their vendor hosts them.
	 * - `credentials: false` — authentication is an OAuth 2.0 bearer token in
	 *   the `Authorization` header, never a cookie. That side-steps the CSRF
	 *   concerns that come with credentialed cross-origin requests.
	 * - `methods`: `GET` (metadata + health), `POST` (JSON-RPC), `OPTIONS`
	 *   (preflight). `DELETE` is absent on purpose: it only ever gets a `405`.
	 * - `allowedHeaders`: what clients may send. `MCP-Protocol-Version`,
	 *   `Mcp-Method` and `Mcp-Name` are the 2026-07-28 routing headers that
	 *   duplicate part of the JSON-RPC body so proxies can route without
	 *   parsing it.
	 * - `exposedHeaders`: what browsers may *read* off the response.
	 *   `WWW-Authenticate` is the one that matters — it carries the OAuth
	 *   challenge, and without this a browser client never sees it.
	 * - `maxAge`: 24 h preflight cache to cut OPTIONS traffic.
	 */
	app.use(
		cors({
			origin: (_origin, cb) => cb(null, true),
			credentials: false,
			methods: ["GET", "POST", "OPTIONS"],
			allowedHeaders: [
				"Content-Type",
				"Authorization",
				"MCP-Protocol-Version",
				"Mcp-Method",
				"Mcp-Name",
			],
			exposedHeaders: ["WWW-Authenticate"],
			maxAge: 86400,
		}),
	);

	app.use(express.json());

	/**
	 * OAuth 2.0 Protected Resource Metadata (RFC 9728) — the document a client
	 * fetches after it has been refused, to learn *where* to get a token.
	 *
	 * This is the same JSON that the Scalekit dashboard shows as "Metadata
	 * JSON" for the MCP server; it is written out by hand here so the sample
	 * shows every field. The endpoint is public — that is the whole point.
	 */
	function handleOAuthProtectedResource(
		_req: express.Request,
		res: express.Response,
	) {
		res.json({
			// URLs of the auth servers that issue tokens accepted here.
			authorization_servers: [SCALEKIT_CONFIG.authServer],

			// Only accept tokens in the Authorization header (RFC 6750 §2.1). We
			// reject body/query transmission because those leak into logs and
			// caches more easily.
			bearer_methods_supported: ["header"],

			// Unique identifier for this resource. Clients include it in the
			// `resource` parameter at token request time so the auth server can
			// bind the token's `aud` claim to this resource (RFC 8707).
			resource: SCALEKIT_CONFIG.resourceId,

			resource_documentation: `${SCALEKIT_CONFIG.resourceId}/docs`,

			// Scopes this resource understands. Clients should request only what
			// they need (least privilege).
			scopes_supported: SCALEKIT_CONFIG.supportedScopes,
		});
	}

	// RFC 9728 puts the resource's path *after* the well-known segment, so the
	// canonical URL for `…/mcp` is `/.well-known/oauth-protected-resource/mcp`.
	// The path-less variant is served too, because some clients probe the
	// origin's root before they have parsed the challenge.
	app.get(
		"/.well-known/oauth-protected-resource/mcp",
		handleOAuthProtectedResource,
	);
	app.get(
		"/.well-known/oauth-protected-resource",
		handleOAuthProtectedResource,
	);

	// Health check stays public — register BEFORE anything that requires a token.
	app.get("/health", (_req, res) => {
		res.json({
			status: "healthy",
			timestamp: new Date().toISOString(),
			serverName,
			serverVersion,
			resourceId: SCALEKIT_CONFIG.resourceId,
			authServer: SCALEKIT_CONFIG.authServer,
		});
	});

	/**
	 * The authorization gate, and the start of the MCP discovery flow.
	 *
	 * `requireBearerAuth` validates the `Authorization` header through the
	 * verifier and puts the resulting `AuthInfo` on `req.auth`; `toNodeHandler`
	 * forwards that into the MCP request context, where handlers read it as
	 * `ctx.http.authInfo`.
	 *
	 * When there is no usable token it answers `401` with
	 *
	 *     WWW-Authenticate: Bearer error="invalid_token", …,
	 *                       resource_metadata="<resourceMetadataUrl>"
	 *
	 * and that header is what bootstraps a client that knows nothing about us:
	 *
	 * 1. The client calls `/mcp` without a token and gets the `401`.
	 * 2. It follows `resource_metadata` to the RFC 9728 document above and
	 *    reads `authorization_servers`.
	 * 3. It fetches `<auth server>/.well-known/oauth-authorization-server`
	 *    (RFC 8414) to find the authorize and token endpoints.
	 * 4. It identifies itself — with a Client ID Metadata Document (an HTTPS
	 *    URL as `client_id`) on 2026-07-28, or via dynamic registration.
	 * 5. It runs the authorization-code flow with PKCE, passing
	 *    `resource=<our resource id>` so the issued token's `aud` is bound to
	 *    this server (RFC 8707).
	 * 6. It retries the original request with `Authorization: Bearer <token>`.
	 *
	 * `requiredScopes` is deliberately not set: enforcing a scope here would
	 * apply it to every tool. Scopes are checked per tool instead — see
	 * `checkScopes` and the `pony_password_advanced` tool.
	 */
	const auth = requireBearerAuth({
		verifier: scalekitVerifier,
		resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(
			new URL(SCALEKIT_CONFIG.resourceId),
		),
	});

	// ONE endpoint, and `app.all` because the handler answers every HTTP method
	// itself. `req.body` is passed along so the already-parsed JSON is not read
	// from the stream a second time.
	app.all("/mcp", auth, (req, res) => void mcp(req, res, req.body));

	// Bind to all interfaces: in the container the platform reaches the process
	// from outside, and unlike an unauthenticated local server this endpoint is
	// safe to expose — no token, no access.
	const PORT = process.env.PORT || port;
	app.listen(PORT, () => {
		console.log(
			`MCP server (${serverName}) running at http://localhost:${PORT}/mcp`,
		);
		console.log(`Health check: http://localhost:${PORT}/health`);
	});
}
