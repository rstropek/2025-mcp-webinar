// client.ts
import { A2AClient } from "@a2a-js/sdk/client";
import { type Message, type MessageSendParams, type SendMessageSuccessResponse, type Task } from "@a2a-js/sdk";
import { v4 as uuidv4 } from "uuid";
import readline from "readline";

const rl = readline.promises.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function run() {
  // Create a client pointing to the agent's Agent Card URL.
  const client = await A2AClient.fromCardUrl("http://localhost:4000/.well-known/agent-card.json");

  // Track contextId and taskId for multi-turn conversations
  let contextId: string | undefined = undefined;
  let taskId: string | undefined = undefined;

  while (true) {
    const userInput = await rl.question("> ");
    
    if (userInput.trim().toLowerCase() === 'exit') {
      console.log("Goodbye!");
      break;
    }

    // Build the message params with the user input
    const sendParams: MessageSendParams = {
      message: {
        messageId: uuidv4(),
        role: "user",
        parts: [{ kind: "text", text: userInput }],
        kind: "message",
        ...(contextId && { contextId }), // Include contextId if we have one
        ...(taskId && { taskId }), // Include taskId if we have one
      },
    };

    const response = await client.sendMessage(sendParams);

    if ("error" in response) {
      console.error("Error:", response.error.message);
    } else {
      const result = (response as SendMessageSuccessResponse).result;

      // Check if the agent's response is a Task or a direct Message.
      if (result.kind === "task") {
        const task = result as Task;
        
        // Store contextId and taskId for the next turn
        contextId = task.contextId;
        taskId = task.id;
        
        console.log(`\n[Task ${task.status.state}]`);

        if (task.status.state === 'input-required' && task.status.message) {
          const message = task.status.message as Message;
          const agentText = message.parts[0]?.kind === 'text' ? message.parts[0]?.text : 'No content';
          console.log(`Agent: ${agentText}\n`);
        } else if (task.status.state === 'completed') {
          // Look for the last agent message in history
          if (task.history && task.history.length > 0) {
            const lastMessage = task.history[task.history.length - 1];
            if (lastMessage && lastMessage.role === 'agent' && lastMessage.parts[0]?.kind === 'text') {
              console.log(`Agent: ${lastMessage.parts[0].text}\n`);
            }
          }
          console.log("Task completed! Starting fresh conversation.\n");
          // Reset context for new conversation
          contextId = undefined;
          taskId = undefined;
        }
      } else {
        const message = result as Message;
        
        // Store contextId and taskId from the message
        if (message.contextId) contextId = message.contextId;
        if (message.taskId) taskId = message.taskId;
        
        const agentText = message.parts[0]?.kind === 'text' ? message.parts[0]?.text : 'No content';
        console.log(`Agent: ${agentText}\n`);
      }
    }
  }
}

await run();
rl.close();
