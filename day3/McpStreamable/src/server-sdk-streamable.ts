import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from "zod";
import { buildPassword, buildMany } from "./lib/password.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { loadPoniesFromFile, toOnePerLine } from './lib/ponies.js';
import { createStreamableHTTPServer } from './lib/streamable-http.js';

const server = new McpServer({ name: "pony-sdk-streamable", version: "0.1.0" });

/** Tool 1: Einzel-Passwort */
server.registerTool(
    'pony_password',
    {
        title: "Ein Passwort generieren",
        description: "Baut ein Passwort aus My-Little-Pony-Charakternamen.",
        inputSchema: {
        minLength: z.number().int().min(1).default(16),
        special: z.boolean().default(false),
        },
        outputSchema: { result: z.string() }
    },
    ({ minLength, special }) => {
      const ponies = loadPoniesFromFile();              
      const output = buildPassword({ minLength, special }, ponies);
      return {
        content: [{ type: 'text', text: output }],
        structuredContent: { result: output }
      };
    }
);

/** Tool 2: Batch */
server.registerTool(
  "pony_password_batch",
  {
    title: "Mehrere Passwörter generieren",
    description: "Generiert N Passwörter mit denselben Optionen.",
    inputSchema: {
      count: z.number().int().min(1).max(50).default(5),
      minLength: z.number().int().min(1).default(16),
      special: z.boolean().default(false),
    },
    outputSchema: { result: z.array(z.string()) }
  },
  ({ count, minLength, special }) => {
    const ponies = loadPoniesFromFile();   
    const pwds = buildMany(count, { minLength, special }, ponies);
    return { 
        content: [{ type: "text", text: JSON.stringify(pwds) }], 
        structuredContent: { result: pwds } 
    };
  }
);

server.registerPrompt(
  "make-pony-password",
  {
    title: "Pony-Passwort erstellen",
    description: "Prompt zum Erzeugen eines Passworts aus MLP-Charakternamen",
    argsSchema: {
      minLength: completable(z.string(), (val) =>
        [8, 12, 16, 20, 24, 32].filter(n => String(n).startsWith(String(val ?? ""))).map(String)
      ),
      special: completable(z.string(), (val) => {
        const opts = ["true", "false"];
        return opts.filter(s => s.startsWith(String(val ?? "")));
      })
    }
  },
  ({ minLength, special }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
`Erzeuge mir ein sicheres Passwort aus My-Little-Pony-Charakternamen.
- Mindestlänge: ${minLength}
- Sonderzeichenersetzung aktiv: ${special}
Regeln für Ersetzungen (falls aktiv): o/O→0, i/I→!, e/E→€, s/S→$.`
        }
      }
    ]
  })
);

server.registerResource(
  "pony-characters-text",
  "pony://characters.txt",
  {
    title: "MLP-Charaktere (Text)",
    description: "Ein Name pro Zeile aus data/ponies.txt (CamelCase, ohne Leerzeichen im Nachnamen).",
    mimeType: "text/plain; charset=utf-8"
  },
  (uri) => {
    const ponies = loadPoniesFromFile(); 
    const text = toOnePerLine(ponies);
    return { contents: [{ uri: uri.href, text }] };
  }
);

// Start the server
createStreamableHTTPServer(server, "pony-sdk-streamable", "0.1.0", 3000);
