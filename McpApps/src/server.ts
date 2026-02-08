import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { z } from 'zod';
import { buildMany } from './lib/password.js';
import { loadPoniesFromFile, renderFragment, type Pony } from './lib/ponies.js';
import { handleChat, registerToolHandler, registerToolMetadata, generatePoniesWithSampling } from './api/chat.js';

dotenv.config();

const server = new McpServer({ name: 'pony-password-app', version: '1.0.0' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_PATH = path.join(__dirname, 'ui', 'password-form.html');

/**
 * Tool that generates passwords with MCP App UI support
 * The tool accepts optional pre-filled values and returns a UI resource
 */
server.registerTool(
  'pony_password_batch',
  {
    title: 'Generate Pony Passwords (Interactive)',
    description: 'Generates multiple passwords from My Little Pony character names. Opens an interactive form where you can select ponies and configure options.',
    inputSchema: {
      count: z.number().int().min(1).max(50).optional().describe('Number of passwords to generate (default: 5)'),
      minLength: z.number().int().min(1).optional().describe('Minimum length of the password (default: 16)'),
      special: z.boolean().optional().describe('Enable special character replacement (default: false)'),
      selectedPonies: z.array(z.string()).optional().describe('Array of pony names to use (if not provided, all ponies are used)'),
    },
    outputSchema: { result: z.array(z.string()) },
    // MCP App metadata - tells the host to render a UI
    _meta: {
      ui: {
        resourceUri: 'ui://password-form',
      },
    },
  },
  async ({ count = 5, minLength = 16, special = false, selectedPonies }) => {
    let ponies = loadPoniesFromFile();
    
    if (selectedPonies && selectedPonies.length > 0) {
      ponies = ponies.filter(pony => {
        const fullName = pony.last 
          ? `${pony.first}${pony.last.replace(/\s+/g, '')}` 
          : pony.first;
        return selectedPonies.includes(fullName);
      });
    }
    
    const pwds = buildMany(count, { minLength, special }, ponies);
    
    return {
      content: [{ type: 'text', text: JSON.stringify(pwds) }],
      structuredContent: { result: pwds },
    };
  }
);

const ponySchema = z.object({
  first: z.string(),
  last: z.string().optional(),
});

const passwordToolSchema = z.object({
  count: z.number().int().min(1).max(50).optional().describe('Number of passwords to generate (default: 5)'),
  minLength: z.number().int().min(1).optional().describe('Minimum length of the password (default: 16)'),
  special: z.boolean().optional().describe('Enable special character replacement (default: false)'),
  selectedPonies: z.array(z.string()).optional().describe('Array of pony names to use (if not provided, all ponies are used)'),
  sampledPonies: z.array(ponySchema).optional().describe('Optional list of ponies to show in the form (e.g. from sample_ponies). If not provided, a default list is used.'),
});

registerToolMetadata(
  'pony_password_batch',
  'Generates multiple passwords from My Little Pony character names. Opens an interactive form where you can select ponies and configure options. Optionally pass sampledPonies (from sample_ponies) to show suggested ponies in the form.',
  passwordToolSchema,
  true,
  'ui://password-form'
);

registerToolMetadata(
  'sample_ponies',
  'Generates a list of suggested My Little Pony names (e.g. for the password form). Call this first if the user wants suggested or varied ponies in the form, then pass the returned ponies as sampledPonies when calling pony_password_batch.',
  z.object({}),
  false
);

registerToolHandler('sample_ponies', async () => {
  const ponies = await generatePoniesWithSampling();
  return { ponies };
});

registerToolHandler('pony_password_batch', async (args: any) => {
  const { count = 5, minLength = 16, special = false, selectedPonies } = args;
  let ponies = loadPoniesFromFile();
  
  if (selectedPonies && selectedPonies.length > 0) {
    ponies = ponies.filter(pony => {
      const fullName = pony.last 
        ? `${pony.first}${pony.last.replace(/\s+/g, '')}` 
        : pony.first;
      return selectedPonies.includes(fullName);
    });
  }
  
  const pwds = buildMany(count, { minLength, special }, ponies);
  
  // Return in format expected by MCP SDK
  return {
    content: [{ type: 'text', text: JSON.stringify(pwds) }],
    structuredContent: { result: pwds },
  };
});

/**
 * UI Resource that serves the HTML form
 * This is what gets rendered in the MCP App iframe
 */
server.registerResource(
  'password-form',
  'ui://password-form',
  {
    title: 'Pony Password Generator Form',
    description: 'Interactive form for generating passwords from My Little Pony character names',
    mimeType: 'text/html',
  },
  async (uri) => {
    const html = readFileSync(UI_PATH, 'utf-8');
    
    const allPonies = loadPoniesFromFile();
    
    // Inject initial data and ponies into the HTML
    // We'll use a script tag to pass data to the app
    // The initial data will be populated by the host when the tool is called
    const dataScript = `
      <script>
        window.__MCP_INITIAL_DATA__ = {
          initialData: {},
          ponies: ${JSON.stringify(allPonies.slice(0, 15))}, // First 15 ponies for the form
        };
      </script>
    `;
    
    const modifiedHtml = html.replace('</head>', `${dataScript}</head>`);
    
    return {
      contents: [
        {
          uri: uri.href,
          text: modifiedHtml,
          mimeType: 'text/html',
        },
      ],
    };
  }
);

// Create HTTP server with streamable transport
const app = express();
app.use(cors({ 
  origin: '*', 
  exposedHeaders: ['mcp-session-id', 'Mcp-Session-Id'],
  allowedHeaders: ['Content-Type', 'Accept', 'mcp-session-id', 'Mcp-Session-Id']
}));
app.use(express.json());

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/ui', express.static(path.join(__dirname, 'ui')));

app.post('/api/chat', express.json(), async (req: Request, res: Response) => {
  await handleChat(req, res);
});

app.get('/api/ui-resource', async (req: Request, res: Response) => {
  try {
    const uri = req.query.uri as string;
    const args = req.query.args ? JSON.parse(decodeURIComponent(req.query.args as string)) : {};
    
    if (uri === 'ui://password-form') {
      const html = readFileSync(UI_PATH, 'utf-8');
      
      let poniesToUse: any[] = [];
      if (args.sampledPonies && Array.isArray(args.sampledPonies) && args.sampledPonies.length > 0) {
        poniesToUse = args.sampledPonies;
      } else {
        const allPonies = loadPoniesFromFile();
        poniesToUse = allPonies.slice(0, 15);
      }
      
      const dataJson = JSON.stringify({
        initialData: args,
        ponies: poniesToUse,
      });
      
      const dataScript = `
        <script>
          window.__MCP_INITIAL_DATA__ = ${dataJson};
        </script>
      `;
      
      const modifiedHtml = html.replace('</head>', `${dataScript}</head>`);
      res.setHeader('Content-Type', 'text/html');
      res.send(modifiedHtml);
    } else {
      res.status(404).send('UI resource not found');
    }
  } catch (error) {
    res.status(500).send(`Error loading UI resource: ${(error as Error).message}`);
  }
});

// MCP endpoint
app.post('/mcp', async (req: Request, res: Response) => {
  const sessionId = (req.headers['mcp-session-id'] || req.headers['Mcp-Session-Id']) as string | undefined;
  
  if (sessionId && transports[sessionId]) {
    const transport = transports[sessionId];
    await transport.handleRequest(req, res, req.body);
    return;
  }
  
  // If no session ID and this is an initialize request, create new session
  if (!sessionId && req.body && req.body.method === 'initialize') {
    // The MCP SDK doesn't allow one server to be connected to multiple transports
    const sessionServer = new McpServer({ name: 'pony-password-app', version: '1.0.0' });
    
    // Register the same tool on this server instance
    sessionServer.registerTool(
      'pony_password_batch',
      {
        title: 'Generate Pony Passwords (Interactive)',
        description: 'Generates multiple passwords from My Little Pony character names. Opens an interactive form where you can select ponies and configure options.',
        inputSchema: {
          count: z.number().int().min(1).max(50).optional().describe('Number of passwords to generate (default: 5)'),
          minLength: z.number().int().min(1).optional().describe('Minimum length of the password (default: 16)'),
          special: z.boolean().optional().describe('Enable special character replacement (default: false)'),
          selectedPonies: z.array(z.string()).optional().describe('Array of pony names to use (if not provided, all ponies are used)'),
        },
        outputSchema: { result: z.array(z.string()) },
        _meta: {
          ui: {
            resourceUri: 'ui://password-form',
          },
        },
      },
      async ({ count = 5, minLength = 16, special = false, selectedPonies }) => {
        let ponies = loadPoniesFromFile();
        
        if (selectedPonies && selectedPonies.length > 0) {
          ponies = ponies.filter(pony => {
            const fullName = pony.last 
              ? `${pony.first}${pony.last.replace(/\s+/g, '')}` 
              : pony.first;
            return selectedPonies.includes(fullName);
          });
        }
        
        const pwds = buildMany(count, { minLength, special }, ponies);
        
        return {
          content: [{ type: 'text', text: JSON.stringify(pwds) }],
          structuredContent: { result: pwds },
        };
      }
    );
    
    // Register the same resource
    sessionServer.registerResource(
      'password-form',
      'ui://password-form',
      {
        title: 'Pony Password Generator Form',
        description: 'Interactive form for generating passwords from My Little Pony character names',
        mimeType: 'text/html',
      },
      async (uri) => {
        const html = readFileSync(UI_PATH, 'utf-8');
        const allPonies = loadPoniesFromFile();
        
        const dataScript = `
          <script>
            window.__MCP_INITIAL_DATA__ = {
              initialData: {},
              ponies: ${JSON.stringify(allPonies.slice(0, 15))},
            };
          </script>
        `;
        
        const modifiedHtml = html.replace('</head>', `${dataScript}</head>`);
        
        return {
          contents: [
            {
              uri: uri.href,
              text: modifiedHtml,
              mimeType: 'text/html',
            },
          ],
        };
      }
    );
    
    // Create new transport for initial connection (initialize request)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports[sessionId] = transport;
        // Set the session ID in response header so client knows what to use
        if (!res.headersSent) {
          res.setHeader('mcp-session-id', sessionId);
          res.setHeader('Mcp-Session-Id', sessionId);
        }
      },
    });

    // Clean up transport when session closes to prevent memory leaks
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    await sessionServer.connect(transport);
    
    await transport.handleRequest(req, res, req.body);
    return;
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }
});

app.get('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

app.delete('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`MCP Server running on http://localhost:${PORT}/mcp`);
  console.log(`Website available at http://localhost:${PORT}`);
});

