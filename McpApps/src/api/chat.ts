import { type Request, type Response } from 'express';
import { LLMClient } from '../lib/llm.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Helper function to generate ponies using LLM (similar to sampling)
async function generatePoniesWithSampling(): Promise<any[]> {
  console.log('\n=== GENERATING PONIES WITH SAMPLING ===');
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

    console.log(`Valid ponies: ${ponies.length}`);

    return ponies;
  } catch (error) {
    console.error('Error generating ponies:', error);
    console.error('Error stack:', (error as Error).stack);
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

    console.log('=== CHAT REQUEST ===');
    console.log('User message:', message);
    console.log('Conversation history length:', conversationHistory.length);

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const llm = new LLMClient();

      // Get available tools from registry
      const tools = Array.from(toolMetadata.values()).map(tool => {
        let parameters: any = { type: 'object', properties: {}, required: [] };
        if (tool.inputSchema) {
          if (typeof tool.inputSchema === 'object' && 
              (('_def' in tool.inputSchema) || ('shape' in tool.inputSchema))) {
            try {
              parameters = zodToJsonSchema(tool.inputSchema as any);
            } catch (error) {
              console.error(`Error converting Zod schema for tool ${tool.name}:`, error);
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

IMPORTANT: When a user asks to generate passwords, you MUST actually call the pony_password_batch tool. Do NOT just describe calling it - you must make the actual tool call.

You can extract preferences from the user's message like:
- Number of passwords (count) - default is 1 if user says "ein passwort" or "a password", otherwise 5
- Minimum length (minLength) - default is 16
- Whether they want special characters (special) - default is false

When you call the tool, it will show an interactive form to the user. You should call it with the appropriate parameters based on what the user requested.`,
      },
      ...conversationHistory,
      {
        role: 'user' as const,
        content: message,
      },
    ];
    
    console.log('\n=== CALLING LLM ===');
    console.log('Tools available:', tools.length);
    
    const response = await llm.chat(messages, tools.length > 0 ? tools : undefined);
    
    console.log('\n=== LLM RESPONSE ===');
    console.log('Response text:', response.text);
    console.log('Tool calls:', response.toolCalls ? JSON.stringify(response.toolCalls, null, 2) : 'none');

    // If LLM wants to call a tool, check if it has UI
    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolWithUI = response.toolCalls.find(tc => {
        const toolMeta = toolMetadata.get(tc.name);
        return toolMeta?.hasUI || false;
      });

      if (toolWithUI) {
        console.log('\n=== TOOL WITH UI DETECTED ===');
        console.log('Tool name:', toolWithUI.name);
        console.log('Tool arguments:', JSON.stringify(toolWithUI.arguments, null, 2));
        
        const toolMeta = toolMetadata.get(toolWithUI.name);
        const uiResource = toolMeta?.uiResource || null;
        
        console.log('UI Resource:', uiResource);
        console.log('Generating ponies with sampling...');
        
        // Generate ponies using sampling (similar to day2)
        let sampledPonies: any[] = [];
        try {
          
          sampledPonies = await generatePoniesWithSampling();
          console.log(`Generated ${sampledPonies.length} ponies via sampling`);
        } catch (error) {
          console.error('Error generating ponies with sampling:', error);
        }
        
        const uiMessage = `I'm showing you an interactive form to configure the password generation. Please fill out the form and submit it when you're ready.`;
        
        const responseData = {
          text: uiMessage,
          uiResource: uiResource,
          toolArgs: {
            ...toolWithUI.arguments,
            sampledPonies: sampledPonies, 
          },
        };
        
        console.log('\n=== SENDING RESPONSE (WITH UI) ===');
        console.log('Response data:', JSON.stringify(responseData, null, 2));
        
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
          // Call the tool handler directly
          const handler = toolHandlers.get(toolCall.name);
          if (!handler) {
            throw new Error(`Tool handler not found: ${toolCall.name}`);
          }
          
          const toolResult = await handler(toolCall.arguments);
          
          toolResults.push({
            tool_call_id: toolCallId,
            role: 'tool' as const,
            name: toolCall.name,
            content: JSON.stringify({ result: toolResult }),
          });
        } catch (error) {
          toolResults.push({
            tool_call_id: toolCallId,
            role: 'tool' as const,
            name: toolCall.name,
            content: JSON.stringify({ error: (error as Error).message }),
          });
        }
      }

      // Call LLM again with tool results
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

      console.log('\n=== FINAL RESPONSE (NO UI) ===');
      console.log('Response text:', finalResponse.text);
      
      res.json({
        text: finalResponse.text,
        uiResource: null,
        toolArgs: null,
      });
    } else {
      console.log('\n=== RESPONSE (NO TOOL CALLS) ===');
      console.log('Response text:', response.text);
      
      res.json({
        text: response.text,
        uiResource: null,
        toolArgs: null,
      });
    }
    
    console.log('\n=== CHAT REQUEST COMPLETE ===\n');
  } catch (error) {
    console.error('\n=== CHAT ERROR ===');
    console.error('Error:', error);
    console.error('Error message:', (error as Error).message);
    console.error('Error stack:', (error as Error).stack);
    res.status(500).json({ error: (error as Error).message });
  }
}

