# A2A Multi-Turn Conversation Architecture

## Component Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                            CLIENT (client.ts)                        │
│                                                                      │
│  Setup:                                                              │
│  client = await new ClientFactory().createFromUrl(                   │
│    "http://localhost:4000")  ← downloads the Agent Card first        │
│                                                                      │
│  State:                                                              │
│  ┌────────────────────────────────────────┐                          │
│  │ contextId: string  ("" = new convo)    │                          │
│  │ taskId: string     ("" = no task yet)  │                          │
│  └────────────────────────────────────────┘                          │
│                                                                      │
│  On each message:                                                    │
│  1. Read user input                                                  │
│  2. client.sendMessage(SendMessageRequest) with contextId + taskId   │
│  3. Receive result: Task | Message ("status" in result → Task)       │
│  4. Task: store task.contextId + task.id                             │
│  5. Display agent's reply from task.status.message                   │
│  6. TASK_STATE_COMPLETED → reset contextId + taskId                  │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ JSON-RPC POST /  (method: "SendMessage")
                                  │ { message: { role: "ROLE_USER",
                                  │   parts: [{ text }], contextId?, taskId? } }
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    SERVER (server.ts + A2A SDK)                      │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │          express app (HTTP endpoint handlers)                  │  │
│  │  • /.well-known/agent-card.json → agentCardHandler             │  │
│  │  • /  → jsonRpcHandler (UserBuilder.noAuthentication)          │  │
│  │  • Routes JSON-RPC requests to DefaultRequestHandler           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                              ↓                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │             DefaultRequestHandler (orchestrator)               │  │
│  │                                                                │  │
│  │  BEFORE executing:                                             │  │
│  │  1. Extract contextId/taskId from request                      │  │
│  │  2. If taskId: taskStore.load(taskId) ─────┐                   │  │
│  │     and append userMessage to its history  │                   │  │
│  │  3. Build RequestContext object:           │                   │  │
│  │     {                                      │                   │  │
│  │       taskId,                              │                   │  │
│  │       contextId,                           │                   │  │
│  │       userMessage,                         │                   │  │
│  │       task ← from store (or undefined)     │                   │  │
│  │     }                                      │                   │  │
│  │  4. Call executor.execute()                │                   │  │
│  │                                            │                   │  │
│  │  AFTER executing:                          │                   │  │
│  │  5. Listen to EventBus                     │                   │  │
│  │  6. taskStore.save(task) with new messages ┘                   │  │
│  │  7. Return Task or Message to client                           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                    │                              ↑                  │
│                    │ RequestContext               │ EventBus         │
│                    ↓                              │ publishes        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │         PizzaOrderExecutor (your agent logic)                  │  │
│  │                                                                │  │
│  │  execute(requestContext, eventBus) {                           │  │
│  │    // 1. Access history (follow-up turns)                      │  │
│  │    const history = [];                                         │  │
│  │    if (requestContext.task) {                                  │  │
│  │      for (const msg of requestContext.task.history) {          │  │
│  │        history.push(msg); ← ALL MESSAGES incl. current one!    │  │
│  │      }                                                         │  │
│  │    } else {                                                    │  │
│  │      // 2. First turn: only the current message                │  │
│  │      history.push(requestContext.userMessage);                 │  │
│  │    }                                                           │  │
│  │                                                                │  │
│  │    // 3. Send to LLM with full context                         │  │
│  │    const response = await openai.create({ input: history });   │  │
│  │                                                                │  │
│  │    // 4. Publish results - Task or Message ALWAYS first!       │  │
│  │    if (task) {   // existing task or new one                   │  │
│  │      eventBus.publish(AgentEvent.task(task)); ──┐              │  │
│  │      eventBus.publish(AgentEvent.statusUpdate(  │              │  │
│  │        { status: { state, message } }));        │              │  │
│  │    } else {      // pizza known right away      │              │  │
│  │      eventBus.publish(AgentEvent.message(msg));─┤              │  │
│  │    }                                            │              │  │
│  │    eventBus.finished();                         │              │  │
│  │  }                                              │              │  │
│  └──────────────────────────────────────────────────────────────┬─┘  │
│                                                    │            │    │
│                                                    │ Updates    │    │
│                                                    ↓            │    │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              InMemoryTaskStore (the "memory")                  │  │
│  │                                                                │  │
│  │  Data Structure: Map<taskId, Task>                             │  │
│  │                                                                │  │
│  │  {                                                             │  │
│  │    "task-abc": {                                               │  │
│  │      id: "task-abc",                                           │  │
│  │      contextId: "ctx-123",                                     │  │
│  │      status: {                                                 │  │
│  │        state: TaskState.TASK_STATE_INPUT_REQUIRED,             │  │
│  │        message: { role: Role.ROLE_AGENT, ... }                 │  │
│  │      },                                                        │  │
│  │      history: [                                                │  │
│  │        { role: Role.ROLE_USER, parts: [...], messageId: ... }, │  │
│  │        { role: Role.ROLE_AGENT, parts: [...], messageId: ... },│  │
│  │        { role: Role.ROLE_USER, parts: [...], messageId: ... }, │  │
│  │        ...                                                     │  │
│  │      ]                                                         │  │
│  │    },                                                          │  │
│  │    "task-def": { ... }                                         │  │
│  │  }                                                             │  │
│  │                                                                │  │
│  │  Methods:                                                      │  │
│  │  • load(taskId) → returns Task with full history               │  │
│  │  • save(task) → stores new or updated task                     │  │
│  │  • list(params) → lists stored tasks                           │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

> Parts in A2A v1.0 carry their content as a oneof:
> `{ content: { $case: "text", value: "..." }, mediaType: "text/plain", ... }`.
> On the wire (JSON-RPC) this becomes `{ "text": "..." }`, and enums are
> serialized as strings such as `"ROLE_USER"` or `"TASK_STATE_INPUT_REQUIRED"`.

---

## Sequence Diagram: Multi-Turn Flow

```
Turn 1: Initial Request
═══════════════════════

Client                 jsonRpcHandler           DefaultRequestHandler          InMemoryTaskStore          PizzaOrderExecutor
  │                            │                           │                           │                           │
  │ "I want pizza"             │                           │                           │                           │
  │ (no contextId/taskId)      │                           │                           │                           │
  ├───────────────────────────>│                           │                           │                           │
  │                            │                           │                           │                           │
  │                            │  SendMessage (JSON-RPC)   │                           │                           │
  │                            ├──────────────────────────>│                           │                           │
  │                            │                           │                           │                           │
  │                            │                           │  No taskId in message     │                           │
  │                            │                           │  → nothing to load        │                           │
  │                            │                           │  Generate NEW taskId      │                           │
  │                            │                           │  and contextId            │                           │
  │                            │                           │                           │                           │
  │                            │                           │  Build RequestContext:    │                           │
  │                            │                           │  { task: undefined }      │                           │
  │                            │                           │                           │                           │
  │                            │                           │  execute(requestContext, eventBus)                    │
  │                            │                           ├──────────────────────────────────────────────────────>│
  │                            │                           │                           │                           │
  │                            │                           │                           │   Access history:         │
  │                            │                           │                           │   requestContext.task?    │
  │                            │                           │                           │   → undefined, no history │
  │                            │                           │                           │                           │
  │                            │                           │                           │   Send to OpenAI:         │
  │                            │                           │                           │   [{ user: "I want pizza" }]
  │                            │                           │                           │                           │
  │                            │                           │                           │   Response: need more info│
  │                            │                           │                           │                           │
  │                            │                           │  eventBus.publish(AgentEvent.task(task))              │
  │                            │                           │<──────────────────────────────────────────────────────┤
  │                            │                           │                           │                           │
  │                            │                           │  save(task)               │                           │
  │                            │                           ├──────────────────────────>│                           │
  │                            │                           │                           │                           │
  │                            │                           │  Task stored with:        │                           │
  │                            │                           │  history = [userMsg]      │                           │
  │                            │                           │                           │                           │
  │                            │                           │  eventBus.publish(AgentEvent.statusUpdate(...))       │
  │                            │                           │<──────────────────────────────────────────────────────┤
  │                            │                           │    state: TASK_STATE_INPUT_REQUIRED                   │
  │                            │                           │    message: agentMsg (the question)                   │
  │                            │                           │                           │                           │
  │                            │                           │  save(task)               │                           │
  │                            │                           ├──────────────────────────>│                           │
  │                            │                           │                           │                           │
  │                            │                           │  Task updated with:       │                           │
  │                            │                           │  history = [userMsg, agentMsg]                        │
  │                            │                           │                           │                           │
  │                            │                           │  eventBus.finished()      │                           │
  │                            │                           │<──────────────────────────────────────────────────────┤
  │                            │                           │                           │                           │
  │ Response: Task {           │                           │                           │                           │
  │   id: "task-abc",          │                           │                           │                           │
  │   contextId: "ctx-123",    │                           │                           │                           │
  │   status: {                │                           │                           │                           │
  │     state: INPUT_REQUIRED, │                           │                           │                           │
  │     message: agentMsg      │                           │                           │                           │
  │   }                        │                           │                           │                           │
  │ }                          │                           │                           │                           │
  │<───────────────────────────┤                           │                           │                           │
  │                            │                           │                           │                           │
  │ Store: contextId, taskId   │                           │                           │                           │
  │                            │                           │                           │                           │


Turn 2: Follow-up Request
═════════════════════════

Client                 jsonRpcHandler           DefaultRequestHandler          InMemoryTaskStore          PizzaOrderExecutor
  │                            │                           │                           │                           │
  │ "Do you have pineapple?"   │                           │                           │                           │
  │ (with contextId + taskId)  │                           │                           │                           │
  ├───────────────────────────>│                           │                           │                           │
  │                            │                           │                           │                           │
  │                            │  SendMessage (JSON-RPC)   │                           │                           │
  │                            ├──────────────────────────>│                           │                           │
  │                            │                           │                           │                           │
  │                            │                           │  load("task-abc")         │                           │
  │                            │                           ├──────────────────────────>│                           │
  │                            │                           │                           │                           │
  │                            │                           │  Return Task with:        │                           │
  │                            │                           │  history = [              │                           │
  │                            │                           │    userMsg1,              │                           │
  │                            │                           │    agentMsg1              │                           │
  │                            │                           │  ]                        │                           │
  │                            │                           │<──────────────────────────┤                           │
  │                            │                           │                           │                           │
  │                            │                           │  history += userMsg2      │                           │
  │                            │                           │  save(task)               │                           │
  │                            │                           ├──────────────────────────>│                           │
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
  │                            │                           │  eventBus.publish(AgentEvent.task(requestContext.task))
  │                            │                           │<──────────────────────────────────────────────────────┤
  │                            │                           │  (re-publish the existing task first)                 │
  │                            │                           │                           │                           │
  │                            │                           │  eventBus.publish(AgentEvent.statusUpdate(...))       │
  │                            │                           │<──────────────────────────────────────────────────────┤
  │                            │                           │    state: TASK_STATE_COMPLETED                        │
  │                            │                           │    message: "Got it, ... Hawaiian pizza ..."          │
  │                            │                           │                           │                           │
  │                            │                           │  save(task)               │                           │
  │                            │                           ├──────────────────────────>│                           │
  │                            │                           │                           │                           │
  │                            │                           │  Task updated with:       │                           │
  │                            │                           │  history = [              │                           │
  │                            │                           │    userMsg1,              │                           │
  │                            │                           │    agentMsg1,             │                           │
  │                            │                           │    userMsg2,              │                           │
  │                            │                           │    agentMsg2              │                           │
  │                            │                           │  ]                        │                           │
  │                            │                           │  state: COMPLETED         │                           │
  │                            │                           │                           │                           │
  │                            │                           │  eventBus.finished()      │                           │
  │                            │                           │<──────────────────────────────────────────────────────┤
  │                            │                           │                           │                           │
  │ Response: Task {           │                           │                           │                           │
  │   status: {                │                           │                           │                           │
  │     state: COMPLETED,      │                           │                           │                           │
  │     message: agentMsg2     │                           │                           │                           │
  │   },                       │                           │                           │                           │
  │   history: [...]           │                           │                           │                           │
  │ }                          │                           │                           │                           │
  │<───────────────────────────┤                           │                           │                           │
  │                            │                           │                           │                           │
  │ Show task.status.message   │                           │                           │                           │
  │ Clear: contextId, taskId   │                           │                           │                           │
  │ (conversation complete)    │                           │                           │                           │
  │                            │                           │                           │                           │
```
