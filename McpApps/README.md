# MCP Pony Password Generator App

This project demonstrates an MCP App that provides an interactive form for generating passwords from My Little Pony character names.

## Features

- **Interactive Form**: A beautiful HTML form with:
  - Number of passwords to generate
  - Minimum password length
  - Special character replacement toggle
  - Checkboxes to select specific ponies (first 15 ponies shown)
  
- **Pre-filled Values**: The form automatically pre-fills based on what the user mentioned in the chat (e.g., "I want 3 passwords with special characters")

- **Real-time Generation**: Click the button to generate passwords instantly using the selected options

## Project Structure

```
MCP-APPS/
├── src/
│   ├── lib/
│   │   ├── password.ts    # Password generation logic
│   │   └── ponies.ts      # Pony data loading
│   ├── data/
│   │   └── ponies.txt     # Pony names data
│   ├── ui/
│   │   └── password-form.html  # Interactive HTML form
│   └── server.ts          # MCP Server with App support
├── package.json
├── tsconfig.json
└── README.md
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your API key:
   - Copy `config.env.template` to `.env`
   - Add your OpenAI API key: `OPENAI_API_KEY=your_key_here`

3. Build the project:
```bash
npm run build
```

4. Start the server:
```bash
npm start
```

5. Open your browser:
   - Navigate to `http://localhost:3001`
   - Start chatting with the LLM!

## How It Works

1. **Tool Registration**: The `pony_password_batch` tool is registered with `_meta.ui.resourceUri` pointing to the UI resource
2. **UI Resource**: The `ui://password-form` resource serves the HTML form
3. **Initial Data**: When the tool is called, any provided parameters are passed to the form for pre-filling
4. **Form Interaction**: Users can modify the form and click "Generate Passwords"
5. **Tool Call**: The form calls the tool with the selected options
6. **Results**: Generated passwords are displayed in the form

## Usage in Chat

When a user asks for passwords, the LLM can call the tool with optional parameters:

```
User: "Generate 3 passwords with special characters, minimum length 20"
```

The tool will be called with:
```json
{
  "count": 3,
  "minLength": 20,
  "special": true
}
```

The form will be pre-filled with these values, and the user can then:
- Select specific ponies to use
- Adjust any settings
- Generate the passwords

## MCP App Features

- **Context Preservation**: The form stays in the conversation
- **Bidirectional Communication**: Form can call tools, host can push updates
- **Sandboxed**: Runs in a secure iframe
- **Pre-filled**: Automatically uses values from the conversation

## MCP in VS Code / Cursor einbinden (HTTP)

Damit du diesen MCP-Server **per HTTP** in VS Code oder Cursor nutzen kannst:

1. **Server starten** (im Projektordner `McpApps`):
   ```bash
   cd McpApps && npm install && npm start
   ```
   Der MCP-Endpoint läuft unter `http://localhost:3001/mcp`.

2. **In VS Code**: Workspace-Konfiguration in `.vscode/mcp.json` (im Repo-Root bereits vorhanden):
   ```json
   {
     "servers": {
       "pony-password": {
         "type": "http",
         "url": "http://localhost:3001/mcp"
       }
     }
   }
   ```
   Oder: Command Palette → **MCP: Add Server** → Typ **HTTP** → URL `http://localhost:3001/mcp`.

3. **In Cursor**: In den Einstellungen unter MCP den Server hinzufügen mit:
   - **Transport**: Streamable HTTP
   - **URL**: `http://localhost:3001/mcp`
   
   Im Repo liegt dafür `.cursor/mcp.json` mit der passenden Konfiguration.

4. Beim ersten Verbinden ggf. **Vertrauen** bestätigen. Anschließend stehen die Tools (z. B. `pony_password_batch`, `sample_ponies`) und die interaktive App in Chat/Agent zur Verfügung.

**Hinweis:** Der Server muss laufen, damit die Verbindung funktioniert. Port ist über `PORT` bzw. `.env` änderbar (Standard: 3001). In VS Code/Cursor kann der Formular-Button „Generate Passwords“ wegen Webview-Einschränkungen fehlschlagen; die Passwörter erhältst du trotzdem über den Tool-Aufruf der KI.

## Supported MCP Clients

This MCP App works with clients that support MCP Apps extension:
- Claude Desktop
- VS Code (Insiders)
- Cursor
- Other MCP App-compatible clients

