import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

// The URL can be overridden so that the very same client can be pointed at
// both servers of this sample:
//   npm run start:client                                  -> SDK server, port 3000
//   npm run start:client -- http://127.0.0.1:3002/mcp     -> no-SDK server
const url = new URL(process.argv[2] ?? process.env.MCP_URL ?? "http://127.0.0.1:3000/mcp");

// Streamable HTTP has no persistent connection: the transport simply POSTs one
// JSON-RPC message per request to this single endpoint. It sends
// `Accept: application/json, text/event-stream`, so the server may answer
// either with one JSON object or with an SSE stream (notifications first, the
// result last).
const transport = new StreamableHTTPClientTransport(url);

// `versionNegotiation.mode: "auto"` first probes the server with a
// `server/discover` request. If the server answers, we connect on the modern
// (2026-07-28) era; if it answers with a legacy signal, the client transparently
// falls back to the legacy 2025-era `initialize` handshake. The default (no
// option) is legacy-only, without a probe.
//
// `capabilities.elicitation.form` tells the server that this client is able to
// ask its user a question. Servers check that before requesting input.
const client = new Client(
  { name: "example-client", version: "1.0.0" },
  {
    versionNegotiation: { mode: "auto" },
    capabilities: { elicitation: { form: {} } },
  },
);

// ONE handler serves both eras. On 2026-07-28 a server never sends us a
// request; it answers a tool call with `resultType: "input_required"` instead,
// and the client fulfils the embedded requests through this very handler
// before automatically retrying the original call (Multi Round-Trip Request).
// Against a 2025-era server the same handler answers a pushed
// `elicitation/create` request.
//
// A real client would show a form here. We answer with a fixed list so the
// sample stays non-interactive.
client.setRequestHandler("elicitation/create", async (request) => {
  if (request.params.mode === "url") {
    // URL-mode elicitation sends the user to a web page. Nothing to fill in.
    return { action: "accept" };
  }
  console.log(`>>> [elicitation handler] server asks: "${request.params.message}"`);
  console.log(">>> [elicitation handler] answering with: Rarity, Spike");
  return { action: "accept", content: { excludedPonies: "Rarity, Spike" } };
});

await client.connect(transport);

// An "era" is a behaviour family, not a version string: "legacy" covers
// 2024-10-07 … 2025-11-25, "modern" is 2026-07-28 and later.
console.log(`>>> Connected to ${url.href}`);
console.log(`>>> Negotiated protocol era: ${client.getProtocolEra()}`);

type TextContent = { type: "text"; text: string };

/**
 * The no-SDK server implements tools only. Rather than making this sample
 * branch on capabilities, every step is wrapped: a `-32601` (method not found)
 * or a missing tool is reported as a one-liner and the sample continues.
 */
async function step(title: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n>>> ${title}`);
  try {
    await fn();
  } catch (error) {
    console.log(`    not available on this server: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// `listTools()` without a cursor aggregates all pages.
await step("List of tools:", async () => {
  const { tools } = await client.listTools();
  for (const tool of tools) {
    console.log(`Tool: ${tool.name} - ${tool.description}`);
  }
});

await step("List of prompts:", async () => {
  const { prompts } = await client.listPrompts();
  for (const prompt of prompts) {
    console.log(`Prompt: ${prompt.name} - ${prompt.description}`);
  }
});

await step("List of resources:", async () => {
  const { resources } = await client.listResources();
  for (const resource of resources) {
    console.log(`Resource: ${resource.name} (${resource.uri}) - ${resource.description}`);
  }
});

await step("Calling pony_password:", async () => {
  const result = await client.callTool({
    name: "pony_password",
    arguments: { minLength: 16, special: true },
  });
  const content = result.content as TextContent[];
  console.log(`Password generated: ${content[0].text}`);
});

await step("Calling pony_password_batch:", async () => {
  const result = await client.callTool({
    name: "pony_password_batch",
    arguments: { count: 3, minLength: 20, special: false },
  });
  // The batch tool declares an `outputSchema`, so the array of passwords is
  // delivered in `structuredContent`. The `content` text is just a
  // human-readable numbered list, not JSON.
  const { result: passwords } = result.structuredContent as { result: string[] };
  passwords.forEach((pwd, index) => {
    console.log(`  ${index + 1}. ${pwd}`);
  });
});

await step("Calling pony_password_with_preferences (multi round-trip):", async () => {
  // This single call is really two requests on the wire: the server answers
  // the first one with `input_required`, the client runs the elicitation
  // handler above and retries the call with the collected answer. All of that
  // happens inside `callTool()`, which still returns the plain tool result.
  const result = await client.callTool({
    name: "pony_password_with_preferences",
    arguments: { minLength: 24, special: true },
  });
  const content = result.content as TextContent[];
  console.log(`Password generated: ${content[0].text}`);
});

await step("Getting the make-pony-password prompt:", async () => {
  const result = await client.getPrompt({
    name: "make-pony-password",
    arguments: { minLength: "16", special: "true" },
  });
  result.messages.forEach((msg, index) => {
    const c = msg.content as TextContent;
    console.log(`  Message ${index + 1}: ${c.text}`);
  });
});

await step("Reading the pony://characters.txt resource:", async () => {
  const result = await client.readResource({ uri: "pony://characters.txt" });
  const first = result.contents[0] as { text: string };
  console.log(`  ${first.text.split("\n").slice(0, 3).join(", ")}, ...`);
});

// `close()` tears down the transport. Over Streamable HTTP there is no
// connection to end, but any in-flight request is aborted.
console.log("\n>>> Disconnecting...");
await client.close();
