// server.ts
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { type AgentCard, type Message, type Part, Role, type Task, TaskState } from "@a2a-js/sdk";
import {
  AgentEvent,
  type AgentExecutor,
  type RequestContext,
  type ExecutionEventBus,
  DefaultRequestHandler,
  InMemoryTaskStore,
} from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import dotenv from "dotenv";
import OpenAI from "openai";
import type { Response as OpenAIResponse, ResponseInput } from "openai/resources/responses/responses";
import z from "zod";
import { zodTextFormat } from "openai/helpers/zod";
dotenv.config();

const pizzaOrderAgentCard: AgentCard = {
  name: "Pizza Order Agent",
  description: "A simple agent that orders a pizza.",
  version: "0.1.0",
  // A2A v1.0: the agent lists the URLs and protocol bindings it supports
  supportedInterfaces: [
    { url: "http://localhost:4000/", protocolBinding: "JSONRPC", protocolVersion: "1.0", tenant: "" },
  ],
  provider: undefined,
  skills: [
    {
      id: "pizza-order",
      name: "Pizza Order",
      description: "Order a pizza",
      tags: ["pizza-order"],
      examples: [],
      inputModes: [],
      outputModes: [],
      securityRequirements: [],
    },
  ],
  capabilities: {
    streaming: true,
    extensions: [],
  },
  securitySchemes: {},
  securityRequirements: [],
  signatures: [],
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
};

const orderedPizza = z.object({
  pizza: z.enum(['Margherita', 'Vegetarian', 'Hawaiian', '']).describe('The pizza you want to order. Empty if unknown'),
  question: z.string().describe('Message to send to the user to further clarify the order. Empty if not needed because the pizza is known.'),
});
type OrderedPizza = z.infer<typeof orderedPizza>;

// A2A v1.0: parts carry their content as a oneof discriminated by `$case`
function partsToText(parts: Part[]): string {
  return parts.map(p => p.content?.$case === "text" ? p.content.value : JSON.stringify(p)).join('\n');
}

// A message references a task only if a task exists (empty taskId = no task)
function agentMessage(requestContext: RequestContext, text: string, withTask = true): Message {
  return {
    messageId: uuidv4(),
    role: Role.ROLE_AGENT,
    parts: [{ content: { $case: "text", value: text }, mediaType: "text/plain", filename: "", metadata: undefined }],
    taskId: withTask ? requestContext.taskId : "",
    contextId: requestContext.contextId,
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  };
}

class PizzaOrderExecutor implements AgentExecutor {
  // LLM calls in flight, by task ID, so that cancelTask can abort them
  private readonly running = new Map<string, AbortController>();

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

    if (requestContext.task) {
      // Follow-up turn: the task history already contains all previous messages
      // AND the current user message (the request handler appends it before calling us)
      for (const msg of requestContext.task.history) {
        conversationHistory.push({
          role: msg.role === Role.ROLE_USER ? 'user' : 'assistant',
          content: partsToText(msg.parts),
        });
      }
    } else {
      // First turn: only the current user message
      conversationHistory.push({
        role: 'user',
        content: partsToText(requestContext.userMessage.parts),
      });
    }

    const openai = new OpenAI();
    const abort = new AbortController();
    this.running.set(requestContext.taskId, abort);
    let response: OpenAIResponse;
    try {
      response = await openai.responses.create({
        model: "gpt-5-mini",
        instructions: systemPrompt,
        stream: false,
        store: false,
        input: conversationHistory,
        text: {
          format: zodTextFormat(orderedPizza, 'orderedPizza'),
        }
      }, { signal: abort.signal });
    } catch (error) {
      if (!abort.signal.aborted || !requestContext.task) throw error;
      // cancelTask aborted the LLM call: report the task as canceled
      eventBus.publish(AgentEvent.task(requestContext.task));
      eventBus.publish(AgentEvent.statusUpdate({
        taskId: requestContext.taskId,
        contextId: requestContext.contextId,
        status: { state: TaskState.TASK_STATE_CANCELED, timestamp: new Date().toISOString(), message: undefined },
        metadata: undefined,
      }));
      eventBus.finished();
      return;
    } finally {
      this.running.delete(requestContext.taskId);
    }

    const pizzaOrder = JSON.parse(response.output_text) as OrderedPizza;

    // A2A v1.0: every execution must start with a Task or a Message event.
    // On follow-up turns we re-publish the existing task first.
    const task: Task | undefined = requestContext.task ?? (pizzaOrder.pizza === '' ? {
      // First interaction and we need more information - create initial task
      id: requestContext.taskId,
      contextId: requestContext.contextId,
      status: {
        state: TaskState.TASK_STATE_SUBMITTED,
        timestamp: new Date().toISOString(),
        message: undefined,
      },
      artifacts: [],
      history: [requestContext.userMessage],
      metadata: undefined,
    } : undefined);

    if (!task) {
      // Pizza identified in the very first message - a simple message is enough, no task needed
      eventBus.publish(AgentEvent.message(
        agentMessage(requestContext, `Got it, you will get your ${pizzaOrder.pizza} pizza right away!`, false)));
    } else {
      eventBus.publish(AgentEvent.task(task));

      // Need more information -> input-required, pizza identified -> completed
      eventBus.publish(AgentEvent.statusUpdate({
        taskId: requestContext.taskId,
        contextId: requestContext.contextId,
        status: pizzaOrder.pizza === '' ? {
          state: TaskState.TASK_STATE_INPUT_REQUIRED,
          timestamp: new Date().toISOString(),
          message: agentMessage(requestContext, pizzaOrder.question),
        } : {
          state: TaskState.TASK_STATE_COMPLETED,
          timestamp: new Date().toISOString(),
          message: agentMessage(requestContext, `Got it, you will get your ${pizzaOrder.pizza} pizza right away!`),
        },
        metadata: undefined,
      }));
    }
    eventBus.finished();
  }

  // The request handler only calls this while execute() is still running (waiting for the LLM).
  // A task that waits for user input (INPUT_REQUIRED) is marked as canceled by the handler itself.
  cancelTask = async (taskId: string): Promise<void> => {
    this.running.get(taskId)?.abort();
  };
}

// 3. Set up and run the server.
const agentExecutor = new PizzaOrderExecutor();
const requestHandler = new DefaultRequestHandler(
  pizzaOrderAgentCard,
  new InMemoryTaskStore(),
  agentExecutor
);

const expressApp = express();
expressApp.use("/.well-known/agent-card.json", agentCardHandler({ agentCardProvider: requestHandler }));
expressApp.use("/", jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));

expressApp.listen(4000, () => {
  console.log(`🚀 Server started on http://localhost:4000`);
});
