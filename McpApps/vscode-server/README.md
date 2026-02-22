# Pony Password Generator — MCP Server (VS Code / Claude / ChatGPT)

MCP-Server mit [@modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps): Formular bekommt Tool-Argumente per `ontoolinput`, sendet per `callServerTool`, optional Rückmeldung per `sendMessage`/`updateModelContext`.

## Setup

```bash
cd McpApps/vscode-server
npm install
```

Optional: `.env.example` → `.env` (z. B. `PORT`, Standard 3001). Kein API-Key nötig.

## Build & Start

- **Kein TS-Build** für den Server: Start mit **tsx** aus den Quellen.
- **Build** = nur App-UI: `npm run build` (Vite → `dist/mcp-app.html`).
- **build:server** (optional): für `node dist/main.js` / bin.

**HTTP** (z. B. Claude, Cursor):

```bash
npm start
```

→ MCP: **http://localhost:3001/mcp** (App wird beim Start ggf. gebaut.)

**Stdio** (VS Code / Cursor):

```bash
npm run start:stdio
```

Client-Befehl: `tsx main.ts -- --stdio` (im Projektordner) oder nach `npm run build:server`: `node dist/main.js --stdio`.

**Dev**: `npm run dev` (App-Watch + tsx).

## Tools

| Tool | Beschreibung | UI |
|------|--------------|-----|
| **list_ponies** | Pony-Liste fürs Formular (App lädt sie beim Start). | Nein |
| **sample_ponies** | Stichprobe Ponys (MCP-Sampling oder `data/ponies.txt`). Ergebnis als `sampledPonies` nutzen. | Nein |
| **pony_password_batch** | Passwörter generieren; öffnet Formular (count, minLength, special, selectedPonies, sampledPonies). | Ja |

## Struktur

`server.ts` (MCP + ext-apps), `main.ts` (stdio/HTTP), `lib/` (password, ponies), `data/ponies.txt`, `src/mcp-app.ts` (App-UI), Vite → `dist/mcp-app.html`.
