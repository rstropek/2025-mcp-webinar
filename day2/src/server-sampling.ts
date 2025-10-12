import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildMany } from "./lib/password-sdk.js";

const server = new McpServer({ name: "pony-sdk", version: "0.1.0" });

server.registerTool(
    'pony_password_sampled',
    {
      title: 'Passwörter aus gesampelten Namen (LLM)',
      description: 'Erzeugt Passwörter; Charakternamen werden zur Laufzeit via MCP-Sampling vom LLM geholt.',
      inputSchema: {
        count: z.number().int().min(1).max(50).default(5),
        minLength: z.number().int().min(1).default(16),
        special: z.boolean().default(false),
      },
      outputSchema: { result: z.array(z.string()), usedNames: z.array(z.string()) }
    },
    async ({ count, minLength, special }) => {
        
      const sampling = await server.server.createMessage({
        systemPrompt: 'You are a data generator. Return STRICT JSON only. No prose, no markdown.',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `Generate a JSON array of 30 distinct My Little Pony names}.`,
                `Rules:`,
                `- Each entry must be an object with "first" (required) and optional "last" properties.`,
                `- Names should be CamelCase strings with letters only (A–Z, a–z), with optional last name.`,
                `- No spaces, no punctuation, no digits.`,
                `Example: [{"first":"Twilight","last":"Sparkle"},{"first":"Rainbow","last":"Dash"},{"first":"Pinkie","last":"Pie"},{"first":"Applejack"}]`,
                `Return ONLY the JSON array.`
              ].join('\n')
            }
          }
        ],
        modelPreferences: {
          hints: [{ name: 'claude' }, { name: 'gpt' }],
          speedPriority: 0.6,
          intelligencePriority: 0.6,
          costPriority: 0.2
        },
        maxTokens: 800
      });
  
      const raw = sampling?.content?.type === 'text' ? sampling.content.text : '';
      let ponies: any[] = [];
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('not array');
        ponies = Array.from(new Set(parsed.map((item) => {
          if (typeof item === 'object' && item !== null && typeof item.first === 'string') {
            const first = item.first.trim();
            const last = item.last ? item.last.trim() : undefined;
            if (/^[A-Za-z]+$/.test(first) && first.length >= 2) {
              return { first, last };
            }
          }
          return null;
        }).filter(Boolean)))
          .slice(0, 200); 
      } catch {
        const msg = 'Konnte die vom LLM gelieferten Pony-Daten nicht zuverlässig parsen. Bitte erneut versuchen.';
        return { content: [{ type: 'text', text: msg }], structuredContent: { result: [], usedNames: [] } };
      }
  
      const pwds = buildMany(count, { minLength, special }, ponies);
  
      return {
        content: [
          { type: 'text', text: JSON.stringify(pwds, null, 2) },
          { type: 'text', text: `Erstellt mit ${ponies.length} gesampelten Ponies.` }
        ],
        structuredContent: { result: pwds, usedNames: ponies.slice(0, 50).map(p => p.last ? `${p.first}${p.last}` : p.first) }
      };
    }
  );
  

const transport = new StdioServerTransport();
server.connect(transport);
