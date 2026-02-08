import { type Request, type Response } from 'express';
import { LLMClient } from '../lib/llm.js';
import { loadPoniesFromFile } from '../lib/ponies.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** Generate ponies via LLM for the form; exported for use by sample_ponies tool. */
export async function generatePoniesWithSampling(): Promise<any[]> {
  const llm = new LLMClient();
  
  const prompt = `Generate a JSON array of 30 distinct My Little Pony names.
Rules:
- Each entry must be an object with "first" (required) and optional "last" properties.
- Names should be CamelCase strings with letters only (A–Z, a–z), with optional last name.
- No spaces, no punctuation, no digits.
Example: [{"first":"Twilight","last":"Sparkle"},{"first":"Rainbow","last":"Dash"},{"first":"Pinkie","last":"Pie"},{"first":"Applejack"}]
Return ONLY the JSON array. No prose, no markdown, no code blocks.`;

  try {
    const response = await llm.chat([
      {
        role: 'system',
        content: 'You are a data generator. Return STRICT JSON only. No prose, no markdown.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    const raw = response.text.trim();
    
    // Remove markdown code blocks if present
    const cleaned = raw.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
    
    const parsed = JSON.parse(cleaned);
    
    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    const ponies = Array.from(
      new Set(
        parsed
          .map((item: any) => {
            if (typeof item === 'object' && item !== null && typeof item.first === 'string') {
              const first = item.first.trim();
              const last = item.last ? item.last.trim() : undefined;
              if (/^[A-Za-z]+$/.test(first) && first.length >= 2) {
                return { first, last };
              }
            }
            return null;
          })
          .filter(Boolean)
      )
    ).slice(0, 30);

    return ponies;
  } catch (error) {
    return [];
  }
}

// Tool registry to call tools directly
const toolHandlers: Map<string, (args: any) => Promise<any>> = new Map();

// Tool metadata registry
const toolMetadata: Map<string, {
  name: string;
  description: string;
  inputSchema: any;
  hasUI: boolean;
  uiResource?: string;
}> = new Map();

export function registerToolHandler(name: string, handler: (args: any) => Promise<any>) {
  toolHandlers.set(name, handler);
}

export function registerToolMetadata(
  name: string,
  description: string,
  inputSchema: any,
  hasUI: boolean = false,
  uiResource?: string
) {
  toolMetadata.set(name, {
    name,
    description,
    inputSchema,
    hasUI,
    uiResource,
  });
}

export async function handleChat(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    console.log('[Chat] User:', message);

    const llm = new LLMClient();

      // Get available tools from registry
      const tools = Array.from(toolMetadata.values()).map(tool => {
        let parameters: any = { type: 'object', properties: {}, required: [] };
        if (tool.inputSchema) {
          if (typeof tool.inputSchema === 'object' && 
              (('_def' in tool.inputSchema) || ('shape' in tool.inputSchema))) {
            try {
              parameters = zodToJsonSchema(tool.inputSchema as any);
            } catch {
              parameters = { type: 'object', properties: {}, required: [] };
            }
          } else {
            parameters = tool.inputSchema;
          }
        }
        
        return {
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: parameters,
          },
        };
      });

    const messages = [
      {
        role: 'system' as const,
        content: `You are a helpful assistant with access to tools for generating passwords from My Little Pony character names.

PASSWORD GENERATION:
- When the user wants to generate passwords, call pony_password_batch to show the interactive form. Pass count, minLength, special (and optionally selectedPonies) from the user's request.
- If the user wants suggested or varied ponies for the form (e.g. "suggest some ponies", "use sampling", "generate pony names for the form"), first call the sample_ponies tool, then call pony_password_batch and pass the returned list as sampledPonies so the form shows those ponies. Otherwise you can call pony_password_batch without sampledPonies; the form will use a default list.

RECALLING GENERATED PASSWORDS:
- When the user asks what password(s) they generated (e.g. "which passwords did I generate?", "what was the password?"), the conversation history may contain a previous assistant message that lists them, e.g. "The user has generated the following password(s) in the form: X, Y, Z." You MUST answer from that context and tell the user their generated password(s). Do not say you cannot recall them if that message is in the history.`,
      },
      ...conversationHistory,
      {
        role: 'user' as const,
        content: message,
      },
    ];
    
    const response = await llm.chat(messages, tools.length > 0 ? tools : undefined);

    console.log('[Chat] LLM text:', response.text || '(empty)');
    if (response.toolCalls?.length) {
      console.log('[Chat] Tool calls:', response.toolCalls.map(tc => ({ name: tc.name, args: tc.arguments })));
    }

    // If LLM wants to call a tool, check if it has UI
    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolWithUI = response.toolCalls.find(tc => {
        const toolMeta = toolMetadata.get(tc.name);
        return toolMeta?.hasUI || false;
      });

      if (toolWithUI) {
        const toolMeta = toolMetadata.get(toolWithUI.name);
        const uiResource = toolMeta?.uiResource || null;
        const args = toolWithUI.arguments || {};
        let sampledPonies: any[] = Array.isArray(args.sampledPonies) && args.sampledPonies.length > 0
          ? args.sampledPonies
          : [];
        if (sampledPonies.length === 0) {
          const samplePoniesCall = response.toolCalls.find(tc => tc.name === 'sample_ponies');
          if (samplePoniesCall) {
            try {
              const handler = toolHandlers.get('sample_ponies');
              if (handler) {
                const result = await handler(samplePoniesCall.arguments);
                if (result?.ponies && Array.isArray(result.ponies)) sampledPonies = result.ponies;
              }
            } catch {
              // ignore
            }
          }
          if (sampledPonies.length === 0) sampledPonies = loadPoniesFromFile().slice(0, 15);
        }

        const uiMessage = `I'm showing you an interactive form to configure the password generation. Please fill out the form and submit it when you're ready.`;

        const responseData = {
          text: uiMessage,
          uiResource: uiResource,
          toolArgs: {
            ...args,
            sampledPonies,
          },
        };

        console.log('[Chat] Response: UI form, ponies for form:', sampledPonies.length);
        res.json(responseData);
        return;
      }

      // No UI - execute tools normally
      // Generate unique IDs for tool calls first
      const toolCallIds = response.toolCalls.map((_, idx) => `call_${Date.now()}_${idx}`);
      
      const toolResults = [];
      
      for (let idx = 0; idx < response.toolCalls.length; idx++) {
        const toolCall = response.toolCalls[idx];
        const toolCallId = toolCallIds[idx];
        
        try {
          const handler = toolHandlers.get(toolCall.name);
          if (!handler) {
            throw new Error(`Tool handler not found: ${toolCall.name}`);
          }
          const toolResult = await handler(toolCall.arguments);
          console.log('[Chat] Tool result', toolCall.name, ':', JSON.stringify(toolResult).slice(0, 200) + (JSON.stringify(toolResult).length > 200 ? '...' : ''));
          toolResults.push({
            tool_call_id: toolCallId,
            role: 'tool' as const,
            name: toolCall.name,
            content: JSON.stringify({ result: toolResult }),
          });
        } catch (error) {
          console.log('[Chat] Tool error', toolCall.name, ':', (error as Error).message);
          toolResults.push({
            tool_call_id: toolCallId,
            role: 'tool' as const,
            name: toolCall.name,
            content: JSON.stringify({ error: (error as Error).message }),
          });
        }
      }

      const finalMessages: any[] = [
        ...messages,
        {
          role: 'assistant' as const,
          content: response.text || null,
          tool_calls: response.toolCalls.map((tc, idx) => ({
            id: toolCallIds[idx],
            type: 'function' as const,
            function: { 
              name: tc.name, 
              arguments: JSON.stringify(tc.arguments) 
            },
          })),
        },
        ...toolResults,
      ];

      const finalResponse = await llm.chat(finalMessages, tools.length > 0 ? tools : undefined);

      console.log('[Chat] LLM (after tools) text:', finalResponse.text || '(empty)');
      if (finalResponse.toolCalls?.length) {
        console.log('[Chat] LLM (after tools) tool calls:', finalResponse.toolCalls.map(tc => ({ name: tc.name, args: tc.arguments })));
      }

      const finalToolWithUI = finalResponse.toolCalls?.find(tc => toolMetadata.get(tc.name)?.hasUI);
      if (finalToolWithUI) {
        const toolMeta = toolMetadata.get(finalToolWithUI.name);
        const uiResource = toolMeta?.uiResource || null;
        const args = finalToolWithUI.arguments || {};
        let sampledPonies: any[] = Array.isArray(args.sampledPonies) && args.sampledPonies.length > 0
          ? args.sampledPonies
          : [];
        if (sampledPonies.length === 0) {
          const sampleResult = toolResults.find(tr => tr.name === 'sample_ponies');
          if (sampleResult) {
            try {
              const parsed = JSON.parse(sampleResult.content);
              if (parsed?.result?.ponies && Array.isArray(parsed.result.ponies)) {
                sampledPonies = parsed.result.ponies;
              }
            } catch {
              // ignore
            }
          }
          if (sampledPonies.length === 0) sampledPonies = loadPoniesFromFile().slice(0, 15);
        }
        const uiMessage = `I'm showing you an interactive form to configure the password generation. Please fill out the form and submit it when you're ready.`;
        const responseData = {
          text: uiMessage,
          uiResource,
          toolArgs: { ...args, sampledPonies },
        };
        console.log('[Chat] Response: UI form (from second round), ponies for form:', sampledPonies.length);
        res.json(responseData);
        return;
      }
      
      res.json({
        text: finalResponse.text,
        uiResource: null,
        toolArgs: null,
      });
    } else {
      console.log('[Chat] Response: text only');
      res.json({
        text: response.text,
        uiResource: null,
        toolArgs: null,
      });
    }
  } catch (error) {
    console.log('[Chat] Error:', (error as Error).message);
    res.status(500).json({ error: (error as Error).message });
  }
}

