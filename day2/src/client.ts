import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const transport = new StdioClientTransport({
  command: "node",
  args: ["./dist/server-sdk.js"],
});

// `versionNegotiation.mode: "auto"` first probes the server with a
// `server/discover` request. If the server answers, we connect on the modern
// (2026-07-28) era; if it stays silent or errors out, the client transparently
// falls back to the legacy 2025-era `initialize` handshake. The default (no
// option) is legacy-only, without a probe.
const client = new Client({ name: "example-client", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
await client.connect(transport);

// An "era" is a behaviour family, not a version string: "legacy" covers
// 2024-10-07 … 2025-11-25, "modern" is 2026-07-28 and later.
console.log(`>>> Negotiated protocol era: ${client.getProtocolEra()}`);

console.log(">>> List of tools:");

// `listTools()` without a cursor aggregates all pages.
const tools = await client.listTools();
for (const tool of tools.tools) {
  console.log(`Tool: ${tool.name} - ${tool.description}`);
}

// `close()` tears down the transport and terminates the spawned child process.
await client.close();
