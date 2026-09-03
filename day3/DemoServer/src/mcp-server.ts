import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

/** Number of "thinking" steps the echo tool reports when `thinkHard` is true. */
const THINK_STEPS = 3;

/** Waits `ms` milliseconds, but returns early when the request is cancelled. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

/**
 * Builds a fresh server instance with the single demo tool.
 *
 * There is no long-lived server object anymore: the 2026-07-28 revision is
 * stateless, so `createMcpHandler` calls this factory once per HTTP request
 * (see `mcp-handler.ts`). Everything the server offers must therefore be
 * registered here, not somewhere outside.
 */
export function buildServer(): McpServer {
  const server = new McpServer({ name: "demo-mcp-server", version: "1.0.0" });

  server.registerTool(
    "echo-tool",
    {
      title: "Echo Tool",
      description: "A tool that echoes back the input it receives.",
      // Schemas are Standard Schema objects — a plain `z.object({...})`.
      inputSchema: z.object({
        message: z.string().describe("The message to echo back."),
        thinkHard: z
          .boolean()
          .describe("If true, the tool simulates thinking hard before responding. When in doubt, set this to false."),
      }),
      // `readOnlyHint` tells the host that calling this tool changes nothing,
      // so it may be called without asking the user for confirmation.
      annotations: { readOnlyHint: true },
    },
    async ({ message, thinkHard }, ctx) => {
      if (thinkHard) {
        // A client that wants progress updates puts a `progressToken` into the
        // request's `_meta`. Without one, the server MUST stay silent — there
        // would be nothing to correlate the notifications with.
        const progressToken = ctx.mcpReq._meta?.progressToken;

        for (let step = 1; step <= THINK_STEPS; step++) {
          await sleep(1000, ctx.mcpReq.signal);

          // The client hung up (closing the response stream is how the
          // 2026-07-28 revision expresses cancellation). Stop working.
          if (ctx.mcpReq.signal.aborted) {
            break;
          }

          if (progressToken !== undefined) {
            // THIS is what makes Streamable HTTP interesting: as soon as the
            // handler emits a message before its result, the response can no
            // longer be a single JSON object, so the SDK upgrades it to an SSE
            // stream. The progress events arrive while the tool is still
            // running; the result is the last event on the stream.
            // `progress` must strictly increase from notification to notification.
            await ctx.mcpReq.notify({
              method: "notifications/progress",
              params: {
                progressToken,
                progress: step,
                total: THINK_STEPS,
                message: `Thinking hard... (${step}/${THINK_STEPS})`,
              },
            });
          }
        }
      }

      return { content: [{ type: "text", text: `Echo: ${message}` }] };
    },
  );

  return server;
}
