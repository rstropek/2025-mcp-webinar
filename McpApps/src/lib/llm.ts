import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

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
  private openai?: OpenAI;
  private anthropic?: Anthropic;
  private provider: 'openai' | 'anthropic';
  private model: string;

  constructor() {
    this.provider = (process.env.LLM_PROVIDER as 'openai' | 'anthropic') || 'openai';
    this.model = process.env.LLM_MODEL || 'gpt-4';

    if (this.provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }
      this.openai = new OpenAI({ apiKey });
    } else if (this.provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required');
      }
      this.anthropic = new Anthropic({ apiKey });
    }
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMTool[],
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  ): Promise<LLMResponse> {
    if (this.provider === 'openai') {
      return this.chatOpenAI(messages, tools, toolChoice);
    } else {
      return this.chatAnthropic(messages, tools);
    }
  }

  private async chatOpenAI(
    messages: LLMMessage[],
    tools?: LLMTool[],
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  ): Promise<LLMResponse> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

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

  private async chatAnthropic(
    messages: LLMMessage[],
    tools?: LLMTool[]
  ): Promise<LLMResponse> {
    if (!this.anthropic) throw new Error('Anthropic client not initialized');

    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemMessage || undefined,
      messages: conversationMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })),
      tools: tools?.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      })),
    });

    const textContent = response.content.find(c => c.type === 'text');
    const toolUseContent = response.content.filter(c => c.type === 'tool_use');

    const result: LLMResponse = {
      text: textContent?.type === 'text' ? textContent.text : '',
    };

    if (toolUseContent.length > 0) {
      result.toolCalls = toolUseContent.map(tc => {
        if (tc.type === 'tool_use') {
          return {
            name: tc.name,
            arguments: tc.input,
          };
        }
        return { name: '', arguments: {} };
      }).filter(tc => tc.name);
    }

    return result;
  }
}

