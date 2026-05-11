import * as readline from "node:readline";
import { buildPassword } from "./lib/password.js";
import { loadPoniesFromFile } from "./lib/ponies.js";

type JR = {
	jsonrpc: "2.0";
	id?: number | string | null;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: unknown;
};

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	terminal: false,
});
const send = (obj: JR) => process.stdout.write(`${JSON.stringify(obj)}\n`);

// Versions this server claims to understand. We only implement initialize +
// tools/list + tools/call, which is wire-compatible with all of these.
const SUPPORTED_PROTOCOL_VERSIONS = [
	"2025-11-25",
	"2025-06-18",
	"2025-03-26",
	"2024-11-05",
];

function handleInitialize(id: JR["id"], params: unknown) {
	// Spec says the server MUST reply with a version both sides support; if it
	// can, it should echo the client's requested version.
	const requested = (params as { protocolVersion?: string } | undefined)
		?.protocolVersion;
	const protocolVersion =
		requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
			? requested
			: SUPPORTED_PROTOCOL_VERSIONS[0];
	const result = {
		protocolVersion,
		serverInfo: { name: "pony-no-sdk", version: "0.1.0" },
		// We don't actually emit list_changed notifications, so don't claim it.
		capabilities: { tools: {} },
	};
	send({ jsonrpc: "2.0", id, result });
}

function handleToolsList(id: JR["id"]) {
	const result = {
		tools: [
			{
				name: "pony_password",
				description:
					"Generates a password from My Little Pony character names.",
				inputSchema: {
					type: "object",
					properties: {
						minLength: { type: "number", minimum: 1, default: 16 },
						special: { type: "boolean", default: false },
					},
					additionalProperties: false,
				},
			},
		],
	};
	send({ jsonrpc: "2.0", id, result });
}

function handleToolsCall(id: JR["id"], params: unknown) {
	const { name, arguments: args } = (params ?? {}) as {
		name?: string;
		arguments?: Record<string, unknown>;
	};
	if (name !== "pony_password") {
		send({
			jsonrpc: "2.0",
			id,
			error: { code: -32601, message: "Unknown tool" },
		});
		return;
	}
	const minLength = Number(args?.minLength ?? 16);
	const special = Boolean(args?.special ?? false);
	const ponies = loadPoniesFromFile();
	const pwd = buildPassword({ minLength, special }, ponies);
	send({
		jsonrpc: "2.0",
		id,
		result: { content: [{ type: "text", text: pwd }] },
	});
}

rl.on("line", (line: string) => {
	if (!line.trim()) return;
	let msg: JR;
	try {
		msg = JSON.parse(line);
	} catch {
		console.error("[pony-no-sdk] parse error:", line);
		// Per JSON-RPC 2.0, parse errors carry id: null (not 0).
		return send({
			jsonrpc: "2.0",
			id: null,
			error: { code: -32700, message: "Parse error" },
		});
	}

	console.error(
		`[pony-no-sdk] <- ${msg.method ?? "<response>"} (id=${msg.id ?? "none"})`,
	);

	// Notifications carry no `id`. Per JSON-RPC we MUST NOT respond to them —
	// not even with an error. The most common one is `notifications/initialized`.
	if (msg.id === undefined) return;

	if (msg.method === "initialize") return handleInitialize(msg.id, msg.params);
	if (msg.method === "tools/list") return handleToolsList(msg.id);
	if (msg.method === "tools/call") return handleToolsCall(msg.id, msg.params);

	send({
		jsonrpc: "2.0",
		id: msg.id,
		error: { code: -32601, message: `Unsupported method: ${msg.method}` },
	});
});

console.error("[pony-no-sdk] listening on stdio");
