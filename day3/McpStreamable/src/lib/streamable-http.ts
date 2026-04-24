import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import cors from "cors";
import express from "express";

// Minimal Streamable-HTTP harness for teaching. For a production-quality
// version with resumability (InMemoryEventStore) and richer error handling,
// see day3/DemoServer/src/mcp-express-handlers.ts.
export function createStreamableHTTPServer(
	server: McpServer,
	serverName: string,
	serverVersion: string,
	port: number,
): void {
	const app = express();
	app.use(
		cors({
			origin: "*",
			exposedHeaders: ["Mcp-Session-Id"],
		}),
	);
	app.use(express.json());

	const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

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
					onsessioninitialized: (sid) => {
						transports[sid] = transport;
						res.setHeader("mcp-session-id", sid);
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

			await transport.handleRequest(req, res, req.body);
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
		await transport.handleRequest(req, res);
	};

	// GET = server→client SSE stream, DELETE = session termination
	app.get("/mcp", handleSessionRequest);
	app.delete("/mcp", handleSessionRequest);

	app.get("/health", (_req, res) => {
		res.json({
			status: "healthy",
			timestamp: new Date().toISOString(),
			activeSessions: Object.keys(transports).length,
			serverName,
			serverVersion,
		});
	});

	const PORT = process.env.PORT || port;
	app.listen(PORT, () => {
		console.error(
			`MCP server (${serverName}) running at http://127.0.0.1:${PORT}/mcp`,
		);
		console.error(`Health check: http://127.0.0.1:${PORT}/health`);
	});
}
