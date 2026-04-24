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
		// Note: In CORS, "exposed headers" are the HTTP response headers that the browser
		// is allowed to make visible to JavaScript code running in the web page.
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
