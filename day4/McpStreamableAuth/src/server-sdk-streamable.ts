import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildPassword, buildMany, buildPasswordAdvanced, filterPonies } from './lib/password.js';
import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import { loadPoniesFromFile, toOnePerLine } from './lib/ponies.js';
import { createStreamableHTTPServer } from './lib/streamable-http.js';
import { isAuthenticated, getToken, getTokenClaims } from './lib/auth-context.js';

const server = new McpServer({ name: 'pony-sdk-streamable', version: '0.1.0' });

server.registerTool(
  'pony_password',
  {
    title: 'Generate Password',
    description: 'Generates a password from My Little Pony character names.',
    inputSchema: {
      minLength: z.number().int().min(1).default(16),
      special: z.boolean().default(false),
    },
    outputSchema: { result: z.string() },
  },
  ({ minLength, special }) => {
    const ponies = loadPoniesFromFile();
    const output = buildPassword({ minLength, special }, ponies);
    return {
      content: [{ type: 'text', text: output }],
      structuredContent: { result: output },
    };
  }
);

server.registerTool(
  'pony_password_with_preferences',
  {
    title: 'Generate Password with Preferences',
    description: 'Generates a password from My Little Pony character names. You can exclude ponies you don\'t like.',
    inputSchema: {
      minLength: z.number().int().min(1).default(16),
      special: z.boolean().default(false),
    },
    outputSchema: { result: z.string() },
  },
  async ({ minLength, special }) => {
    let ponies = loadPoniesFromFile();
    const result = await server.server.elicitInput({
      message: 'Which ponies to exclude?',
      requestedSchema: {
        type: 'object',
        properties: {
          excludedPonies: {
            type: 'string',
            title: 'Excluded Ponies',
            description: 'List the names of ponies to exclude, separated by commas.',
          },
        },
        required: ['excludedPonies'],
      },
    });

    if (result.action === 'accept') {
      const excludedNames = (result.content!.excludedPonies as string).split(',');
      console.log('Excluding ponies:', excludedNames);
      ponies = ponies.filter(pony => excludedNames.indexOf(pony.first) === -1 && (!pony.last || excludedNames.indexOf(pony.last) === -1));
    }

    const output = buildPassword({ minLength, special }, ponies);
    return {
      content: [{ type: 'text', text: output }],
      structuredContent: { result: output },
    };
  }
);

server.registerTool(
  'pony_password_batch',
  {
    title: 'Generate Multiple Passwords',
    description: 'Generates N passwords with the same options.',
    inputSchema: {
      count: z.number().int().min(1).max(50).default(5),
      minLength: z.number().int().min(1).default(16),
      special: z.boolean().default(false),
    },
    outputSchema: { result: z.array(z.string()) },
  },
  ({ count, minLength, special }) => {
    const ponies = loadPoniesFromFile();
    const pwds = buildMany(count, { minLength, special }, ponies);
    return {
      content: [{ type: 'text', text: JSON.stringify(pwds) }],
      structuredContent: { result: pwds },
    };
  }
);

server.registerPrompt(
  'make-pony-password',
  {
    title: 'Create Pony Password',
    description: 'Prompt for generating a password from MLP character names',
    argsSchema: {
      minLength: completable(z.string(), (val) => [8, 12, 16, 20, 24, 32].filter((n) => String(n).startsWith(String(val ?? ''))).map(String)),
      special: completable(z.string(), (val) => {
        const opts = ['true', 'false'];
        return opts.filter((s) => s.startsWith(String(val ?? '')));
      }),
    },
  },
  ({ minLength, special }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Erzeuge mir ein sicheres Passwort aus My-Little-Pony-Charakternamen.
- Mindestlänge: ${minLength}
- Sonderzeichenersetzung aktiv: ${special}
Regeln für Ersetzungen (falls aktiv): o/O→0, i/I→!, e/E→€, s/S→$.`,
        },
      },
    ],
  })
);

server.registerResource(
  'pony-characters-text',
  'pony://characters.txt',
  {
    title: 'MLP Characters (Text)',
    description: 'One name per line from data/ponies.txt (CamelCase, no spaces in last names).',
    mimeType: 'text/plain; charset=utf-8',
  },
  (uri) => {
    const ponies = loadPoniesFromFile();
    const text = toOnePerLine(ponies);
    return { contents: [{ uri: uri.href, text }] };
  }
);

server.registerTool(
  'pony_password_advanced',
  {
    title: 'Advanced Hybrid Password Generator (Authenticated)',
    description: 'Generates strong passwords by mixing ponies with numbers, symbols, and case variations. Requires authentication and pony:password:write permission.',
    inputSchema: {
      length: z.number().int().min(8).max(128).default(20),
      includeNumbers: z.boolean().default(true),
      includeSymbols: z.boolean().default(true),
      includeUppercase: z.boolean().default(true),
      customPonies: z.array(z.string()).optional(),
    },
    outputSchema: {
      result: z.string(),
      metadata: z.object({
        length: z.number(),
        includedNumbers: z.boolean(),
        includedSymbols: z.boolean(),
        includedUppercase: z.boolean(),
        composition: z.array(z.string()),
      })
    },
  },
  async ({ length, includeNumbers, includeSymbols, includeUppercase, customPonies }) => {
    // Get custom ponies if provided, otherwise use default
    let ponies = loadPoniesFromFile();
    if (customPonies && customPonies.length > 0) {
      ponies = filterPonies(ponies, customPonies);

      if (ponies.length === 0) {
        throw new Error('No matching ponies found for the provided custom list.');
      }
    }

    // Build advanced hybrid password
    const result = buildPasswordAdvanced(
      { length, includeNumbers, includeSymbols, includeUppercase },
      ponies
    );

    const claims = getTokenClaims();
    const username = claims?.sub || claims?.email || 'anonymous';

    console.log(`✓ Advanced hybrid password generated for authenticated user: ${username}`);
    console.log(`  Length: ${result.metadata.length}, Composition: ${result.metadata.composition.join(', ')}`);

    return {
      content: [{ type: 'text', text: result.result }],
      structuredContent: result,
    };
  }
);

server.registerTool(
  'get_token_claims',
  {
    title: 'Get Token Claims',
    description: 'Returns the claims from the JWT authentication token for the current request. Requires authentication.',
    inputSchema: {},
    outputSchema: {
      claims: z.record(z.any()).optional(),
      isAuthenticated: z.boolean(),
    },
  },
  async () => {
    if (!isAuthenticated()) {
      return {
        content: [{ type: 'text', text: 'Not authenticated. No token claims available.' }],
        structuredContent: {
          isAuthenticated: false,
        },
      };
    }

    const claims = getTokenClaims();
    const claimsText = JSON.stringify(claims, null, 2);

    return {
      content: [{ type: 'text', text: `Token Claims:\n${claimsText}` }],
      structuredContent: {
        claims,
        isAuthenticated: true,
      },
    };
  }
);

createStreamableHTTPServer(server, 'pony-sdk-streamable', '0.1.0', 3000);
