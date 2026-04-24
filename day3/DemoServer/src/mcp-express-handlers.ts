import { randomUUID } from "node:crypto";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response } from "express";
import { getServer } from "./mcp-server.js";

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// See also JsonRPC specification for error codes
type JsonRpcError = {
	code: number;
	message: string;
};
const NO_VALID_SESSION_ID_ERROR: JsonRpcError = {
	code: -32000,
	message: "Bad Request: No valid session ID provided",
};
const INTERNAL_SERVER_ERROR: JsonRpcError = {
	code: -32603,
	message: "Internal server error",
};
function getJsonRpcError(error: JsonRpcError) {
	return {
		jsonrpc: "2.0",
		error: error,
		id: null,
	};
}

export async function mcpPostHandler(req: Request, res: Response) {
	// For details about session handling, see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#session-management
	let sessionId: string | undefined;
	if (req.headers?.["mcp-session-id"]) {
		sessionId = req.headers["mcp-session-id"] as string;
	}

	if (sessionId) {
		console.log(`Received MCP request for session: ${sessionId}`);
	} else {
		console.log("Request body:", req.body);
	}

	try {
		let transport: StreamableHTTPServerTransport;
		const existing = sessionId ? transports[sessionId] : undefined;
		if (existing) {
			transport = existing;
		} else if (!sessionId && isInitializeRequest(req.body)) {
			// Resumability: InMemoryEventStore buffers server→client events per
			// session. If the SSE stream drops, the client can reconnect with
			// Last-Event-ID and replay missed notifications. A production server
			// would persist this store (Redis, DB) so replays survive restarts.
			const eventStore = new InMemoryEventStore();
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(), // undefined => stateless server
				eventStore,
				// Register in the map only once the transport has a session ID,
				// so we never store a half-initialized transport.
				onsessioninitialized: (sid) => {
					console.log(`Session initialized with ID: ${sid}`);
					transports[sid] = transport;
				},
			});

			transport.onclose = () => {
				const sid = transport.sessionId;
				if (sid && transports[sid]) {
					console.log(`Transport closed for session ${sid}`);
					delete transports[sid];
				}
			};

			// One McpServer instance per session — keeps per-client state isolated.
			// Connect BEFORE handleRequest so responses can flow back out.
			const server = getServer();
			await server.connect(transport);

			await transport.handleRequest(req, res, req.body);
			return; // Already handled
		} else {
			// Invalid request - no session ID or not initialization request
			res.status(400).json(getJsonRpcError(NO_VALID_SESSION_ID_ERROR));
			return;
		}

		// Handle the request with existing transport - no need to reconnect
		// The existing transport is already connected to the server
		await transport.handleRequest(req, res, req.body);
	} catch (error) {
		console.error("Error handling MCP request:", error);
		if (!res.headersSent) {
			res.status(500).json(getJsonRpcError(INTERNAL_SERVER_ERROR));
		}
	}
}

export async function mcpGetHandler(req: Request, res: Response) {
	const sessionId = req.headers["mcp-session-id"] as string | undefined;
	const transport = sessionId ? transports[sessionId] : undefined;
	if (!transport) {
		res.status(400).send("Invalid or missing session ID");
		return;
	}
	await transport.handleRequest(req, res);
}

// DELETE /mcp terminates a session (spec 2025-06-18). Delegates to the
// transport, which triggers the onclose handler registered above.
export async function mcpDeleteHandler(req: Request, res: Response) {
	const sessionId = req.headers["mcp-session-id"] as string | undefined;
	const transport = sessionId ? transports[sessionId] : undefined;
	if (!transport) {
		res.status(400).send("Invalid or missing session ID");
		return;
	}
	await transport.handleRequest(req, res);
}
