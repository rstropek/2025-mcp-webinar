import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { CallToolResult, InputRequiredResult } from "@modelcontextprotocol/server";
import {
  acceptedContent,
  completable,
  createMcpHandler,
  inputRequired,
  inputResponse,
  McpServer,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { buildMany, buildPassword } from "./lib/password.js";
import { loadPoniesFromFile, toOnePerLine } from "./lib/ponies.js";

const PORT = 3000;

// Read the pony list once at startup. The file never changes during the
// process's lifetime, so re-reading on every tool call would just be noise.
const ponies = loadPoniesFromFile();

/**
 * The SDK serves a *factory*, not a single connected server object. Over
 * Streamable HTTP `createMcpHandler` calls this function once per HTTP
 * request and throws the instance away again afterwards — the 2026-07-28
 * revision is stateless, so there is nothing to keep between requests (which
 * is also what makes such a server horizontally scalable: any replica can
 * answer any request). Registering everything in one place therefore serves
 * BOTH protocol eras: the 2026-07-28 revision and the legacy 2025-era
 * `initialize` handshake.
 */
function buildServer(): McpServer {
  const server = new McpServer({ name: "pony-sdk-streamable", version: "0.1.0" });

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

  /**
   * Tool 3: a tool that needs input from the *user*, not from the model.
   *
   * On 2026-07-28 a server never sends a request to its client — the wire is
   * one POST in, one response out, and the server holds no connection it
   * could push on. Asking the user something is therefore a Multi Round-Trip
   * Request (MRTR): the tool answers with `resultType: "input_required"` plus
   * the questions it wants answered, the client collects the answers, and the
   * client RETRIES the very same `tools/call` — this time with
   * `inputResponses` attached. The handler runs a second time and finds the
   * answer in `ctx.mcpReq.inputResponses`.
   *
   * The handler is written once for both eras: for a 2025-era client the
   * SDK's legacy shim turns this same `inputRequired(...)` return into a
   * push-based `elicitation/create` request on the open connection, waits for
   * the answer and re-enters the handler in-process. So one handler serves
   * modern MRTR clients and legacy elicitation clients alike.
   *
   * (`ctx.mcpReq.elicitInput()` still exists for legacy-only servers, but it
   * throws on a 2026-07-28 request — there is no channel to push on.)
   */
  server.registerTool(
    "pony_password_with_preferences",
    {
      title: "Generate a password (with preferences)",
      description: "Builds a password from My Little Pony character names. The user can exclude ponies they dislike.",
      inputSchema: z.object({
        minLength: z.number().int().min(1).default(16),
        special: z.boolean().default(false),
      }),
      outputSchema: z.object({ result: z.string() }),
    },
    async ({ minLength, special }, ctx): Promise<CallToolResult | InputRequiredResult> => {
      // `inputResponse` gives the discriminated view: "missing" means we are
      // in the FIRST round (nothing was asked yet), everything else means the
      // client came back with an answer (or a refusal).
      const answer = inputResponse(ctx.mcpReq.inputResponses, "excludedPonies");

      if (answer.kind === "missing") {
        // Round 1: ask. `inputRequired.elicit` builds one embedded
        // `elicitation/create` request; the key ("excludedPonies") is how we
        // recognise the answer when the client retries.
        return inputRequired({
          inputRequests: {
            excludedPonies: inputRequired.elicit({
              message: "Which ponies to exclude?",
              requestedSchema: {
                type: "object",
                properties: {
                  excludedPonies: {
                    type: "string",
                    title: "Excluded Ponies",
                    description: "List the names of ponies to exclude, separated by commas.",
                  },
                },
                required: ["excludedPonies"],
              },
            }),
          },
        });
      }

      // Round 2: the answer is client-supplied and therefore untrusted, so
      // `acceptedContent` is given the same schema again to validate it. It
      // returns `undefined` for a declined/cancelled elicitation as well as
      // for content that fails validation -- in both cases we simply carry on
      // with the full pool instead of failing the call.
      const content = acceptedContent(ctx.mcpReq.inputResponses, "excludedPonies", z.object({ excludedPonies: z.string() }));

      let pool = ponies;
      if (content !== undefined) {
        const excluded = new Set(
          content.excludedPonies
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
        );
        console.log("[pony-sdk-streamable] excluding ponies:", [...excluded]);
        pool = pool.filter(
          (pony) => !excluded.has(pony.first.toLowerCase()) && (!pony.last || !excluded.has(pony.last.toLowerCase())),
        );
      } else {
        console.log(`[pony-sdk-streamable] no usable answer (${answer.kind}); using all ponies`);
      }

      const output = buildPassword({ minLength, special }, pool);
      return {
        content: [{ type: "text", text: output }],
        structuredContent: { result: output },
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

/**
 * `createMcpHandler(factory)` is the HTTP counterpart of `serveStdio(factory)`:
 * it turns the factory into a single web-standard `fetch(Request) => Response`
 * handler that decides the era of every incoming POST on its own.
 *
 * - `legacy: "stateless"` (the default) keeps serving 2025-era clients — each
 *   legacy request is answered from a fresh instance too, and GET/DELETE (the
 *   2025 session operations) are answered with 405. `legacy: "reject"` would
 *   make the endpoint 2026-07-28-only.
 * - `responseMode: "auto"` (the default) answers with a plain JSON body and
 *   only upgrades the response to an SSE stream when the handler emits
 *   something before its result (a progress notification, for example). That
 *   is why a simple `tools/call` here comes back as `application/json`.
 */
const handler = createMcpHandler(buildServer, { legacy: "stateless", responseMode: "auto" });

// `createMcpExpressApp()` is a normal Express app with the two things every
// local MCP endpoint needs already wired up: `express.json()` and DNS-rebinding
// protection (Host and Origin header validation against localhost). A browser
// page on evil.example.com therefore cannot talk to this server.
const app = createMcpExpressApp();
const mcp = toNodeHandler(handler);

// ONE endpoint, and `app.all` because the handler answers every method itself:
// POST carries the JSON-RPC traffic, GET and DELETE get a 405 (the standalone
// SSE stream and session termination of the 2025 revision are gone). `req.body`
// is passed along so the already-parsed JSON is not read from the stream twice.
app.all("/mcp", (req, res) => void mcp(req, res, req.body));

app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    serverName: "pony-sdk-streamable",
    serverVersion: "0.1.0",
  });
});

// Bind to the loopback interface only: a local MCP server has no authentication,
// so it must not be reachable from the network.
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[pony-sdk-streamable] listening on http://127.0.0.1:${PORT}/mcp`);
  console.log(`[pony-sdk-streamable] health check: http://127.0.0.1:${PORT}/health`);
});

process.on("SIGINT", async () => {
  // Aborts in-flight exchanges and closes their per-request server instances.
  await handler.close();
  process.exit(0);
});
