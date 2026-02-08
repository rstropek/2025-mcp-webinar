// Simple MCP Client for the chatbot
class SimpleMcpClient {
    constructor(mcpUrl) {
        this.mcpUrl = mcpUrl;
        this.sessionId = null;
    }

    async initialize() {
        const response = await fetch(this.mcpUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'web-chatbot', version: '1.0.0' }
                }
            })
        });
        const data = await response.json();
        this.sessionId = response.headers.get('mcp-session-id');
        return data;
    }

    async listTools() {
        const response = await fetch(this.mcpUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'mcp-session-id': this.sessionId
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {}
            })
        });
        return await response.json();
    }

    async callTool(name, args) {
        const response = await fetch(this.mcpUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'mcp-session-id': this.sessionId
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/call',
                params: { name, arguments: args }
            })
        });
        return await response.json();
    }

    async readResource(uri) {
        const response = await fetch(this.mcpUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'mcp-session-id': this.sessionId
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'resources/read',
                params: { uri }
            })
        });
        return await response.json();
    }
}

// LLM client that calls the backend API
class LLMClient {
    constructor() {
        this.conversationHistory = [];
    }

    async chat(userMessage) {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: userMessage,
                conversationHistory: this.conversationHistory
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        this.conversationHistory.push({ role: 'user', content: userMessage });
        this.conversationHistory.push({ role: 'assistant', content: data.text });

        return data;
    }
}

// Chat UI
const messagesDiv = document.getElementById('messages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

const llm = new LLMClient();

window.addEventListener('message', (event) => {
    const d = event.data;
    if (!d || d.type !== 'mcp-app-result') return;
    if (d.toolName === 'pony_password_batch' && Array.isArray(d.passwords) && d.passwords.length > 0) {
        const text = 'The user has generated the following password(s) in the form: ' + d.passwords.join(', ') + '.';
        llm.conversationHistory.push({ role: 'assistant', content: text });
        addMessage('assistant', 'I\'ve noted the generated password(s). You can ask me about them (e.g. "which one was the first?").', null, null);
    }
});

addMessage('assistant', 'Hello! I can help you generate passwords using My Little Pony character names. Try asking: "Generate 3 passwords with special characters"');

function addMessage(role, text, uiResource = null, toolArgs = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;

    messageDiv.appendChild(contentDiv);

    if (uiResource) {
        const appContainer = document.createElement('div');
        appContainer.className = 'mcp-app-container';
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.minHeight = '500px';
        iframe.style.border = 'none';

        const url = `/api/ui-resource?uri=${encodeURIComponent(uiResource)}&args=${encodeURIComponent(JSON.stringify(toolArgs || {}))}`;

        fetch(url)
            .then(r => r.text())
            .then(html => {
                iframe.srcdoc = html;
            })
            .catch(err => {
                iframe.srcdoc = `<html><body><p>Error loading UI: ${err.message}</p></body></html>`;
            });

        appContainer.appendChild(iframe);
        messageDiv.appendChild(appContainer);
    }

    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    addMessage('user', message);
    userInput.value = '';
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="loading"></span>';

    try {
        const response = await llm.chat(message);
        addMessage('assistant', response.text, response.uiResource, response.toolArgs);
    } catch (error) {
        addMessage('assistant', `Error: ${error.message}. Make sure the server is running and your API key is configured in .env`);
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
    }
}

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
