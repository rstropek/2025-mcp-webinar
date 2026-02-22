/**
 * Express server for the Pony Password website: chat API, form UI resource, generate-passwords.
 */
/// <reference types="node" />
import 'dotenv/config';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  handleChat,
  registerToolHandler,
  registerToolMetadata,
  generatePoniesWithSampling,
} from './api/chat.js';
import { loadPoniesFromFile } from './lib/ponies.js';
import { buildMany } from './lib/password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC_UI = path.join(ROOT, 'src', 'ui');
const PORT = parseInt(process.env.PORT ?? '3000', 10);

const app = express();
app.use(cors());
app.use(express.json());

// Static: public (index.html, js/chat.js, css)
app.use(express.static(path.join(ROOT, 'public')));

// Static: form assets under /ui (password-form.js, password-form.css)
app.use('/ui', express.static(SRC_UI));

// --- Tool registration for chat (inputSchema must be valid JSON Schema for OpenAI) ---
registerToolMetadata(
  'sample_ponies',
  'Returns a sample of ponies for the password form. Use result as sampledPonies when calling pony_password_batch.',
  {
    type: 'object',
    properties: {
      count: { type: 'number', description: 'Number of ponies to sample (default: 5)' },
    },
    required: [],
  },
  false
);
registerToolHandler('sample_ponies', async (args: { count?: number }) => {
  const n = Math.min(args?.count ?? 5, 30);
  const ponies = await generatePoniesWithSampling();
  const sampled = (Array.isArray(ponies) ? ponies : []).slice(0, n);
  return { ponies: sampled };
});

registerToolMetadata(
  'pony_password_batch',
  'Generates passwords from Pony names. Opens an interactive form.',
  {
    type: 'object',
    properties: {
      count: { type: 'number', description: 'Number of passwords (default: 5)' },
      minLength: { type: 'number', description: 'Minimum length (default: 16)' },
      special: { type: 'boolean', description: 'Use special character replacement' },
      selectedPonies: { type: 'array', items: { type: 'string' }, description: 'Pony names to use' },
      sampledPonies: {
        type: 'array',
        items: { type: 'object', properties: { first: { type: 'string' }, last: { type: 'string' } }, required: ['first'] },
        description: 'Ponies to show in the form',
      },
    },
    required: [],
  },
  true,
  'ui://pony-password/form.html'
);
registerToolHandler('pony_password_batch', async () => ({ result: [] }));

// --- Routes ---
app.post('/api/chat', (req: Request, res: Response) => {
  void handleChat(req, res);
});

app.get('/api/ui-resource', async (req: Request, res: Response) => {
  try {
    const argsRaw = req.query.args as string | undefined;
    let initialData: Record<string, unknown> = {};
    if (argsRaw) {
      try {
        initialData = JSON.parse(decodeURIComponent(argsRaw)) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    }
    const sampledPonies = Array.isArray(initialData.sampledPonies) ? initialData.sampledPonies : [];
    const ponies = sampledPonies.length > 0 ? sampledPonies : loadPoniesFromFile().slice(0, 30);
    const htmlPath = path.join(SRC_UI, 'password-form.html');
    let html = await fs.readFile(htmlPath, 'utf-8');
    const inject = `<script>window.__MCP_INITIAL_DATA__ = ${JSON.stringify({ initialData, ponies })};</script>`;
    if (!html.includes('</head>')) {
      html = inject + html;
    } else {
      html = html.replace('</head>', inject + '\n</head>');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('[ui-resource]', err);
    res.status(500).send('Error loading form');
  }
});

app.post('/api/generate-passwords', (req: Request, res: Response) => {
  try {
    const { count = 5, minLength = 16, special = false, selectedPonies = [] } = req.body ?? {};
    let ponies = loadPoniesFromFile();
    if (Array.isArray(selectedPonies) && selectedPonies.length > 0) {
      ponies = ponies.filter((p) => {
        const full = p.last ? `${p.first}${p.last.replace(/\s+/g, '')}` : p.first;
        return selectedPonies.includes(full);
      });
      if (ponies.length === 0) ponies = loadPoniesFromFile();
    }
    const pwds = buildMany(
      Math.min(50, Math.max(1, Number(count) || 5)),
      { minLength: Math.max(1, Number(minLength) || 16), special: Boolean(special) },
      ponies
    );
    res.json({ result: pwds });
  } catch (err) {
    console.error('[generate-passwords]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`Website listening on http://localhost:${PORT}`);
});
