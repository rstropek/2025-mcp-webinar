import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildMany } from "./lib/password.js";

const server = new McpServer({ name: "pony-sdk", version: "0.1.0" });

server.registerTool(
	"pony_password_sampled",
	{
		title: "Passwords from sampled names (LLM)",
		description:
			"Generates passwords; character names are fetched at runtime via MCP sampling from the LLM.",
		inputSchema: {
			count: z.number().int().min(1).max(50).default(5),
			minLength: z.number().int().min(1).default(16),
			special: z.boolean().default(false),
		},
		outputSchema: {
			result: z.array(z.string()),
			usedNames: z.array(z.string()),
		},
	},
	async ({ count, minLength, special }) => {
		// Sampling is a CLIENT capability. If the connected client didn't
		// advertise it during initialize, `createMessage` will throw a generic
		// SDK error — surface a useful tool-level error instead.
		if (!server.server.getClientCapabilities()?.sampling) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: "This tool needs the client's `sampling` capability, but the connected client did not advertise it.",
					},
				],
				structuredContent: { result: [], usedNames: [] },
			};
		}

		const sampleSize = Math.max(count * 3, 10);
		console.error(
			`[pony-sampling] requesting ${sampleSize} names via sampling`,
		);
		// `server.server.createMessage` is the supported escape hatch — the
		// `McpServer` convenience class doesn't expose sampling directly.
		const sampling = await server.server.createMessage({
			systemPrompt:
				"You are a data generator. Return STRICT JSON only. No prose, no markdown.",
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: [
							`Generate a JSON array of ${sampleSize} distinct My Little Pony names.`,
							`Rules:`,
							`- Each entry must be an object with "first" (required) and optional "last" properties.`,
							`- Names should be CamelCase strings with letters only (A–Z, a–z), with optional last name.`,
							`- No spaces, no punctuation, no digits.`,
							`Example: [{"first":"Twilight","last":"Sparkle"},{"first":"Rainbow","last":"Dash"},{"first":"Pinkie","last":"Pie"},{"first":"Applejack"}]`,
							`Return ONLY the JSON array.`,
						].join("\n"),
					},
				},
			],
			// modelPreferences are hints to the CLIENT. The client picks the model;
			// the server only expresses preferences (by name substring and priorities).
			modelPreferences: {
				hints: [{ name: "claude" }, { name: "gpt" }],
				speedPriority: 0.6,
				intelligencePriority: 0.6,
				costPriority: 0.2,
			},
			maxTokens: 800,
		});

		let raw = "";
		const c = sampling.content as unknown;
		if (Array.isArray(c)) {
			raw = c
				.filter(
					(b): b is { type: "text"; text: string } =>
						typeof b === "object" &&
						b !== null &&
						(b as { type?: unknown }).type === "text",
				)
				.map((b) => b.text)
				.join("");
		} else if (
			typeof c === "object" &&
			c !== null &&
			(c as { type?: unknown }).type === "text"
		) {
			raw = (c as { text: string }).text;
		}

		const fenced = raw.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
		if (fenced) {
			raw = fenced[1];
		}
		let ponies: { first: string; last?: string }[] = [];
		try {
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) throw new Error("not array");
			ponies = Array.from(
				new Set(
					parsed
						.map((item): { first: string; last?: string } | null => {
							if (
								typeof item === "object" &&
								item !== null &&
								typeof item.first === "string"
							) {
								const first = item.first.trim();
								const last = item.last ? item.last.trim() : undefined;
								if (/^[A-Za-z]+$/.test(first) && first.length >= 2) {
									return { first, last };
								}
							}
							return null;
						})
						.filter((p): p is { first: string; last?: string } => p !== null),
				),
			);
		} catch (err) {
			console.error("[pony-sampling] failed to parse sampled names:", err);
			const msg =
				"Could not reliably parse the pony data provided by the LLM. Please try again.";
			return {
				isError: true,
				content: [{ type: "text", text: msg }],
				structuredContent: { result: [], usedNames: [] },
			};
		}

		console.error(`[pony-sampling] parsed ${ponies.length} pony names`);

		const pwds = buildMany(count, { minLength, special }, ponies);

		return {
			content: [
				{ type: "text", text: JSON.stringify(pwds, null, 2) },
				{
					type: "text",
					text: `Created with ${ponies.length} sampled ponies.`,
				},
			],
			structuredContent: {
				result: pwds,
				usedNames: ponies
					.slice(0, 50)
					.map((p) => (p.last ? `${p.first}${p.last}` : p.first)),
			},
		};
	},
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[pony-sampling] listening on stdio");
