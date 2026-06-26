import cors from "cors";
import type { Request, Response } from "express";
import express from "express";
import { buildPassword } from "./lib/password.js";
import { loadPoniesFromFile } from "./lib/ponies.js";

// This server intentionally ignores session management and the SSE stream
// on GET /mcp — just enough protocol to serve one tool over plain HTTP.
// For a spec-compliant Streamable-HTTP server, see ./lib/streamable-http.ts.

type JR = {
	jsonrpc: "2.0";
	id?: number | string | null;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: unknown;
};

const app = express();
app.use(
	cors({
		origin: "*",
		methods: ["GET", "POST", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Mcp-Session-Id", "Mcp-Protocol-Version"],
		exposedHeaders: ["Mcp-Session-Id"],
	}),
);
app.use(express.json());

const SUPPORTED_PROTOCOL_VERSIONS = [
	"2025-11-25",
	"2025-06-18",
	"2025-03-26",
	"2024-11-05",
];

function handleInitialize(id: JR["id"], params: unknown) {
	const requested = (params as { protocolVersion?: string } | undefined)
		?.protocolVersion;
	const protocolVersion =
		requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
			? requested
			: SUPPORTED_PROTOCOL_VERSIONS[0];
	const result = {
		protocolVersion,
		serverInfo: { name: "pony-no-sdk-streamable", version: "0.1.0" },
		// We don't emit list_changed notifications, so don't claim it.
		capabilities: { tools: {} },
	};
	return { jsonrpc: "2.0" as const, id, result };
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
	return { jsonrpc: "2.0" as const, id, result };
}

function handleToolsCall(id: JR["id"], params: unknown) {
	const { name, arguments: args } = (params ?? {}) as {
		name?: string;
		arguments?: Record<string, unknown>;
	};
	if (name !== "pony_password") {
		return {
			jsonrpc: "2.0" as const,
			id,
			error: { code: -32601, message: "Unknown tool" },
		};
	}
	const minLength = Number(args?.minLength ?? 16);
	const special = Boolean(args?.special ?? false);
	const ponies = loadPoniesFromFile();
	const pwd = buildPassword({ minLength, special }, ponies);
	return {
		jsonrpc: "2.0" as const,
		id,
		result: { content: [{ type: "text", text: pwd }] },
	};
}

// 405 is an HTTP-level concern, not a JSON-RPC one. Return a plain text body
// rather than a JSON-RPC error envelope.
export function mcpMethodNotAllowedHandler(_req: Request, res: Response) {
	res.status(405).type("text/plain").send("Method Not Allowed");
}

app.post("/mcp", (req, res) => {
	const msg: JR = req.body;
	console.log(
		`[pony-no-sdk-streamable] <- ${msg.method ?? "<response>"} (id=${msg.id ?? "none"})`,
	);

	// Notifications carry no `id`. We MUST NOT respond, not even with an error.
	if (msg.id === undefined) {
		res.status(202).end();
		return;
	}

	if (msg.method === "initialize") {
		res.json(handleInitialize(msg.id, msg.params));
		return;
	}

	let response: JR;
	try {
		if (msg.method === "tools/list") {
			response = handleToolsList(msg.id);
		} else if (msg.method === "tools/call") {
			response = handleToolsCall(msg.id, msg.params);
		} else {
			response = {
				jsonrpc: "2.0" as const,
				id: msg.id,
				error: { code: -32601, message: `Unsupported method: ${msg.method}` },
			};
		}
	} catch (error) {
		console.error("[pony-no-sdk-streamable] internal error:", error);
		response = {
			jsonrpc: "2.0" as const,
			id: msg.id,
			error: { code: -32603, message: "Internal error" },
		};
	}

	res.json(response);
});

app.get("/mcp", mcpMethodNotAllowedHandler);
app.delete("/mcp", mcpMethodNotAllowedHandler);

app.get("/health", (_req, res) => {
	res.json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		serverName: "pony-no-sdk-streamable",
		serverVersion: "0.1.0",
	});
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
	console.error(
		`MCP server (pony-no-sdk-streamable) running at http://127.0.0.1:${PORT}/mcp`,
	);
	console.error(`Health check: http://127.0.0.1:${PORT}/health`);
});
