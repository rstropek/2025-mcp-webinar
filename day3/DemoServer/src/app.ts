import cors from "cors";
import express from "express";
import {
	mcpDeleteHandler,
	mcpGetHandler,
	mcpPostHandler,
} from "./mcp-express-handlers.js";

const app = express();
app.use(express.json());
app.use(
	cors({
		origin: "*",
		methods: ["GET", "POST", "DELETE", "OPTIONS"],
		// `allowedHeaders` lists the headers the browser is permitted to SEND
		// in cross-origin requests. Without `Mcp-Session-Id` and
		// `Mcp-Protocol-Version` here, browser-based MCP clients fail at
		// preflight. (curl is unaffected — it skips CORS.)
		allowedHeaders: [
			"Content-Type",
			"Mcp-Session-Id",
			"Mcp-Protocol-Version",
		],
		// `exposedHeaders` lists the headers the browser is permitted to READ
		// off the response — needed so clients can pick up the session id from
		// the initialize response.
		exposedHeaders: ["Mcp-Session-Id"],
	}),
);

app.get("/ping", (_req, res) => res.json({ message: "pong" }));

// MCP spec (2025-06-18): POST sends JSON-RPC, GET opens the SSE stream,
// DELETE terminates the session.
app.post("/mcp", mcpPostHandler);
app.get("/mcp", mcpGetHandler);
app.delete("/mcp", mcpDeleteHandler);

const PORT = process.env.PORT || 3000;
const httpServer = app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
httpServer.on("error", (error) => {
	console.error(`Error starting server: ${error}`);
	process.exit(1);
});

process.on("SIGINT", () => {
	console.log("Shutting down server...");
	// Note: in-flight streaming sessions are dropped. A production server
	// would iterate active transports and close them gracefully first.
	httpServer.close(() => process.exit(0));
});
