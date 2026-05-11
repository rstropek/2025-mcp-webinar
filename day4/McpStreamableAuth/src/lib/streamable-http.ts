import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import cors from "cors";
import express from "express";
import { type AuthContext, runWithAuthContext } from "./auth-context.js";
import { requiredAuthMiddleware } from "./auth-middleware.js";
import { SCALEKIT_CONFIG } from "./scalekit-config.js";

/**
 * Creates and starts a streamable HTTP server for MCP (Model Context Protocol) communication.
 *
 * HTTP Endpoints:
 * - POST /mcp - Main JSON-RPC endpoint for MCP protocol communication
 * - GET /mcp - Server-to-client notifications via Server-Sent Events (SSE)
 * - DELETE /mcp - Session termination endpoint
 * - GET /health - Health check endpoint
 * - GET /.well-known/oauth-protected-resource[/mcp] - OAuth discovery
 */
export function createStreamableHTTPServer(
	server: McpServer,
	serverName: string,
	serverVersion: string,
	port: number,
): void {
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
	 * Permissive because MCP clients run in many contexts (browsers, desktop apps,
	 * CLI tools) and their origins are not known in advance. In production you would
	 * typically lock `origin` down to the set of trusted client origins.
	 *
	 * - origin: accepts all origins.
	 * - credentials: false — we authenticate with OAuth 2.0 Bearer tokens in the
	 *   Authorization header, not cookies. This avoids CSRF concerns that come
	 *   with credentialed cross-origin cookies.
	 * - methods: GET (SSE + health), POST (JSON-RPC), OPTIONS (preflight).
	 * - allowedHeaders: headers clients may send, incl. MCP + Authorization.
	 * - exposedHeaders: headers browsers may *read* on the response — critical for
	 *   `WWW-Authenticate` (OAuth challenge) and `Mcp-Session-Id`.
	 * - maxAge: 24 h preflight cache to cut OPTIONS traffic.
	 */
	const allowAll = cors({
		origin: (_origin, cb) => cb(null, true),
		credentials: false,
		methods: ["GET", "POST", "OPTIONS"],
		allowedHeaders: [
			"Mcp-Protocol-Version",
			"Content-Type",
			"Authorization",
			"Mcp-Session-Id",
		],
		exposedHeaders: ["WWW-Authenticate", "Mcp-Session-Id"],
		maxAge: 86400,
	});
	app.use(allowAll);

	app.use(express.json());

	const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

	/**
	 * OAuth 2.0 Protected Resource Metadata endpoint (RFC 9728).
	 *
	 * Advertises which authorization servers issue tokens for this resource, the
	 * supported scopes, and the token transmission method. MCP clients fetch this
	 * after receiving a 401 with `WWW-Authenticate: resource_metadata=...` so they
	 * can discover the auth server and kick off the OAuth flow automatically.
	 *
	 * The endpoint is public (no auth required) — that's the whole point.
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
	app.get(
		"/.well-known/oauth-protected-resource/mcp",
		handleOAuthProtectedResource,
	);
	app.get(
		"/mcp/.well-known/oauth-protected-resource",
		handleOAuthProtectedResource,
	);

	// Health check must stay public — register BEFORE the auth middleware.
	app.get("/health", (_req, res) => {
		res.json({
			status: "healthy",
			timestamp: new Date().toISOString(),
			activeSessions: Object.keys(transports).length,
			serverName,
			serverVersion,
			resourceId: SCALEKIT_CONFIG.resourceId,
			authServer: SCALEKIT_CONFIG.authServer,
		});
	});

	// From here on, every /mcp request requires a valid Bearer token.
	app.use("/mcp", requiredAuthMiddleware);

	app.post("/mcp", async (req, res) => {
		try {
			const sessionId = req.headers["mcp-session-id"] as string | undefined;
			let transport: StreamableHTTPServerTransport;

			const existing = sessionId ? transports[sessionId] : undefined;
			if (existing) {
				transport = existing;
			} else if (!sessionId && isInitializeRequest(req.body)) {
				transport = new StreamableHTTPServerTransport({
					sessionIdGenerator: () => randomUUID(),
					// `StreamableHTTPServerTransport` writes the `mcp-session-id`
					// response header itself; we only need to remember the
					// transport so subsequent requests can find it.
					onsessioninitialized: (sid) => {
						transports[sid] = transport;
					},
				});

				transport.onclose = () => {
					if (transport.sessionId) delete transports[transport.sessionId];
				};

				await server.connect(transport);
			} else {
				res.status(400).json({
					jsonrpc: "2.0",
					error: {
						code: -32000,
						message: "Bad Request: No valid session ID provided",
					},
					id: null,
				});
				return;
			}

			// Establish per-request auth context so tool handlers can call
			// isAuthenticated() / getTokenClaims() without parameter drilling.
			const authContext: AuthContext = {
				token: req.token,
				tokenClaims: req.tokenClaims,
				isAuthenticated: req.isAuthenticated ?? false,
				sessionId: transport.sessionId,
			};

			await runWithAuthContext(authContext, async () => {
				await transport.handleRequest(req, res, req.body);
			});
		} catch (error) {
			console.error(`[${serverName}] error handling POST /mcp:`, error);
			if (!res.headersSent) {
				res.status(500).json({
					jsonrpc: "2.0",
					error: { code: -32603, message: "Internal server error" },
					id: null,
				});
			}
		}
	});

	// Shared GET/DELETE handler — GET opens the server→client SSE stream,
	// DELETE terminates the session.
	const handleSessionRequest = async (
		req: express.Request,
		res: express.Response,
	) => {
		const sessionId = req.headers["mcp-session-id"] as string | undefined;
		const transport = sessionId ? transports[sessionId] : undefined;
		if (!transport) {
			res.status(400).send("Invalid or missing session ID");
			return;
		}

		const authContext: AuthContext = {
			token: req.token,
			tokenClaims: req.tokenClaims,
			isAuthenticated: req.isAuthenticated ?? false,
			sessionId,
		};

		await runWithAuthContext(authContext, async () => {
			await transport.handleRequest(req, res);
		});
	};

	app.get("/mcp", handleSessionRequest);
	app.delete("/mcp", handleSessionRequest);

	const PORT = process.env.PORT || port;
	app.listen(PORT, () => {
		console.log(
			`MCP server (${serverName}) running at http://127.0.0.1:${PORT}/mcp`,
		);
		console.log(`Health check: http://127.0.0.1:${PORT}/health`);
	});
}
