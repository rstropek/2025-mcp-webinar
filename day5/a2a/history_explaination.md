# How Conversation History is Maintained in A2A

## The Players

### On the Server Side:
- **`InMemoryTaskStore`**: An in-memory database that stores tasks and their history
- **`DefaultRequestHandler`**: Middleware that handles incoming messages and manages the task store
- **`PizzaOrderExecutor`**: Your custom agent logic that processes messages
- **`ExecutionEventBus`**: A pub/sub system where you publish messages/updates

### On the Client Side:
- **`A2AClient`**: Sends messages and tracks `contextId`/`taskId`
- Your application loop maintains these IDs between requests


## The Complete Flow: Step by Step

### **Turn 1: "I want a pizza"**

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT                                                              │
├─────────────────────────────────────────────────────────────────────┤
│ User types: "I want a pizza"                                        │
│ contextId = undefined                                               │
│ taskId = undefined                                                  │
│                                                                     │
│ Sends HTTP POST to /send-message:                                   │
│ {                                                                   │
│   message: {                                                        │
│     messageId: "msg-001",                                           │
│     role: "user",                                                   │
│     parts: [{ kind: "text", text: "I want a pizza" }]               │
│   }                                                                 │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SERVER: DefaultRequestHandler (BEFORE your executor runs)           │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Receives the message                                             │
│ 2. No contextId provided → Generates NEW contextId: "ctx-abc123"    │
│ 3. No taskId provided → Generates NEW taskId: "task-xyz789"         │
│ 4. Checks InMemoryTaskStore.getTask("task-xyz789")                  │
│    → Returns null (task doesn't exist yet)                          │
│                                                                     │
│ 5. Creates RequestContext object:                                   │
│    {                                                                │
│      taskId: "task-xyz789",                                         │
│      contextId: "ctx-abc123",                                       │
│      userMessage: { ... the user's message ... },                   │
│      task: null  ← NO EXISTING TASK                                 │
│    }                                                                │
│                                                                     │
│ 6. Calls your PizzaOrderExecutor.execute(requestContext, eventBus)  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SERVER: PizzaOrderExecutor.execute()                                │
├─────────────────────────────────────────────────────────────────────┤
│ // Build conversation history                                       │
│ const conversationHistory = [];                                     │
│                                                                     │
│ if (requestContext.task?.history) {  // ← task is null!             │
│   // This block DOESN'T run on first turn                           │
│ }                                                                   │
│                                                                     │
│ // Add current user message                                         │
│ conversationHistory.push({                                          │
│   role: 'user',                                                     │
│   content: 'I want a pizza'                                         │
│ });                                                                 │
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
│ // First, create the initial task                                   │
│ const initialTask: Task = {                                         │
│   kind: 'task',                                                     │
│   id: 'task-xyz789',                                                │
│   contextId: 'ctx-abc123',                                          │
│   status: { state: 'submitted', timestamp: '...' },                 │
│   history: [                                                        │
│     {  // ← USER'S MESSAGE STORED IN HISTORY                        │
│       messageId: 'msg-001',                                         │
│       role: 'user',                                                 │
│       parts: [{ kind: 'text', text: 'I want a pizza' }]             │
│     }                                                               │
│   ]                                                                 │
│ };                                                                  │
│ eventBus.publish(initialTask);  ← SAVED TO INMEMORYTASKSTORE!       │
│                                                                     │
│ // Then, update status to input-required                            │
│ const statusUpdate: TaskStatusUpdateEvent = {                       │
│   taskId: 'task-xyz789',                                            │
│   contextId: 'ctx-abc123',                                          │
│   status: {                                                         │
│     state: 'input-required',                                        │
│     message: {                                                      │
│       messageId: 'msg-002',                                         │
│       role: 'agent',                                                │
│       parts: [{ kind: 'text', text: 'What kind of pizza?' }]        │
│     }                                                               │
│   }                                                                 │
│ };                                                                  │
│ eventBus.publish(statusUpdate);  ← UPDATES THE TASK IN STORE!       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SERVER: DefaultRequestHandler (AFTER your executor)                 │
├─────────────────────────────────────────────────────────────────────┤
│ The eventBus.publish() calls actually invoke methods like:          │
│   taskStore.createTask(initialTask)                                 │
│   taskStore.updateTask(statusUpdate)                                │
│                                                                     │
│ InMemoryTaskStore now contains:                                     │
│ {                                                                   │
│   "task-xyz789": {                                                  │
│     id: "task-xyz789",                                              │
│     contextId: "ctx-abc123",                                        │
│     status: { state: 'input-required', ... },                       │
│     history: [                                                      │
│       { role: 'user', parts: [{ text: 'I want a pizza' }] },        │
│       { role: 'agent', parts: [{ text: 'What kind of pizza?' }] }   │
│     ]  ← BOTH MESSAGES NOW IN HISTORY!                              │
│   }                                                                 │
│ }                                                                   │
│                                                                     │
│ Returns Task object to client                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT                                                              │
├─────────────────────────────────────────────────────────────────────┤
│ Receives Task with:                                                 │
│   task.id = "task-xyz789"                                           │
│   task.contextId = "ctx-abc123"                                     │
│   task.status.state = 'input-required'                              │
│                                                                     │
│ Stores for next turn:                                               │
│   contextId = "ctx-abc123"    ← REMEMBER THIS!                      │
│   taskId = "task-xyz789"      ← REMEMBER THIS!                      │
│                                                                     │
│ Displays: "Agent: What kind of pizza?"                              │
└─────────────────────────────────────────────────────────────────────┘

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
│ Sends HTTP POST to /send-message:                                   │
│ {                                                                   │
│   message: {                                                        │
│     messageId: "msg-003",                                           │
│     role: "user",                                                   │
│     contextId: "ctx-abc123",  ← INCLUDES CONTEXT!                   │
│     taskId: "task-xyz789",    ← INCLUDES TASK!                      │
│     parts: [{ kind: "text", text: "Do you have pineapple?" }]       │
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
│ 4. Calls InMemoryTaskStore.getTask("task-xyz789")                   │
│    → Returns EXISTING task!                                         │
│                                                                     │
│ 5. Creates RequestContext object:                                   │
│    {                                                                │
│      taskId: "task-xyz789",                                         │
│      contextId: "ctx-abc123",                                       │
│      userMessage: { ... the new user message ... },                 │
│      task: {                                                        │
│        id: "task-xyz789",                                           │
│        contextId: "ctx-abc123",                                     │
│        status: { state: 'input-required', ... },                    │
│        history: [                                                   │
│          { role: 'user', parts: [{ text: 'I want a pizza' }] },     │
│          { role: 'agent', parts: [{ text: 'What kind?' }] }         │
│        ]  ← PREVIOUS CONVERSATION LOADED FROM STORE!                │
│      }                                                              │
│    }                                                                │
│                                                                     │
│ 6. Calls your PizzaOrderExecutor.execute(requestContext, eventBus)  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SERVER: PizzaOrderExecutor.execute()                                │
├─────────────────────────────────────────────────────────────────────┤
│ // Build conversation history                                       │
│ const conversationHistory = [];                                     │
│                                                                     │
│ if (requestContext.task?.history) {  // ← task EXISTS now!          │
│   for (const msg of requestContext.task.history) {                  │
│     conversationHistory.push({                                      │
│       role: msg.role === 'user' ? 'user' : 'assistant',             │
│       content: msg.parts[0].text                                    │
│     });                                                             │
│   }                                                                 │
│ }                                                                   │
│ // conversationHistory now has:                                     │
│ // [                                                                │
│ //   { role: 'user', content: 'I want a pizza' },                   │
│ //   { role: 'assistant', content: 'What kind of pizza?' }          │
│ // ]                                                                │
│                                                                     │
│ // Add current user message                                         │
│ conversationHistory.push({                                          │
│   role: 'user',                                                     │
│   content: 'Do you have pineapple?'                                 │
│ });                                                                 │
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
│ // Pizza identified! Complete the task                              │
│ eventBus.publish({                                                  │
│   kind: 'message',                                                  │
│   role: 'agent',                                                    │
│   parts: [{ text: 'Got it, your Hawaiian pizza is ready!' }]        │
│ });                                                                 │
│                                                                     │
│ eventBus.publish({                                                  │
│   kind: 'status-update',                                            │
│   status: { state: 'completed' }                                    │
│ });                                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Insights

### 1. **InMemoryTaskStore is the "Memory"**
   - It's a simple in-memory dictionary: `Map<taskId, Task>`
   - Stores all tasks and their complete history
   - Persists ONLY while the server is running (lost on restart)

### 2. **DefaultRequestHandler is the "Librarian"**
   - When a request comes in with a `taskId`, it fetches the task from the store
   - Puts the task (with history) into `requestContext.task`
   - This happens BEFORE your executor runs

### 3. **Your Executor Accesses History via `requestContext.task?.history`**
   ```typescript
   if (requestContext.task?.history) {
     for (const msg of requestContext.task.history) {
       // Access previous messages here!
     }
   }
   ```

### 4. **EventBus Updates the Store Automatically**
   - When you call `eventBus.publish(message)`, it doesn't just send the message to the client
   - It ALSO updates the task in InMemoryTaskStore, adding messages to the history
   - This happens behind the scenes in DefaultRequestHandler

### 5. **Client Must Track and Send Back `contextId` and `taskId`**
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
    role: "user",
    parts: [{ kind: "text", text: "I want a pizza" }],
    kind: "message"
  },
  {
    messageId: "msg-002", 
    role: "agent",
    parts: [{ kind: "text", text: "What kind of pizza would you like?" }],
    kind: "message"
  },
  {
    messageId: "msg-003",
    role: "user", 
    parts: [{ kind: "text", text: "Do you have pineapple?" }],
    kind: "message"
  }
  // ... and so on
]
```

Every message published through the EventBus gets appended to this history automatically!

---

## Visual Summary: The Data Flow

```
Turn 1:
  Client → [No IDs] → Server
           Server generates: contextId, taskId
           Server creates: requestContext.task = null
           Executor: No history to access
           EventBus.publish() → Creates task in InMemoryTaskStore
  Client ← [Returns contextId, taskId] ← Server
  
  InMemoryTaskStore now contains:
    "task-xyz789" → { history: [userMsg1, agentMsg1] }

Turn 2:
  Client → [With contextId, taskId] → Server
           Server loads task from InMemoryTaskStore
           Server creates: requestContext.task = { history: [...] }
           Executor: CAN ACCESS requestContext.task.history!
           EventBus.publish() → Updates task in InMemoryTaskStore
  Client ← [Returns updated task] ← Server
  
  InMemoryTaskStore now contains:
    "task-xyz789" → { history: [userMsg1, agentMsg1, userMsg2, agentMsg2] }
```
