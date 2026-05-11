import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildMany, buildPassword } from "./lib/password.js";
import { loadPoniesFromFile, toOnePerLine } from "./lib/ponies.js";
import { createStreamableHTTPServer } from "./lib/streamable-http.js";

const server = new McpServer({ name: "pony-sdk-streamable", version: "0.1.0" });

// Read the pony list once at startup; the file is static.
const ponies = loadPoniesFromFile();

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
		let pool = ponies;

		// Elicitation is a CLIENT capability. If the connected client didn't
		// advertise it, skip the prompt and just use the full pool — that way
		// the tool still produces something sensible instead of a generic SDK
		// error from `elicitInput`.
		if (server.server.getClientCapabilities()?.elicitation) {
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
				console.log("[pony-sdk-streamable] excluding ponies:", [...excluded]);
				pool = pool.filter(
					(pony) =>
						!excluded.has(pony.first.toLowerCase()) &&
						(!pony.last || !excluded.has(pony.last.toLowerCase())),
				);
			} else if (result.action === "decline" || result.action === "cancel") {
				console.log(
					`[pony-sdk-streamable] elicitation ${result.action}ed; using all ponies`,
				);
			}
		} else {
			console.log(
				"[pony-sdk-streamable] client has no elicitation capability; using all ponies",
			);
		}

		const output = buildPassword({ minLength, special }, pool);
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
		const pwds = buildMany(count, { minLength, special }, ponies);
		return {
			content: [{ type: "text", text: pwds.map((p, i) => `${i + 1}. ${p}`).join("\n") }],
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
		const text = toOnePerLine(ponies);
		return { contents: [{ uri: uri.href, text }] };
	},
);

createStreamableHTTPServer(server, "pony-sdk-streamable", "0.1.0", 3000);
