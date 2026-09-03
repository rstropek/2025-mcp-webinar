import { toNodeHandler } from "@modelcontextprotocol/node";
import {
	completable,
	createMcpHandler,
	McpServer,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
	buildMany,
	buildPassword,
	buildPasswordAdvanced,
	filterPonies,
} from "./lib/password.js";
import { loadPoniesFromFile, toOnePerLine } from "./lib/ponies.js";
import { checkScopes } from "./lib/scopes.js";
import { createStreamableHTTPServer } from "./lib/streamable-http.js";

const SERVER_NAME = "pony-sdk-streamable";
const SERVER_VERSION = "0.1.0";
const PORT = 3000;

// Read the pony list once at startup. The file never changes during the
// process's lifetime, so re-reading on every tool call would just be noise.
const ponies = loadPoniesFromFile();

/**
 * The SDK serves a *factory*, not a single connected server object. Over
 * Streamable HTTP `createMcpHandler` calls this function once per HTTP
 * request and throws the instance away again afterwards — the 2026-07-28
 * revision is stateless, so there is nothing to keep between requests (which
 * is also what makes such a server horizontally scalable: any replica can
 * answer any request). Registering everything in one place therefore serves
 * BOTH protocol eras: the 2026-07-28 revision and the legacy 2025-era
 * `initialize` handshake.
 *
 * Nothing in here deals with tokens: by the time the factory runs, the
 * `requireBearerAuth` middleware has already validated the caller's token.
 * What handlers see of it is `ctx.http?.authInfo`.
 */
function buildServer(): McpServer {
	const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

	// NOTE: registration order is the order `tools/list` reports. The 2026-07-28
	// revision asks servers for a deterministic listing order, so we simply keep
	// the registrations in a fixed, hand-written order below.

	/** Tool 1: single password */
	server.registerTool(
		"pony_password",
		{
			title: "Generate a password",
			description: "Builds a password from My Little Pony character names.",
			// Schemas are Standard Schema objects such as `z.object({...})`.
			inputSchema: z.object({
				minLength: z.number().int().min(1).default(16),
				special: z.boolean().default(false),
			}),
			outputSchema: z.object({ result: z.string() }),
		},
		({ minLength, special }) => {
			const output = buildPassword({ minLength, special }, ponies);
			return {
				content: [{ type: "text", text: output }],
				structuredContent: { result: output },
			};
		},
	);

	/** Tool 2: batch */
	server.registerTool(
		"pony_password_batch",
		{
			title: "Generate multiple passwords",
			description: "Generates N passwords with the same options.",
			inputSchema: z.object({
				count: z.number().int().min(1).max(50).default(5),
				minLength: z.number().int().min(1).default(16),
				special: z.boolean().default(false),
			}),
			outputSchema: z.object({ result: z.array(z.string()) }),
		},
		({ count, minLength, special }) => {
			const pwds = buildMany(count, { minLength, special }, ponies);
			// Human-readable text fallback (one per line) for hosts that don't read
			// structuredContent. The typed array still flows via structuredContent.
			return {
				content: [
					{
						type: "text",
						text: pwds.map((p, i) => `${i + 1}. ${p}`).join("\n"),
					},
				],
				structuredContent: { result: pwds },
			};
		},
	);

	server.registerPrompt(
		"make-pony-password",
		{
			title: "Create pony password",
			description: "Prompt for generating a password from MLP character names",
			// `completable()` wraps a single argument to provide autocompletion values.
			argsSchema: z.object({
				minLength: completable(z.string(), (val) =>
					[8, 12, 16, 20, 24, 32]
						.filter((n) => String(n).startsWith(String(val ?? "")))
						.map(String),
				),
				special: completable(z.string(), (val) => {
					const opts = ["true", "false"];
					return opts.filter((s) => s.startsWith(String(val ?? "")));
				}),
			}),
		},
		({ minLength, special }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: `Generate a secure password for me from My Little Pony character names.
- Minimum length: ${minLength}
- Special-character substitution enabled: ${special}
Substitution rules (if enabled): o/O→0, i/I→!, e/E→€, s/S→$.`,
					},
				},
			],
		}),
	);

	// `registerResource` takes a name, a fixed URI, metadata and a read callback.
	server.registerResource(
		"pony-characters-text",
		"pony://characters.txt",
		{
			title: "MLP characters (text)",
			description:
				"One name per line from data/ponies.txt (CamelCase, no spaces in last name).",
			mimeType: "text/plain; charset=utf-8",
		},
		(uri) => {
			const text = toOnePerLine(ponies);
			return { contents: [{ uri: uri.href, text }] };
		},
	);

	/**
	 * Advanced hybrid generator — the sample's authorization lesson.
	 *
	 * Reaching this handler already proves *authentication*: the request
	 * carried a valid token for this resource. What it does not prove is
	 * *authorization* — whether that token was granted the `ponypwd:generate`
	 * permission. A token minted without it passes the middleware and fails
	 * here, which is exactly the distinction we want to show.
	 */
	server.registerTool(
		"pony_password_advanced",
		{
			title: "Advanced hybrid password generator",
			description:
				"Generates strong passwords by mixing ponies with numbers, symbols, and case variations. Requires the `ponypwd:generate` OAuth scope.",
			inputSchema: z.object({
				length: z.number().int().min(8).max(128).default(20),
				includeNumbers: z.boolean().default(true),
				includeSymbols: z.boolean().default(true),
				includeUppercase: z.boolean().default(true),
				customPonies: z.array(z.string()).optional(),
			}),
			outputSchema: z.object({
				result: z.string(),
				metadata: z.object({
					length: z.number(),
					includedNumbers: z.boolean(),
					includedSymbols: z.boolean(),
					includedUppercase: z.boolean(),
					composition: z.array(z.string()),
				}),
			}),
		},
		(
			{
				length,
				includeNumbers,
				includeSymbols,
				includeUppercase,
				customPonies,
			},
			ctx,
		) => {
			// `checkScopes` returns a tool-level error the client can render
			// ("Missing required OAuth scope(s): ponypwd:generate") instead of
			// the SDK turning a thrown Error into a generic -32603 "Internal".
			const scopeError = checkScopes(ctx.http?.authInfo, "ponypwd:generate");
			if (scopeError) return scopeError;

			let pool = ponies;
			if (customPonies && customPonies.length > 0) {
				pool = filterPonies(pool, customPonies);
				if (pool.length === 0) {
					return {
						isError: true,
						content: [
							{
								type: "text",
								text: "No matching ponies found for the provided custom list.",
							},
						],
					};
				}
			}

			const result = buildPasswordAdvanced(
				{ length, includeNumbers, includeSymbols, includeUppercase },
				pool,
			);

			return {
				content: [{ type: "text", text: result.result }],
				structuredContent: result,
			};
		},
	);

	/**
	 * Diagnostic tool: returns the JWT claims of the caller's token, which the
	 * verifier parked in `AuthInfo.extra`. Invaluable while debugging
	 * scope/audience/issuer mismatches during an OAuth integration — it shows
	 * exactly what the authorization server put into the token.
	 */
	server.registerTool(
		"get_token_claims",
		{
			title: "Get token claims",
			description:
				"Returns the claims from the JWT authentication token for the current request. Useful for debugging OAuth integration.",
			inputSchema: z.object({}),
			outputSchema: z.object({
				claims: z.record(z.string(), z.any()).optional(),
				isAuthenticated: z.boolean(),
			}),
		},
		(_args, ctx) => {
			const authInfo = ctx.http?.authInfo;
			if (!authInfo) {
				return {
					content: [
						{
							type: "text",
							text: "Not authenticated. No token claims available.",
						},
					],
					structuredContent: { isAuthenticated: false },
				};
			}

			const claims = authInfo.extra?.claims;
			return {
				content: [
					{
						type: "text",
						text: `Token Claims:\n${JSON.stringify(claims, null, 2)}`,
					},
				],
				structuredContent: { claims, isAuthenticated: true },
			};
		},
	);

	return server;
}

/**
 * `createMcpHandler(factory)` turns the factory into a single web-standard
 * `fetch(Request) => Response` handler that decides the era of every incoming
 * POST on its own.
 *
 * - `legacy: "stateless"` (the default) keeps serving 2025-era clients — each
 *   legacy request is answered from a fresh instance too, and GET/DELETE (the
 *   2025 session operations) are answered with 405. `legacy: "reject"` would
 *   make the endpoint 2026-07-28-only.
 * - `responseMode: "auto"` (the default) answers with a plain JSON body and
 *   only upgrades the response to an SSE stream when the handler emits
 *   something before its result (a progress notification, for example).
 */
const handler = createMcpHandler(buildServer, {
	legacy: "stateless",
	responseMode: "auto",
});

// `toNodeHandler` adapts the web-standard handler to Express's `(req, res)`.
// It also forwards `req.auth` — the `AuthInfo` that `requireBearerAuth` put
// there — into the MCP request context as `ctx.http.authInfo`.
createStreamableHTTPServer(
	toNodeHandler(handler),
	SERVER_NAME,
	SERVER_VERSION,
	PORT,
);

process.on("SIGINT", async () => {
	// Aborts in-flight exchanges and closes their per-request server instances.
	await handler.close();
	process.exit(0);
});
