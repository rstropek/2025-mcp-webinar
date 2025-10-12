import * as readline from "node:readline";
import { buildPassword } from "./lib/password-no-sdk.js";

type JR = { jsonrpc: "2.0"; id?: number | string | null; method?: string; params?: any; result?: any; error?: any };

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
const send = (obj: JR) => process.stdout.write(JSON.stringify(obj) + "\n");

function handleInitialize(id: JR["id"]) {
  const result = {
    protocolVersion: "2024-11-05",
    serverInfo: { name: "pony-no-sdk", version: "0.1.0" },
    capabilities: { 
      tools: { listChanged: true },
      prompts: { listChanged: true }
    }
  };
  send({ jsonrpc: "2.0", id, result });
}

function handleToolsList(id: JR["id"]) {
  const result = {
    tools: [
      {
        name: "pony_password",
        description: "Generiert ein Passwort aus My-Little-Pony-Charakternamen.",
        inputSchema: {
          type: "object",
          properties: {
            minLength: { type: "number", minimum: 1, default: 16 },
            special: { type: "boolean", default: false }
          },
          additionalProperties: false
        }
      }
    ]
  };
  send({ jsonrpc: "2.0", id, result });
}

function handleToolsCall(id: JR["id"], params: any) {
  const { name, arguments: args } = params ?? {};
  if (name !== "pony_password") {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown tool" } });
    return;
  }
  const minLength = Number(args?.minLength ?? 16);
  const special = Boolean(args?.special ?? false);
  const pwd = buildPassword({ minLength, special });
  send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: pwd }] } });
}

rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg: JR;
  try { msg = JSON.parse(line); }
  catch { return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }

  if (msg.method === "initialize") return handleInitialize(msg.id);
  if (msg.method === "tools/list") return handleToolsList(msg.id);
  if (msg.method === "tools/call") return handleToolsCall(msg.id, msg.params);

  send({ jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32601, message: `Unsupported method: ${msg.method}` } });
});
