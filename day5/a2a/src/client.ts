// client.ts
import { ClientFactory } from "@a2a-js/sdk/client";
import { type Message, type Part, Role, type SendMessageRequest, TaskState, taskStateToJSON } from "@a2a-js/sdk";
import { v4 as uuidv4 } from "uuid";
import readline from "readline";

const rl = readline.promises.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// A2A v1.0: parts carry their content as a oneof discriminated by `$case`
function partsToText(parts: Part[] | undefined): string {
  const content = parts?.[0]?.content;
  return content?.$case === "text" ? content.value : "No content";
}

async function run() {
  // Create a client from the agent's base URL. The factory downloads the
  // Agent Card (/.well-known/agent-card.json) and picks a matching transport.
  const client = await new ClientFactory().createFromUrl("http://localhost:4000");

  // Track contextId and taskId for multi-turn conversations
  let contextId = "";
  let taskId = "";

  while (true) {
    const userInput = await rl.question("> ");

    if (userInput.trim().toLowerCase() === 'exit') {
      console.log("Goodbye!");
      break;
    }

    // Build the message request with the user input
    const sendParams: SendMessageRequest = {
      tenant: "",
      message: {
        messageId: uuidv4(),
        role: Role.ROLE_USER,
        parts: [{ content: { $case: "text", value: userInput }, mediaType: "text/plain", filename: "", metadata: undefined }],
        contextId, // Empty if we start a new conversation
        taskId, // Empty if there is no task yet
        metadata: undefined,
        extensions: [],
        referenceTaskIds: [],
      },
      configuration: undefined,
      metadata: undefined,
    };

    try {
      const result = await client.sendMessage(sendParams);

      // Check if the agent's response is a Task or a direct Message.
      if ("status" in result) {
        const task = result;

        // Store contextId and taskId for the next turn
        contextId = task.contextId;
        taskId = task.id;

        console.log(`\n[Task ${taskStateToJSON(task.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED)}]`);
        console.log(`Agent: ${partsToText(task.status?.message?.parts)}\n`);

        // A task in a terminal state cannot receive further messages
        const terminalStates = [
          TaskState.TASK_STATE_COMPLETED,
          TaskState.TASK_STATE_FAILED,
          TaskState.TASK_STATE_CANCELED,
          TaskState.TASK_STATE_REJECTED,
        ];
        if (task.status && terminalStates.includes(task.status.state)) {
          console.log("Task finished! Starting fresh conversation.\n");
          // Reset context for new conversation
          contextId = "";
          taskId = "";
        }
      } else {
        const message = result as Message;
        console.log(`Agent: ${partsToText(message.parts)}\n`);
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
    }
  }
}

await run();
rl.close();
