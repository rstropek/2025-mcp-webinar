// server.ts
import express from "express";
import { v4 as uuidv4 } from "uuid";
import type { AgentCard, Message, Task, TaskStatusUpdateEvent } from "@a2a-js/sdk";
import {
  type AgentExecutor,
  RequestContext,
  type ExecutionEventBus,
  DefaultRequestHandler,
  InMemoryTaskStore,
} from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";
import dotenv from "dotenv";
import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming, ResponseInput } from "openai/resources/responses/responses.mjs";
import type { ResponseInputItem } from "openai/resources/responses/responses.js";
import z from "zod";
import { zodTextFormat } from "openai/helpers/zod.mjs";
dotenv.config();

const pizzaOrderAgentCard: AgentCard = {
  name: "Pizza Order Agent",
  description: "A simple agent that orders a pizza.",
  protocolVersion: "0.3.0",
  version: "0.1.0",
  url: "http://localhost:4000/", // The public URL of your agent server
  skills: [ 
    { id: "pizza-order", name: "Pizza Order", description: "Order a pizza", tags: ["pizza-order"] }
  ],
  capabilities: {
    streaming: true,
  },
  defaultInputModes: ['text'],
  defaultOutputModes: ['text', 'task-status'],
};

const orderedPizza = z.object({
  pizza: z.enum(['Margherita', 'Vegetarian', 'Hawaiian', '']).describe('The pizza you want to order. Empty if unknown'),
  question: z.string().describe('Message to send to the user to further clarify the order. Empty if not needed because the pizza is known.'),
});
type OrderedPizza = z.infer<typeof orderedPizza>;

class PizzaOrderExecutor implements AgentExecutor {
  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const systemPrompt = `
      You are a pizza order agent. You offer the following three pizzas:
      - Margherita
      - Vegetarian
      - Hawaiian (with pineapple)
      Find out what the user wants.
      `;
    
    // Build conversation history for OpenAI
    const conversationHistory: ResponseInput = [];
    
    // If there's an existing task, include previous messages from the history
    if (requestContext.task?.history) {
      for (const msg of requestContext.task.history) {
        conversationHistory.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.parts.map(p => p.kind === "text" ? p.text : JSON.stringify(p)).join('\n'),
        });
      }
    }
    
    // Add the current user message
    conversationHistory.push({
      role: 'user',
      content: requestContext.userMessage.parts.map(p => p.kind === "text" ? p.text : JSON.stringify(p)).join('\n'),
    });

    const openai = new OpenAI();
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: systemPrompt,
      stream: false,
      store: false,
      input: conversationHistory,
      text: {
        format: zodTextFormat(orderedPizza, 'orderedPizza'),
      }
    });

    const pizzaOrder = JSON.parse(response.output_text!) as OrderedPizza;
    if (pizzaOrder.pizza === '') {
      // Need more information - set task to input-required
      const agentMessage: Message = {
        kind: 'message',
        messageId: uuidv4(),
        role: 'agent',
        parts: [{ kind: 'text', text: pizzaOrder.question }],
        taskId: requestContext.taskId,
        contextId: requestContext.contextId,
      };

      if (!requestContext.task) {
        // First interaction - create initial task
        const initialTask: Task = {
          kind: 'task',
          id: requestContext.taskId,
          contextId: requestContext.contextId,
          status: {
            state: 'submitted',
            timestamp: new Date().toISOString(),
          },
          history: [requestContext.userMessage],
        };
        eventBus.publish(initialTask);
      }

      const responseMessage: TaskStatusUpdateEvent = {
        taskId: requestContext.taskId,
        contextId: requestContext.contextId,
        final: true,
        kind: "status-update",
        status: {
          state: 'input-required',
          timestamp: new Date().toISOString(),
          message: agentMessage,
        }
      };
      eventBus.publish(responseMessage);
    } else {
      // Pizza identified - complete the order
      const responseMessage: Message = {
        kind: "message",
        taskId: requestContext.taskId,
        messageId: uuidv4(),
        role: "agent",
        parts: [{ kind: "text", text: `Got it, you will get your ${pizzaOrder.pizza} pizza right away!` }],
        contextId: requestContext.contextId,
      };
      eventBus.publish(responseMessage);

      const finalUpdate: TaskStatusUpdateEvent = {
        kind: "status-update",
        taskId: requestContext.taskId,
        contextId: requestContext.contextId,
        status: { state: "completed", timestamp: new Date().toISOString() },
        final: true,
      };
      eventBus.publish(finalUpdate);
    }
    eventBus.finished();
  }
  
  // cancelTask is not needed for this simple, non-stateful agent.
  cancelTask = async (): Promise<void> => {};
}

// 3. Set up and run the server.
const agentExecutor = new PizzaOrderExecutor();
const requestHandler = new DefaultRequestHandler(
  pizzaOrderAgentCard,
  new InMemoryTaskStore(),
  agentExecutor
);

const appBuilder = new A2AExpressApp(requestHandler);
const expressApp = appBuilder.setupRoutes(express());

expressApp.listen(4000, () => {
  console.log(`🚀 Server started on http://localhost:4000`);
});