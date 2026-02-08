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
   - Or use Anthropic: Set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=your_key_here`

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

## Supported MCP Clients

This MCP App works with clients that support MCP Apps extension:
- Claude Desktop
- VS Code (Insiders)
- Other MCP App-compatible clients

