import { completable, McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { buildMany, buildPassword } from "./lib/password.js";
import { loadPoniesFromFile, toOnePerLine } from "./lib/ponies.js";

// Read the pony list once at startup. The file never changes during the
// process's lifetime, so re-reading on every tool call would just be noise.
const ponies = loadPoniesFromFile();

/**
 * The SDK serves a *factory*, not a single connected server object. `serveStdio`
 * calls this function once per connection (plus once for a throw-away
 * `server/discover` probe) and pins the returned instance to that connection.
 * Registering everything in one place therefore serves BOTH protocol eras:
 * the 2026-07-28 revision and the legacy 2025-era `initialize` handshake.
 */
function buildServer(): McpServer {
  const server = new McpServer({ name: "pony-sdk", version: "0.1.0" });

  // NOTE: registration order is the order `tools/list` reports. The 2026-07-28
  // revision asks servers for a deterministic listing order, so we simply keep
  // the registrations in a fixed, hand-written order below.

  /** Tool 1: single password */
  server.registerTool(
    "pony_password",
    {
      title: "Generate a password",
      description: "Builds a password from My Little Pony character names.",
      // Schemas are Standard Schema objects such as `z.object({...})`.
      inputSchema: z.object({
        minLength: z.number().int().min(1).default(16),
        special: z.boolean().default(false),
      }),
      outputSchema: z.object({ result: z.string() }),
    },
    ({ minLength, special }) => {
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
      inputSchema: z.object({
        count: z.number().int().min(1).max(50).default(5),
        minLength: z.number().int().min(1).default(16),
        special: z.boolean().default(false),
      }),
      outputSchema: z.object({ result: z.array(z.string()) }),
    },
    ({ count, minLength, special }) => {
      const pwds = buildMany(count, { minLength, special }, ponies);
      // Human-readable text fallback (one per line) for hosts that don't read
      // structuredContent. The typed array still flows via structuredContent.
      return {
        content: [
          {
            type: "text",
            text: pwds.map((p, i) => `${i + 1}. ${p}`).join("\n"),
          },
        ],
        structuredContent: { result: pwds },
      };
    },
  );

  server.registerPrompt(
    "make-pony-password",
    {
      title: "Create pony password",
      description: "Prompt for generating a password from MLP character names",
      // `completable()` wraps a single argument to provide autocompletion values.
      argsSchema: z.object({
        minLength: completable(z.string(), (val) =>
          [8, 12, 16, 20, 24, 32].filter((n) => String(n).startsWith(String(val ?? ""))).map(String),
        ),
        special: completable(z.string(), (val) => {
          const opts = ["true", "false"];
          return opts.filter((s) => s.startsWith(String(val ?? "")));
        }),
      }),
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

  // `registerResource` takes a name, a fixed URI, metadata and a read callback.
  server.registerResource(
    "pony-characters-text",
    "pony://characters.txt",
    {
      title: "MLP characters (text)",
      description: "One name per line from data/ponies.txt (CamelCase, no spaces in last name).",
      mimeType: "text/plain; charset=utf-8",
    },
    (uri) => {
      const text = toOnePerLine(ponies);
      return { contents: [{ uri: uri.href, text }] };
    },
  );

  return server;
}

// `serveStdio(factory)` owns the stdio transport, decides the era of every incoming connection and keeps serving
// legacy 2025-era clients by default (pass `{ legacy: "reject" }` to refuse
// them). It returns a handle whose `close()` tears everything down again.
const handle = serveStdio(buildServer);

process.on("SIGINT", () => {
  void handle.close();
});

// Remember: stdout is the JSON-RPC channel. Log to stderr only.
console.error("[pony-sdk] listening on stdio");
