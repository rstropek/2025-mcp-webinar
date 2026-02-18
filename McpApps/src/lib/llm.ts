import OpenAI from 'openai';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export interface LLMResponse {
  text: string;
  toolCalls?: Array<{
    name: string;
    arguments: any;
  }>;
}

export class LLMClient {
  private openai: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    this.openai = new OpenAI({ apiKey });
    this.model = process.env.LLM_MODEL || 'gpt-4';
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMTool[],
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  ): Promise<LLMResponse> {
    return this.chatOpenAI(messages, tools, toolChoice);
  }

  private async chatOpenAI(
    messages: LLMMessage[],
    tools?: LLMTool[],
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  ): Promise<LLMResponse> {
    const openAIMessages: any[] = messages.map(msg => {
      const base: any = {
        role: msg.role,
        content: msg.content,
      };
      
      // Add tool_calls if present (for assistant messages)
      if (msg.tool_calls && msg.role === 'assistant') {
        base.tool_calls = msg.tool_calls.map(tc => ({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));
      }
      
      // Add tool_call_id if present (for tool messages)
      if (msg.tool_call_id && msg.role === 'tool') {
        base.tool_call_id = msg.tool_call_id;
      }
      
      // For tool messages, also include name
      if (msg.name && msg.role === 'tool') {
        base.name = msg.name;
      }
      
      return base;
    });

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: openAIMessages,
      tools: tools,
      tool_choice: toolChoice || (tools && tools.length > 0 ? 'auto' : undefined),
    });

    const message = response.choices[0]?.message;
    if (!message) {
      throw new Error('No response from OpenAI');
    }

    const result: LLMResponse = {
      text: message.content || '',
    };

    if (message.tool_calls && message.tool_calls.length > 0) {
      result.toolCalls = message.tool_calls
        .filter((tc): tc is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => 
          tc.type === 'function' && 'function' in tc
        )
        .map(tc => ({
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        }));
    }

    return result;
  }
}

