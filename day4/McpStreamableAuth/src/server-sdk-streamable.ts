import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	getTokenClaims,
	isAuthenticated,
	requireScopes,
} from "./lib/auth-context.js";
import {
	buildMany,
	buildPassword,
	buildPasswordAdvanced,
	filterPonies,
} from "./lib/password.js";
import { loadPoniesFromFile, toOnePerLine } from "./lib/ponies.js";
import { createStreamableHTTPServer } from "./lib/streamable-http.js";

const server = new McpServer({ name: "pony-sdk-streamable", version: "0.1.0" });

/** Tool 1: single password */
server.registerTool(
	"pony_password",
	{
		title: "Generate a password",
		description: "Builds a password from My Little Pony character names.",
		inputSchema: {
			minLength: z.number().int().min(1).default(16),
			special: z.boolean().default(false),
		},
		outputSchema: { result: z.string() },
	},
	({ minLength, special }) => {
		const ponies = loadPoniesFromFile();
		const output = buildPassword({ minLength, special }, ponies);
		return {
			content: [{ type: "text", text: output }],
			structuredContent: { result: output },
		};
	},
);

server.registerTool(
	"pony_password_with_preferences",
	{
		title: "Generate a password (with preferences)",
		description:
			"Builds a password from My Little Pony character names. The user can exclude ponies they dislike.",
		inputSchema: {
			minLength: z.number().int().min(1).default(16),
			special: z.boolean().default(false),
		},
		outputSchema: { result: z.string() },
	},
	async ({ minLength, special }) => {
		let ponies = loadPoniesFromFile();
		const result = await server.server.elicitInput({
			message: "Which ponies to exclude?",
			requestedSchema: {
				type: "object",
				properties: {
					excludedPonies: {
						type: "string",
						title: "Excluded Ponies",
						description:
							"List the names of ponies to exclude, separated by commas.",
					},
				},
				required: ["excludedPonies"],
			},
		});

		if (result.action === "accept" && result.content) {
			const excluded = new Set(
				(result.content.excludedPonies as string)
					.split(",")
					.map((s) => s.trim().toLowerCase())
					.filter(Boolean),
			);
			console.error("[pony-sdk-streamable] excluding ponies:", [...excluded]);
			ponies = ponies.filter(
				(pony) =>
					!excluded.has(pony.first.toLowerCase()) &&
					(!pony.last || !excluded.has(pony.last.toLowerCase())),
			);
		} else if (result.action === "decline" || result.action === "cancel") {
			console.error(
				`[pony-sdk-streamable] elicitation ${result.action}ed; using all ponies`,
			);
		}

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
		inputSchema: {
			count: z.number().int().min(1).max(50).default(5),
			minLength: z.number().int().min(1).default(16),
			special: z.boolean().default(false),
		},
		outputSchema: { result: z.array(z.string()) },
	},
	({ count, minLength, special }) => {
		const ponies = loadPoniesFromFile();
		const pwds = buildMany(count, { minLength, special }, ponies);
		return {
			content: [{ type: "text", text: JSON.stringify(pwds) }],
			structuredContent: { result: pwds },
		};
	},
);

server.registerPrompt(
	"make-pony-password",
	{
		title: "Create pony password",
		description: "Prompt for generating a password from MLP character names",
		argsSchema: {
			minLength: completable(z.string(), (val) =>
				[8, 12, 16, 20, 24, 32]
					.filter((n) => String(n).startsWith(String(val ?? "")))
					.map(String),
			),
			special: completable(z.string(), (val) => {
				const opts = ["true", "false"];
				return opts.filter((s) => s.startsWith(String(val ?? "")));
			}),
		},
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
		const ponies = loadPoniesFromFile();
		const text = toOnePerLine(ponies);
		return { contents: [{ uri: uri.href, text }] };
	},
);

/**
 * Advanced hybrid generator — all /mcp requests are already authenticated by
 * `requiredAuthMiddleware`. This tool additionally requires the
 * `ponypwd:generate` scope, enforced via `requireScopes()` below. A token
 * that was issued without that scope will fail here even though it passed the
 * global auth check — i.e. authentication (who) vs authorization (what).
 */
server.registerTool(
	"pony_password_advanced",
	{
		title: "Advanced hybrid password generator",
		description:
			"Generates strong passwords by mixing ponies with numbers, symbols, and case variations. Requires the `ponypwd:generate` OAuth scope.",
		inputSchema: {
			length: z.number().int().min(8).max(128).default(20),
			includeNumbers: z.boolean().default(true),
			includeSymbols: z.boolean().default(true),
			includeUppercase: z.boolean().default(true),
			customPonies: z.array(z.string()).optional(),
		},
		outputSchema: {
			result: z.string(),
			metadata: z.object({
				length: z.number(),
				includedNumbers: z.boolean(),
				includedSymbols: z.boolean(),
				includedUppercase: z.boolean(),
				composition: z.array(z.string()),
			}),
		},
	},
	({
		length,
		includeNumbers,
		includeSymbols,
		includeUppercase,
		customPonies,
	}) => {
		requireScopes("ponypwd:generate");

		let ponies = loadPoniesFromFile();
		if (customPonies && customPonies.length > 0) {
			ponies = filterPonies(ponies, customPonies);
			if (ponies.length === 0) {
				throw new Error(
					"No matching ponies found for the provided custom list.",
				);
			}
		}

		const result = buildPasswordAdvanced(
			{ length, includeNumbers, includeSymbols, includeUppercase },
			ponies,
		);

		return {
			content: [{ type: "text", text: result.result }],
			structuredContent: result,
		};
	},
);

/**
 * Diagnostic tool: returns the JWT claims of the caller's token. Useful while
 * debugging scope/audience/issuer mismatches during an OAuth integration.
 */
server.registerTool(
	"get_token_claims",
	{
		title: "Get token claims",
		description:
			"Returns the claims from the JWT authentication token for the current request. Useful for debugging OAuth integration.",
		inputSchema: {},
		outputSchema: {
			claims: z.record(z.string(), z.any()).optional(),
			isAuthenticated: z.boolean(),
		},
	},
	() => {
		if (!isAuthenticated()) {
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

		const claims = getTokenClaims();
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

createStreamableHTTPServer(server, "pony-sdk-streamable", "0.1.0", 3000);
