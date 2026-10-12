# How Conversation History is Maintained in A2A

## The Players

### On the Server Side:
- **`InMemoryTaskStore`**: An in-memory database that stores tasks and their history
- **`DefaultRequestHandler`**: Middleware that handles incoming messages and manages the task store
- **`agentCardHandler` + `jsonRpcHandler`**: Express handlers that serve the Agent Card (`/.well-known/agent-card.json`) and the JSON-RPC endpoint (`/`, `UserBuilder.noAuthentication`)
- **`PizzaOrderExecutor`**: Your custom agent logic that processes messages
- **`ExecutionEventBus`**: A pub/sub system where you publish events created with `AgentEvent.task(...)`, `AgentEvent.statusUpdate(...)` and `AgentEvent.message(...)`

### On the Client Side:
- **`Client`** (created with `new ClientFactory().createFromUrl("http://localhost:4000")`): Downloads the Agent Card, picks a matching transport (JSON-RPC) and sends messages
- Your application loop tracks `contextId`/`taskId` and maintains these IDs between requests


## The Complete Flow: Step by Step

### **Turn 1: "I want a pizza"**

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT                                                              │
├─────────────────────────────────────────────────────────────────────┤
│ User types: "I want a pizza"                                        │
│ contextId = ""                                                      │
│ taskId = ""                                                         │
│                                                                     │
│ Calls client.sendMessage(sendParams) with a SendMessageRequest:     │
│ {                                                                   │
│   tenant: "",                                                       │
│   message: {                                                        │
│     messageId: "msg-001",                                           │
│     role: Role.ROLE_USER,                                           │
│     parts: [{                                                       │
│       content: { $case: "text", value: "I want a pizza" },          │
│       mediaType: "text/plain", ...                                  │
│     }],                                                             │
│     contextId: "", taskId: "", ...                                  │
│   },                                                                │
│   configuration: undefined,                                         │
│   metadata: undefined                                               │
│ }                                                                   │
│                                                                     │
│ On the wire: JSON-RPC POST to / with method "SendMessage":          │
│ {                                                                   │
│   "jsonrpc": "2.0", "id": 1, "method": "SendMessage",               │
│   "params": {                                                       │
│     "message": {                                                    │
│       "messageId": "msg-001",                                       │
│       "role": "ROLE_USER",                                          │
│       "parts": [{ "text": "I want a pizza" }]                       │
│     }                                                               │
│   }                                                                 │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SERVER: DefaultRequestHandler (BEFORE your executor runs)           │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Receives the message (via jsonRpcHandler)                        │
│ 2. No contextId provided → Generates NEW contextId: "ctx-abc123"    │
│ 3. No taskId provided → Generates NEW taskId: "task-xyz789"         │
│ 4. No taskId in the message → nothing to load from the              │
│    InMemoryTaskStore (task doesn't exist yet)                       │
│                                                                     │
│ 5. Creates RequestContext object:                                   │
│    {                                                                │
│      taskId: "task-xyz789",                                         │
│      contextId: "ctx-abc123",                                       │
│      userMessage: { ... the user's message ... },                   │
│      task: undefined  ← NO EXISTING TASK                            │
│    }                                                                │
│                                                                     │
│ 6. Calls your PizzaOrderExecutor.execute(requestContext, eventBus)  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SERVER: PizzaOrderExecutor.execute()                                │
├─────────────────────────────────────────────────────────────────────┤
│ // Build conversation history                                       │
│ const conversationHistory: ResponseInput = [];                      │
│                                                                     │
│ if (requestContext.task) {  // ← task is undefined!                 │
│   // This block DOESN'T run on first turn                           │
│ } else {                                                            │
│   // First turn: add current user message                           │
│   conversationHistory.push({                                        │
│     role: 'user',                                                   │
│     content: partsToText(requestContext.userMessage.parts)          │
│   });         // → 'I want a pizza'                                 │
│ }                                                                   │
│                                                                     │
│ // Send to OpenAI                                                   │
│ // OpenAI sees: [{ role: 'user', content: 'I want a pizza' }]       │
│                                                                     │
│ // OpenAI responds (parsed): { pizza: '', question: 'What kind?' }  │
│                                                                     │
│ // Pizza is unknown, so create task with input-required status      │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SERVER: PizzaOrderExecutor publishes to EventBus                    │
├─────────────────────────────────────────────────────────────────────┤
│ // A2A v1.0: every execution must START with a Task or a Message.   │
│ // First, create the initial task                                   │
│ const task: Task = {                                                │
│   id: 'task-xyz789',                                                │
│   contextId: 'ctx-abc123',                                          │
│   status: {                                                         │
│     state: TaskState.TASK_STATE_SUBMITTED,                          │
│     timestamp: '...',                                               │
│     message: undefined                                              │
│   },                                                                │
│   artifacts: [],                                                    │
│   history: [                                                        │
│     {  // ← USER'S MESSAGE STORED IN HISTORY                        │
│       messageId: 'msg-001',                                         │
│       role: Role.ROLE_USER,                                         │
│       parts: [{ content: { $case: 'text', value: 'I want a pizza' },│
│                 mediaType: 'text/plain', ... }]                     │
│     }                                                               │
│   ],                                                                │
│   metadata: undefined                                               │
│ };                                                                  │
│ eventBus.publish(AgentEvent.task(task));  ← SAVED TO TASK STORE!    │
│                                                                     │
│ // Then, update status to input-required (carrying the question)    │
│ eventBus.publish(AgentEvent.statusUpdate({                          │
│   taskId: 'task-xyz789',                                            │
│   contextId: 'ctx-abc123',                                          │
│   status: {                                                         │
│     state: TaskState.TASK_STATE_INPUT_REQUIRED,                     │
│     timestamp: '...',                                               │
│     message: {  // agentMessage(requestContext, pizzaOrder.question)│
│       messageId: 'msg-002',                                         │
│       role: Role.ROLE_AGENT,                                        │
│       parts: [{ content: { $case: 'text',                           │
│                            value: 'What kind of pizza?' }, ... }],  │
│       taskId: 'task-xyz789',                                        │
│       contextId: 'ctx-abc123'                                       │
│     }                                                               │
│   },                                                                │
│   metadata: undefined                                               │
│ }));  ← UPDATES THE TASK IN STORE! (no `final` flag in v1.0)        │
│                                                                     │
│ eventBus.finished();                                                │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SERVER: DefaultRequestHandler (while your executor runs)            │
├─────────────────────────────────────────────────────────────────────┤
│ The SDK processes the published events and calls:                   │
│   taskStore.save(task)  ← for AgentEvent.task(...)                  │
│   taskStore.save(task)  ← for AgentEvent.statusUpdate(...):         │
│                           sets task.status and appends              │
│                           status.message to task.history            │
│                                                                     │
│ InMemoryTaskStore now contains (parts shortened):                   │
│ {                                                                   │
│   "task-xyz789": {                                                  │
│     id: "task-xyz789",                                              │
│     contextId: "ctx-abc123",                                        │
│     status: { state: TASK_STATE_INPUT_REQUIRED, message: {...} },   │
│     history: [                                                      │
│       { role: ROLE_USER,  parts: [{ text: 'I want a pizza' }] },    │
│       { role: ROLE_AGENT, parts: [{ text: 'What kind of pizza?' }] }│
│     ]  ← BOTH MESSAGES NOW IN HISTORY!                              │
│   }                                                                 │
│ }                                                                   │
│                                                                     │
│ Returns the Task object to the client                               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT                                                              │
├─────────────────────────────────────────────────────────────────────┤
│ const result = await client.sendMessage(sendParams);                │
│ // result is Message | Task (no JSON-RPC envelope, errors throw)    │
│                                                                     │
│ "status" in result → it's a Task (a Message has no status)          │
│   task.id = "task-xyz789"                                           │
│   task.contextId = "ctx-abc123"                                     │
│   task.status.state = TaskState.TASK_STATE_INPUT_REQUIRED           │
│                                                                     │
│ Stores for next turn:                                               │
│   contextId = task.contextId  ← "ctx-abc123", REMEMBER THIS!        │
│   taskId = task.id            ← "task-xyz789", REMEMBER THIS!       │
│                                                                     │
│ Displays (taken from task.status.message):                          │
│   [Task TASK_STATE_INPUT_REQUIRED]                                  │
│   Agent: What kind of pizza?                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

### **Turn 2: "Do you have pineapple?"**

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT                                                              │
├─────────────────────────────────────────────────────────────────────┤
│ User types: "Do you have pineapple?"                                │
│ contextId = "ctx-abc123"  ← STILL HAS IT FROM TURN 1!               │
│ taskId = "task-xyz789"    ← STILL HAS IT FROM TURN 1!               │
│                                                                     │
│ Sends JSON-RPC POST to / with method "SendMessage":                 │
│ {                                                                   │
│   "message": {                                                      │
│     "messageId": "msg-003",                                         │
│     "role": "ROLE_USER",                                            │
│     "contextId": "ctx-abc123",  ← INCLUDES CONTEXT!                 │
│     "taskId": "task-xyz789",    ← INCLUDES TASK!                    │
│     "parts": [{ "text": "Do you have pineapple?" }]                 │
│   }                                                                 │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SERVER: DefaultRequestHandler (BEFORE your executor runs)           │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Receives the message                                             │
│ 2. contextId provided → Uses "ctx-abc123"                           │
│ 3. taskId provided → Uses "task-xyz789"                             │
│ 4. Calls InMemoryTaskStore.load("task-xyz789")                      │
│    → Returns EXISTING task!                                         │
│ 5. Appends the new user message to task.history and saves it        │
│                                                                     │
│ 6. Creates RequestContext object:                                   │
│    {                                                                │
│      taskId: "task-xyz789",                                         │
│      contextId: "ctx-abc123",                                       │
│      userMessage: { ... the new user message ... },                 │
│      task: {                                                        │
│        id: "task-xyz789",                                           │
│        contextId: "ctx-abc123",                                     │
│        status: { state: TASK_STATE_INPUT_REQUIRED, ... },           │
│        history: [                                                   │
│          { role: ROLE_USER,  parts: [{ text: 'I want a pizza' }] }, │
│          { role: ROLE_AGENT, parts: [{ text: 'What kind?' }] },     │
│          { role: ROLE_USER,  parts: [{ text: 'Do you have ...' }] } │
│        ]  ← PREVIOUS CONVERSATION LOADED FROM STORE!                │
│      }                                                              │
│    }                                                                │
│                                                                     │
│ 7. Calls your PizzaOrderExecutor.execute(requestContext, eventBus)  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SERVER: PizzaOrderExecutor.execute()                                │
├─────────────────────────────────────────────────────────────────────┤
│ // Build conversation history                                       │
│ const conversationHistory: ResponseInput = [];                      │
│                                                                     │
│ if (requestContext.task) {  // ← task EXISTS now!                   │
│   // History already contains the current user message, too         │
│   // (the request handler appended it before calling execute)       │
│   for (const msg of requestContext.task.history) {                  │
│     conversationHistory.push({                                      │
│       role: msg.role === Role.ROLE_USER ? 'user' : 'assistant',     │
│       content: partsToText(msg.parts)                               │
│     });                                                             │
│   }                                                                 │
│ } else {                                                            │
│   // First turn only: add the current user message                  │
│   conversationHistory.push({ role: 'user', content: ... });         │
│ }                                                                   │
│                                                                     │
│ // Send to OpenAI                                                   │
│ // OpenAI sees FULL CONVERSATION:                                   │
│ // [                                                                │
│ //   { role: 'user', content: 'I want a pizza' },                   │
│ //   { role: 'assistant', content: 'What kind of pizza?' },         │
│ //   { role: 'user', content: 'Do you have pineapple?' }            │
│ // ]                                                                │
│                                                                     │
│ // OpenAI can now understand context and responds:                  │
│ // { pizza: 'Hawaiian', question: '' }                              │
│                                                                     │
│ // Pizza identified! A2A v1.0: re-publish the existing task first   │
│ eventBus.publish(AgentEvent.task(requestContext.task));             │
│                                                                     │
│ // Then complete it - the reply travels in status.message           │
│ // (no separate Message event when a task exists)                   │
│ eventBus.publish(AgentEvent.statusUpdate({                          │
│   taskId: 'task-xyz789',                                            │
│   contextId: 'ctx-abc123',                                          │
│   status: {                                                         │
│     state: TaskState.TASK_STATE_COMPLETED,                          │
│     timestamp: '...',                                               │
│     message: agentMessage(requestContext,                           │
│       'Got it, you will get your Hawaiian pizza right away!')       │
│   },                                                                │
│   metadata: undefined                                               │
│ }));                                                                │
│                                                                     │
│ eventBus.finished();                                                │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT                                                              │
├─────────────────────────────────────────────────────────────────────┤
│ Receives Task with:                                                 │
│   task.status.state = TaskState.TASK_STATE_COMPLETED                │
│   task.status.message = the agent's final reply                     │
│                                                                     │
│ Displays:                                                           │
│   [Task TASK_STATE_COMPLETED]                                       │
│   Agent: Got it, you will get your Hawaiian pizza right away!       │
│                                                                     │
│ Task is completed → resets contextId = "" and taskId = ""           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Insights

### 1. **InMemoryTaskStore is the "Memory"**
   - Conceptually a simple in-memory dictionary: `Map<taskId, Task>` (the SDK keeps one per tenant and user, which is why `load` / `save` also receive a `ServerCallContext`)
   - Stores all tasks and their complete history (`load(taskId, context)` / `save(task, context)`)
   - Persists ONLY while the server is running (lost on restart)

### 2. **DefaultRequestHandler is the "Librarian"**
   - When a request comes in with a `taskId`, it loads the task from the store
   - It appends the incoming user message to `task.history`
   - Puts the task (with history) into `requestContext.task`
   - This happens BEFORE your executor runs

### 3. **Your Executor Accesses History via `requestContext.task.history`**
   ```typescript
   // On follow-up turns the history already includes the current user message
   if (requestContext.task) {
     for (const msg of requestContext.task.history) {
       // Access previous messages here!
       // msg.role === Role.ROLE_USER / Role.ROLE_AGENT
       // msg.parts[i].content?.$case === "text" → msg.parts[i].content.value
     }
   }
   ```

### 4. **EventBus Updates the Store Automatically**
   - When you call `eventBus.publish(AgentEvent.statusUpdate(...))`, it doesn't just send the update to the client
   - It ALSO updates the task in InMemoryTaskStore: the status is replaced and `status.message` is appended to the history
   - This happens behind the scenes in DefaultRequestHandler

### 5. **Every `execute()` Starts with a Task or a Message**
   - A2A v1.0 requires the first published event to be `AgentEvent.task(...)` or `AgentEvent.message(...)`
   - On follow-up turns, the executor re-publishes the existing task (`requestContext.task`) before the status update
   - If the pizza is already known in the very first message, no task is needed: the executor publishes only `AgentEvent.message(...)` and the client receives a plain `Message` (no `status`, so no IDs are stored)

### 6. **Client Must Track and Send Back `contextId` and `taskId`**
   - The server doesn't "remember" which client is which
   - HTTP is stateless!
   - The client MUST include these IDs in follow-up messages
   - If the client forgets these IDs, the server treats it as a NEW conversation

---

## What Gets Stored in History?

The `task.history` array contains **Message** objects from both user and agent:

```typescript
task.history = [
  {
    messageId: "msg-001",
    role: Role.ROLE_USER,
    parts: [{ content: { $case: "text", value: "I want a pizza" }, mediaType: "text/plain", ... }],
    contextId: "ctx-abc123",
    taskId: "task-xyz789"
  },
  {
    messageId: "msg-002",
    role: Role.ROLE_AGENT,
    parts: [{ content: { $case: "text", value: "What kind of pizza would you like?" }, mediaType: "text/plain", ... }],
    contextId: "ctx-abc123",
    taskId: "task-xyz789"
  },
  {
    messageId: "msg-003",
    role: Role.ROLE_USER,
    parts: [{ content: { $case: "text", value: "Do you have pineapple?" }, mediaType: "text/plain", ... }],
    contextId: "ctx-abc123",
    taskId: "task-xyz789"
  }
  // ... and so on
]
```

On the wire (JSON-RPC) the same message looks like
`{ "messageId": "msg-001", "role": "ROLE_USER", "parts": [{ "text": "I want a pizza" }], ... }`.

Every incoming user message and every `status.message` published through the EventBus gets appended to this history automatically!

---

## Visual Summary: The Data Flow

```
Turn 1:
  Client → [No IDs] → Server
           Server generates: contextId, taskId
           Server creates: requestContext.task = undefined
           Executor: No history to access
           EventBus.publish(AgentEvent.task(...)) → Creates task in InMemoryTaskStore
           EventBus.publish(AgentEvent.statusUpdate(...)) → INPUT_REQUIRED + question
  Client ← [Returns Task with contextId, id] ← Server

  InMemoryTaskStore now contains:
    "task-xyz789" → { history: [userMsg1, agentMsg1] }

Turn 2:
  Client → [With contextId, taskId] → Server
           Server loads task from InMemoryTaskStore, appends userMsg2
           Server creates: requestContext.task = { history: [...] }
           Executor: CAN ACCESS requestContext.task.history!
           EventBus.publish(AgentEvent.task(requestContext.task)) → re-publish task
           EventBus.publish(AgentEvent.statusUpdate(...)) → COMPLETED + reply
  Client ← [Returns updated Task, reply in task.status.message] ← Server

  InMemoryTaskStore now contains:
    "task-xyz789" → { history: [userMsg1, agentMsg1, userMsg2, agentMsg2] }
```
