import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildMany, buildPassword } from "./lib/password.js";
import { loadPoniesFromFile, toOnePerLine } from "./lib/ponies.js";

const server = new McpServer({ name: "pony-sdk", version: "0.1.0" });

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

const transport = new StdioServerTransport();
server.connect(transport);
