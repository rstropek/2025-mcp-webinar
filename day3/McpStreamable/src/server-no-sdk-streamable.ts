import express, { type Request, type Response } from "express";
import { buildPassword } from "./lib/password.js";
import { loadPoniesFromFile } from "./lib/ponies.js";

// ---------------------------------------------------------------------------
// A minimal MCP server without any SDK: plain JSON-RPC 2.0 over Streamable
// HTTP. **Do not write a production server like this** -- it exists so the
// wire format is visible without a library in the way.
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
//
// What Streamable HTTP adds on top of the stdio version of this server:
//
//   * ONE endpoint (`/mcp`), and it accepts POST only. One JSON-RPC message
//     per POST -- there is no long-lived pipe any more, so the request/response
//     pairing is the HTTP request/response pairing.
//   * Sessions (`Mcp-Session-Id`), the standalone GET SSE stream, DELETE
//     session termination and SSE resumability (`Last-Event-ID`) were REMOVED
//     in 2026-07-28. A stateless server has nothing to put in a session, so
//     GET and DELETE are answered with 405 and a session id header is ignored.
//   * Three request headers duplicate what is in the body, so that a proxy or
//     gateway can route and cache without parsing JSON: `MCP-Protocol-Version`
//     (must match the `_meta` claim), `Mcp-Method` (the JSON-RPC method), and
//     `Mcp-Name` on `tools/call` / `prompts/get` / `resources/read`.
//     Disagreement between header and body is an error (-32020), never a
//     "best guess" -- otherwise a cache could serve the answer of one method
//     for another.
//   * HTTP status codes carry meaning next to the JSON-RPC error code:
//     400 for a malformed/mismatched request, 404 for an unknown method,
//     403 for a rejected `Origin`, 405 for a wrong HTTP method,
//     202 for an accepted notification.
//   * Because a local HTTP server is reachable from any web page the user
//     happens to open, servers MUST validate the `Origin` header and SHOULD
//     bind to 127.0.0.1 (both below).
//
// This server always answers with a single JSON object. A server that emits
// notifications while a call runs (progress, for instance) would instead
// answer `text/event-stream` and write the notifications followed by the final
// response as SSE events -- that is what the SDK-based server in
// `server-sdk-streamable.ts` does automatically.
// ---------------------------------------------------------------------------

type JR = {
  jsonrpc: "2.0";
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

const PORT = 3002;

const SERVER_INFO = { name: "pony-no-sdk-streamable", version: "0.1.0" };

// Reserved `_meta` keys of the modern era. The `io.modelcontextprotocol/`
// prefix is reserved for the spec itself.
const PROTOCOL_VERSION_KEY = "io.modelcontextprotocol/protocolVersion";
const SERVER_INFO_KEY = "io.modelcontextprotocol/serverInfo";

// The one stateless revision we implement...
const MODERN_PROTOCOL_VERSION = "2026-07-28";
// ...and the handshake-based ones we answer `initialize` for.
const LEGACY_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SUPPORTED_PROTOCOL_VERSIONS = [MODERN_PROTOCOL_VERSION, ...LEGACY_PROTOCOL_VERSIONS];

// MCP's own slice of the JSON-RPC error space (-32020 … -32022).
const HEADER_MISMATCH = -32020;
const UNSUPPORTED_PROTOCOL_VERSION = -32022;

const app = express();
app.use(express.json());

/** Reads `params._meta["io.modelcontextprotocol/protocolVersion"]`, if any. */
function requestedProtocolVersion(params: unknown): string | undefined {
  const meta = (params as { _meta?: Record<string, unknown> } | undefined)?._meta;
  const version = meta?.[PROTOCOL_VERSION_KEY];
  return typeof version === "string" ? version : undefined;
}

/**
 * Builds a JSON-RPC result. On the modern era we add the two envelope fields
 * the 2026-07-28 spec requires/recommends on every result; on the legacy era
 * we leave the result untouched (that is what the official SDK does too --
 * its legacy codec strips `resultType` and the serverInfo `_meta`).
 */
function jsonRpcResult(id: JR["id"], result: object, modern: boolean): JR {
  return {
    jsonrpc: "2.0",
    id,
    result: modern
      ? {
          resultType: "complete", // "the request completed, this is the final content"
          ...result,
          _meta: { [SERVER_INFO_KEY]: SERVER_INFO },
        }
      : result,
  };
}

function jsonRpcError(id: JR["id"], code: number, message: string, data?: unknown): JR {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

// --- Origin validation ------------------------------------------------------
// A browser attaches `Origin` to cross-origin requests. Non-browser MCP clients
// send none, so an absent header passes; a present one must be localhost, or a
// random web page could drive this server through the user's browser (that is
// the DNS-rebinding attack the spec warns about).
const ALLOWED_ORIGIN_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

function originAllowed(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    return ALLOWED_ORIGIN_HOSTNAMES.includes(new URL(origin).hostname);
  } catch {
    // An unparseable Origin is not a trustworthy one.
    return false;
  }
}

// --- modern: server/discover ------------------------------------------------
// The stateless replacement for `initialize`. A dual-era client sends this
// first as a probe: a proper result means "modern server", any other error
// means "fall back to the initialize handshake". It is a cacheable result, so
// it carries the ttlMs/cacheScope hints.
function handleDiscover(id: JR["id"]): JR {
  return jsonRpcResult(
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
//
// We answer it statelessly and deliberately do NOT mint an `Mcp-Session-Id`:
// sessions are optional even on the legacy revision, and without one every
// following request stands on its own -- which is all this server needs.
function handleInitialize(id: JR["id"], params: unknown): JR {
  const requested = (params as { protocolVersion?: string } | undefined)?.protocolVersion;
  const protocolVersion = requested && LEGACY_PROTOCOL_VERSIONS.includes(requested) ? requested : LEGACY_PROTOCOL_VERSIONS[0];
  return jsonRpcResult(
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

function handleToolsList(id: JR["id"], modern: boolean): JR {
  return jsonRpcResult(
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

function handleToolsCall(id: JR["id"], params: unknown, modern: boolean): JR {
  const { name, arguments: args } = (params ?? {}) as {
    name?: string;
    arguments?: Record<string, unknown>;
  };
  if (name !== "pony_password") {
    return jsonRpcError(id, -32601, "Unknown tool");
  }
  const minLength = Number(args?.minLength ?? 16);
  const special = Boolean(args?.special ?? false);
  const ponies = loadPoniesFromFile();
  const pwd = buildPassword({ minLength, special }, ponies);
  return jsonRpcResult(id, { content: [{ type: "text", text: pwd }] }, modern);
}

app.post("/mcp", (req: Request, res: Response) => {
  if (!originAllowed(req.headers.origin)) {
    // Not a JSON-RPC problem: the request never gets to be one.
    res.status(403).type("text/plain").send("Forbidden: invalid Origin header");
    return;
  }

  const msg: JR = req.body;
  console.log(`[pony-no-sdk-streamable] <- ${msg?.method ?? "<response>"} (id=${msg?.id ?? "none"})`);

  // Notifications carry no `id`. Per JSON-RPC we MUST NOT respond to them --
  // not even with an error. Over HTTP "no response" is expressed as 202
  // Accepted with an empty body. The most common one is
  // `notifications/initialized` from a legacy client.
  if (msg?.id === undefined) {
    res.status(202).end();
    return;
  }

  // Era detection: does this request bring its own protocol version along?
  const requested = requestedProtocolVersion(msg.params);
  const modern = requested === MODERN_PROTOCOL_VERSION;

  // A version we don't implement gets the spec's dedicated error, which tells
  // the client what we *do* support so it can retry with a matching version.
  if (requested !== undefined && !modern) {
    res.status(400).json(
      jsonRpcError(msg.id, UNSUPPORTED_PROTOCOL_VERSION, `Unsupported protocol version: ${requested}`, {
        supported: SUPPORTED_PROTOCOL_VERSIONS,
        requested,
      }),
    );
    return;
  }

  if (modern) {
    // The header duplicates the `_meta` claim so intermediaries can route on
    // it. If the two disagree we cannot know which one to believe, so we
    // refuse instead of picking one.
    const headerVersion = req.headers["mcp-protocol-version"];
    if (headerVersion !== requested) {
      res
        .status(400)
        .json(
          jsonRpcError(
            msg.id,
            HEADER_MISMATCH,
            `MCP-Protocol-Version header (${headerVersion ?? "absent"}) does not match the _meta protocol version (${requested})`,
          ),
        );
      return;
    }

    // Same idea for the method: `Mcp-Method` is REQUIRED on every modern
    // request, because a cache must be able to tell `tools/list` from
    // `tools/call` without opening the body.
    const headerMethod = req.headers["mcp-method"];
    if (headerMethod !== msg.method) {
      res
        .status(400)
        .json(
          jsonRpcError(
            msg.id,
            HEADER_MISMATCH,
            `Mcp-Method header (${headerMethod ?? "absent"}) does not match the JSON-RPC method (${msg.method ?? "absent"})`,
          ),
        );
      return;
    }

    // `Mcp-Name` (the tool/prompt/resource being addressed) is checked the
    // same way by a complete implementation; it is left out here to keep the
    // sample short.
    //
    // `Mcp-Session-Id` and `Last-Event-ID` no longer exist on this revision.
    // We simply ignore them if a 2025-era client sends them anyway.
  }

  // server/discover is modern-only; initialize is legacy-only.
  if (msg.method === "server/discover") {
    res.json(handleDiscover(msg.id));
    return;
  }
  if (msg.method === "initialize") {
    res.json(handleInitialize(msg.id, msg.params));
    return;
  }
  // `ping` was removed in 2026-07-28, but legacy clients send it.
  if (msg.method === "ping" && !modern) {
    res.json(jsonRpcResult(msg.id, {}, false));
    return;
  }
  // These two look identical on both eras -- only the envelope differs.
  if (msg.method === "tools/list") {
    res.json(handleToolsList(msg.id, modern));
    return;
  }
  if (msg.method === "tools/call") {
    res.json(handleToolsCall(msg.id, msg.params, modern));
    return;
  }

  // An unknown method is "no such resource at this endpoint" in HTTP terms,
  // so it gets a 404 next to the JSON-RPC -32601.
  res.status(404).json(jsonRpcError(msg.id, -32601, `Unsupported method: ${msg.method}`));
});

// GET used to open the standalone SSE stream and DELETE used to terminate a
// session; both are gone in 2026-07-28. 405 is an HTTP-level concern, not a
// JSON-RPC one, so the body is plain text rather than a JSON-RPC envelope.
function methodNotAllowed(_req: Request, res: Response) {
  res.status(405).type("text/plain").send("Method Not Allowed");
}

app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    serverName: SERVER_INFO.name,
    serverVersion: SERVER_INFO.version,
  });
});

// Bind to the loopback interface only: this server has no authentication, so
// it must not be reachable from the network.
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[pony-no-sdk-streamable] listening on http://127.0.0.1:${PORT}/mcp`);
  console.log(`[pony-no-sdk-streamable] health check: http://127.0.0.1:${PORT}/health`);
});
