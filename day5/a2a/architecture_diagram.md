# A2A Multi-Turn Conversation Architecture

## Component Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                            CLIENT (client.ts)                        │
│                                                                      │
│  State:                                                              │
│  ┌────────────────────────────────────────┐                          │
│  │ contextId: string | undefined          │                          │
│  │ taskId: string | undefined             │                          │
│  └────────────────────────────────────────┘                          │
│                                                                      │
│  On each message:                                                    │
│  1. Read user input                                                  │
│  2. Send message with contextId + taskId (if have them)              │
│  3. Receive response                                                 │
│  4. Extract and store contextId + taskId from response               │
│  5. Display agent's message                                          │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ HTTP POST /send-message
                                  │ { message: {...}, contextId?, taskId? }
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    SERVER (server.ts + A2A SDK)                      │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │          A2AExpressApp (HTTP endpoint handler)                 │  │
│  │  • Receives HTTP requests                                      │  │
│  │  • Routes to DefaultRequestHandler                             │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                              ↓                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │             DefaultRequestHandler (orchestrator)               │  │
│  │                                                                │  │
│  │  BEFORE executing:                                             │  │
│  │  1. Extract contextId/taskId from request                      │  │
│  │  2. Call taskStore.getTask(taskId) ────────┐                   │  │
│  │  3. Build RequestContext object:           │                   │  │
│  │     {                                      │                   │  │
│  │       taskId,                              │                   │  │
│  │       contextId,                           │                   │  │
│  │       userMessage,                         │                   │  │
│  │       task ← from store (or null)          │                   │  │
│  │     }                                      │                   │  │
│  │  4. Call executor.execute()                │                   │  │
│  │                                            │                   │  │
│  │  AFTER executing:                          │                   │  │
│  │  5. Listen to EventBus                     │                   │  │
│  │  6. Update taskStore with new messages ────┘                   │  │
│  │  7. Return response to client                                  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                    │                              ↑                  │
│                    │ RequestContext               │ EventBus         │
│                    ↓                              │ publishes        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │         PizzaOrderExecutor (your agent logic)                  │  │
│  │                                                                │  │
│  │  execute(requestContext, eventBus) {                           │  │
│  │    // 1. Access history from previous turns                    │  │
│  │    const history = [];                                         │  │
│  │    if (requestContext.task?.history) {                         │  │
│  │      for (const msg of requestContext.task.history) {          │  │
│  │        history.push(msg); ← PREVIOUS MESSAGES HERE!            │  │
│  │      }                                                         │  │
│  │    }                                                           │  │
│  │                                                                │  │
│  │    // 2. Add current message                                   │  │
│  │    history.push(requestContext.userMessage);                   │  │
│  │                                                                │  │
│  │    // 3. Send to LLM with full context                         │  │
│  │    const response = await openai.create({ input: history });   │  │
│  │                                                                │  │
│  │    // 4. Publish results                                       │  │
│  │    eventBus.publish(agentMessage); ───────┐                    │  │
│  │    eventBus.publish(statusUpdate);        │                    │  │
│  │  }                                        │                    │  │
│  └──────────────────────────────────────────────────────────────┬─┘  │
│                                              │                  │    │
│                                              │ Updates          │    │
│                                              ↓                  │    │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              InMemoryTaskStore (the "memory")                  │  │
│  │                                                                │  │
│  │  Data Structure: Map<taskId, Task>                             │  │
│  │                                                                │  │
│  │  {                                                             │  │
│  │    "task-abc": {                                               │  │
│  │      id: "task-abc",                                           │  │
│  │      contextId: "ctx-123",                                     │  │
│  │      status: { state: "input-required" },                      │  │
│  │      history: [                                                │  │
│  │        { role: "user", parts: [...], messageId: "msg-1" },     │  │
│  │        { role: "agent", parts: [...], messageId: "msg-2" },    │  │
│  │        { role: "user", parts: [...], messageId: "msg-3" },     │  │
│  │        ...                                                     │  │
│  │      ]                                                         │  │
│  │    },                                                          │  │
│  │    "task-def": { ... }                                         │  │
│  │  }                                                             │  │
│  │                                                                │  │
│  │  Methods:                                                      │  │
│  │  • getTask(taskId) → returns Task with full history            │  │
│  │  • createTask(task) → stores new task                          │  │
│  │  • updateTask(update) → adds messages to history               │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Sequence Diagram: Multi-Turn Flow

```
Turn 1: Initial Request
═══════════════════════

Client                   A2AExpressApp          DefaultRequestHandler          InMemoryTaskStore          PizzaOrderExecutor
  │                            │                           │                           │                           │
  │ "I want pizza"             │                           │                           │                           │
  │ (no contextId/taskId)      │                           │                           │                           │
  ├───────────────────────────>│                           │                           │                           │
  │                            │                           │                           │                           │
  │                            │  Process request          │                           │                           │
  │                            ├──────────────────────────>│                           │                           │
  │                            │                           │                           │                           │
  │                            │                           │  getTask(taskId)          │                           │
  │                            │                           ├──────────────────────────>│                           │
  │                            │                           │                           │                           │
  │                            │                           │  null (no task exists)    │                           │
  │                            │                           │<──────────────────────────┤                           │
  │                            │                           │                           │                           │
  │                            │                           │  Build RequestContext:    │                           │
  │                            │                           │  { task: null }           │                           │
  │                            │                           │                           │                           │
  │                            │                           │  execute(requestContext, eventBus)                    │
  │                            │                           ├──────────────────────────────────────────────────────>│
  │                            │                           │                           │                           │
  │                            │                           │                           │   Access history:         │
  │                            │                           │                           │   requestContext.task?    │
  │                            │                           │                           │   → null (no history!)    │
  │                            │                           │                           │                           │
  │                            │                           │                           │   Send to OpenAI:         │
  │                            │                           │                           │   [{ user: "I want pizza" }]
  │                            │                           │                           │                           │
  │                            │                           │                           │   Response: need more info│
  │                            │                           │                           │                           │
  │                            │                           │  eventBus.publish(task)   │                           │
  │                            │                           │<──────────────────────────────────────────────────────┤
  │                            │                           │                           │                           │
  │                            │                           │  createTask(task)         │                           │
  │                            │                           ├──────────────────────────>│                           │
  │                            │                           │                           │                           │
  │                            │                           │  Task stored with:        │                           │
  │                            │                           │  history = [userMsg]      │                           │
  │                            │                           │                           │                           │
  │                            │                           │  eventBus.publish(statusUpdate)                       │
  │                            │                           │<──────────────────────────────────────────────────────┤
  │                            │                           │                           │                           │
  │                            │                           │  updateTask(statusUpdate) │                           │
  │                            │                           ├──────────────────────────>│                           │
  │                            │                           │                           │                           │
  │                            │                           │  Task updated with:       │                           │
  │                            │                           │  history = [userMsg, agentMsg]                        │
  │                            │                           │                           │                           │
  │  Response: Task {          │                           │                           │                           │
  │    contextId: "ctx-123",   │                           │                           │                           │
  │    taskId: "task-abc",     │                           │                           │                           │
  │    status: "input-required"│                           │                           │                           │
  │  }                         │                           │                           │                           │
  │<───────────────────────────┤                           │                           │                           │
  │                            │                           │                           │                           │
  │  Store: contextId, taskId  │                           │                           │                           │
  │                            │                           │                           │                           │


Turn 2: Follow-up Request
═════════════════════════

Client                   A2AExpressApp          DefaultRequestHandler          InMemoryTaskStore          PizzaOrderExecutor
  │                            │                           │                           │                           │
  │ "Do you have pineapple?"   │                           │                           │                           │
  │ (with contextId + taskId)  │                           │                           │                           │
  ├───────────────────────────>│                           │                           │                           │
  │                            │                           │                           │                           │
  │                            │  Process request          │                           │                           │
  │                            ├──────────────────────────>│                           │                           │
  │                            │                           │                           │                           │
  │                            │                           │  getTask("task-abc")      │                           │
  │                            │                           ├──────────────────────────>│                           │
  │                            │                           │                           │                           │
  │                            │                           │  Return Task with:        │                           │
  │                            │                           │  history = [              │                           │
  │                            │                           │    userMsg1,              │                           │
  │                            │                           │    agentMsg1              │                           │
  │                            │                           │  ]                        │                           │
  │                            │                           │<──────────────────────────┤                           │
  │                            │                           │                           │                           │
  │                            │                           │  Build RequestContext:    │                           │
  │                            │                           │  { task: { history: [...] } }                         │
  │                            │                           │                           │                           │
  │                            │                           │  execute(requestContext, eventBus)                    │
  │                            │                           ├──────────────────────────────────────────────────────>│
  │                            │                           │                           │                           │
  │                            │                           │                           │   Access history:         │
  │                            │                           │                           │   requestContext.task     │
  │                            │                           │                           │   → HAS HISTORY! ✓        │
  │                            │                           │                           │                           │
  │                            │                           │                           │   Build conversation:     │
  │                            │                           │                           │   [                       │
  │                            │                           │                           │     { user: "I want pizza" }
  │                            │                           │                           │     { assistant: "What kind?" }
  │                            │                           │                           │     { user: "pineapple?" }│
  │                            │                           │                           │   ]                       │
  │                            │                           │                           │                           │
  │                            │                           │                           │   Send to OpenAI          │
  │                            │                           │                           │   with FULL CONTEXT!      │
  │                            │                           │                           │                           │
  │                            │                           │                           │   Response: Hawaiian!     │
  │                            │                           │                           │                           │
  │                            │                           │  eventBus.publish(completionMsg)                      │
  │                            │                           │<──────────────────────────────────────────────────────┤
  │                            │                           │                           │                           │
  │                            │                           │  updateTask(...)          │                           │
  │                            │                           ├──────────────────────────>│                           │
  │                            │                           │                           │                           │
  │                            │                           │  Task updated with:       │                           │
  │                            │                           │  history = [              │                           │
  │                            │                           │    userMsg1,              │                           │
  │                            │                           │    agentMsg1,             │                           │
  │                            │                           │    userMsg2,              │                           │
  │                            │                           │    agentMsg2              │                           │
  │                            │                           │  ]                        │                           │
  │                            │                           │  status: "completed"      │                           │
  │                            │                           │                           │                           │
  │  Response: Task {          │                           │                           │                           │
  │    status: "completed",    │                           │                           │                           │
  │    history: [...]          │                           │                           │                           │
  │  }                         │                           │                           │                           │
  │<───────────────────────────┤                           │                           │                           │
  │                            │                           │                           │                           │
  │  Clear: contextId, taskId  │                           │                           │                           │
  │  (conversation complete)   │                           │                           │                           │
  │                            │                           │                           │                           │
```
