import * as readline from "node:readline";
import { buildPassword } from "./lib/password.js";
import { loadPoniesFromFile } from "./lib/ponies.js";

// ---------------------------------------------------------------------------
// A minimal MCP server without any SDK: plain JSON-RPC 2.0 over stdio.
//
// MCP currently has TWO eras on the wire, and this server speaks both:
//
//   LEGACY (2025-11-25 and older) -- stateful.
//     The client opens with an `initialize` request, we answer with the
//     negotiated protocol version, then the client sends the
//     `notifications/initialized` notification. Everything after that is a
//     plain request; the connection carries the negotiated state.
//     What most hosts (e.g. VS Code) speak.
//
//   MODERN (2026-07-28) -- stateless.
//     No handshake at all. EVERY request repeats its protocol version and the
//     client capabilities in `params._meta`, so the server never has to
//     remember anything between requests. New RPC `server/discover` lets a
//     client ask what we support up front. Results must carry a `resultType`
//     and should carry our identity in `result._meta`.
//
// How we tell them apart: we look at `params._meta` of each incoming request.
// If it names a protocol version, the request is modern; if not, it is legacy.
// That is exactly the rule the official SDK uses ("envelope claim").
// ---------------------------------------------------------------------------

type JR = {
  jsonrpc: "2.0";
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});
const send = (obj: JR) => process.stdout.write(`${JSON.stringify(obj)}\n`);

const SERVER_INFO = { name: "pony-no-sdk", version: "0.1.0" };

// Reserved `_meta` keys of the modern era. The `io.modelcontextprotocol/`
// prefix is reserved for the spec itself.
const PROTOCOL_VERSION_KEY = "io.modelcontextprotocol/protocolVersion";
const SERVER_INFO_KEY = "io.modelcontextprotocol/serverInfo";

// The one stateless revision we implement...
const MODERN_PROTOCOL_VERSION = "2026-07-28";
// ...and the handshake-based ones we answer `initialize` for.
const LEGACY_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SUPPORTED_PROTOCOL_VERSIONS = [MODERN_PROTOCOL_VERSION, ...LEGACY_PROTOCOL_VERSIONS];

/** Reads `params._meta["io.modelcontextprotocol/protocolVersion"]`, if any. */
function requestedProtocolVersion(params: unknown): string | undefined {
  const meta = (params as { _meta?: Record<string, unknown> } | undefined)?._meta;
  const version = meta?.[PROTOCOL_VERSION_KEY];
  return typeof version === "string" ? version : undefined;
}

/**
 * Sends a JSON-RPC result. On the modern era we add the two envelope fields
 * the 2026-07-28 spec requires/recommends on every result; on the legacy era
 * we leave the result untouched (that is what the official SDK does too --
 * its legacy codec strips `resultType` and the serverInfo `_meta`).
 */
function sendResult(id: JR["id"], result: object, modern: boolean) {
  send({
    jsonrpc: "2.0",
    id,
    result: modern
      ? {
          resultType: "complete", // "the request completed, this is the final content"
          ...result,
          _meta: { [SERVER_INFO_KEY]: SERVER_INFO },
        }
      : result,
  });
}

// --- modern: server/discover ------------------------------------------------
// The stateless replacement for `initialize`. A dual-era client sends this
// first as a probe: a proper result means "modern server", any other error
// means "fall back to the initialize handshake". It is a cacheable result, so
// it carries the ttlMs/cacheScope hints.
function handleDiscover(id: JR["id"]) {
  sendResult(
    id,
    {
      supportedVersions: [MODERN_PROTOCOL_VERSION],
      capabilities: { tools: {} },
      instructions: "Generates passwords from My Little Pony character names.",
      ttlMs: 3_600_000,
      cacheScope: "public",
    },
    true,
  );
}

// --- legacy: initialize -----------------------------------------------------
// The legacy handshake. We must answer with a version both sides support and
// should echo the client's request if we can. Note that 2026-07-28 is NOT a
// candidate here: a client that says `initialize` is a legacy client.
function handleInitialize(id: JR["id"], params: unknown) {
  const requested = (params as { protocolVersion?: string } | undefined)?.protocolVersion;
  const protocolVersion = requested && LEGACY_PROTOCOL_VERSIONS.includes(requested) ? requested : LEGACY_PROTOCOL_VERSIONS[0];
  sendResult(
    id,
    {
      protocolVersion,
      serverInfo: SERVER_INFO,
      // We don't actually emit list_changed notifications, so don't claim it.
      capabilities: { tools: {} },
    },
    false,
  );
}

function handleToolsList(id: JR["id"], modern: boolean) {
  sendResult(
    id,
    {
      // Tools should be listed in a stable order so clients can cache them.
      tools: [
        {
          name: "pony_password",
          description: "Generates a password from My Little Pony character names.",
          inputSchema: {
            type: "object",
            properties: {
              minLength: { type: "number", minimum: 1, default: 16 },
              special: { type: "boolean", default: false },
            },
            additionalProperties: false,
          },
        },
      ],
      // Modern era: tools/list is cacheable and MUST say for how long
      // ("public" = same answer for every user, so proxies may share it).
      ...(modern ? { ttlMs: 3_600_000, cacheScope: "public" } : {}),
    },
    modern,
  );
}

function handleToolsCall(id: JR["id"], params: unknown, modern: boolean) {
  const { name, arguments: args } = (params ?? {}) as {
    name?: string;
    arguments?: Record<string, unknown>;
  };
  if (name !== "pony_password") {
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Unknown tool" },
    });
    return;
  }
  const minLength = Number(args?.minLength ?? 16);
  const special = Boolean(args?.special ?? false);
  const ponies = loadPoniesFromFile();
  const pwd = buildPassword({ minLength, special }, ponies);
  sendResult(id, { content: [{ type: "text", text: pwd }] }, modern);
}

rl.on("line", (line: string) => {
  if (!line.trim()) return;
  let msg: JR;
  try {
    msg = JSON.parse(line);
  } catch {
    console.error("[pony-no-sdk] parse error:", line);
    // Per JSON-RPC 2.0, parse errors carry id: null (not 0).
    return send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
  }

  console.error(`[pony-no-sdk] <- ${msg.method ?? "<response>"} (id=${msg.id ?? "none"})`);

  // Notifications carry no `id`. Per JSON-RPC we MUST NOT respond to them --
  // not even with an error. The most common one is `notifications/initialized`.
  if (msg.id === undefined) return;

  // Era detection: does this request bring its own protocol version along?
  const requested = requestedProtocolVersion(msg.params);
  const modern = requested === MODERN_PROTOCOL_VERSION;

  // A version we don't implement gets the spec's dedicated error, which tells
  // the client what we *do* support so it can retry with a matching version.
  if (requested !== undefined && !modern) {
    return send({
      jsonrpc: "2.0",
      id: msg.id,
      error: {
        code: -32022, // UnsupportedProtocolVersion
        message: `Unsupported protocol version: ${requested}`,
        data: { supported: SUPPORTED_PROTOCOL_VERSIONS, requested },
      },
    });
  }

  // server/discover is modern-only; initialize is legacy-only.
  if (msg.method === "server/discover") return handleDiscover(msg.id);
  if (msg.method === "initialize") return handleInitialize(msg.id, msg.params);
  // `ping` is not part of 2026-07-28, but legacy clients send it.
  if (msg.method === "ping") return sendResult(msg.id, {}, modern);
  // These two look identical on both eras -- only the envelope differs.
  if (msg.method === "tools/list") return handleToolsList(msg.id, modern);
  if (msg.method === "tools/call") return handleToolsCall(msg.id, msg.params, modern);

  send({
    jsonrpc: "2.0",
    id: msg.id,
    error: { code: -32601, message: `Unsupported method: ${msg.method}` },
  });
});

console.error("[pony-no-sdk] listening on stdio");
