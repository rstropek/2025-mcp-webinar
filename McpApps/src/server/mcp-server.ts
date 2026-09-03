import { McpServer } from "@modelcontextprotocol/server";
import { ViewStore } from "./lib/view-store.js";
import { register as registerStep1 } from "./steps/step1-hello.js";
import { register as registerStep2 } from "./steps/step2-host-context.js";
import { register as registerStep3 } from "./steps/step3-call-tool.js";
import { register as registerStep4 } from "./steps/step4-talk-to-model.js";
import { register as registerStep5 } from "./steps/step5-live-polling.js";
import { register as registerStep6 } from "./steps/step6-fullscreen-csp.js";
import { register as registerStep7 } from "./steps/step7-tool-input.js";

/**
 * Builds a fresh server instance with every training step's tools and
 * resources registered.
 *
 * There is no long-lived server object: the 2026-07-28 revision is
 * stateless, so `createMcpHandler` (see `mcp-handler.ts`) calls this factory
 * once per HTTP request. Everything the server offers must therefore be
 * (re-)registered here on every call — that is cheap, since `registerTool`
 * / `registerResource` only attach handlers, they do no I/O.
 *
 * What must *not* live inside this factory is anything that should survive
 * across requests, such as step 5's process "uptime" or step 3's/step 6's
 * per-tool-call randomness source. Those live at module scope in their
 * respective `steps/*.ts` files instead, so they are initialized once when
 * the module is first imported (which happens once per server process, not
 * once per request) and then simply read from here.
 */
export function buildServer(): McpServer {
  const server = new McpServer({ name: "MCP Apps Training Demo (TypeScript)", version: "0.1.0" });

  // One ViewStore per server instance is enough: it does no I/O of its own
  // beyond the `readFile` inside `read()`, and its cache (only active in
  // production) is keyed by step name, not by server instance.
  const views = new ViewStore();

  registerStep1(server, views);
  registerStep2(server, views);
  registerStep3(server, views);
  registerStep4(server, views);
  registerStep5(server, views);
  registerStep6(server, views);
  registerStep7(server, views);

  return server;
}
