import { InputGuardrailTripwireTriggered, MCPServerStdio, Runner } from '@openai/agents';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import chalk from 'chalk';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrchestratorAgent } from './agents/orchestrator.js';
import { createRestaurantAgent } from './agents/restaurant.js';
import type { ParsedResponseStreamEvent } from 'openai/lib/responses/EventTypes.js';
import { createBikeRentalAgent } from './agents/bike-rental.js';
import { createCreditCardDetectionGuardrail } from './agents/credit-card-detection.js';

dotenv.config();

const client = new OpenAI();
const { id: conversationId } = await client.conversations.create({});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(__dirname, 'menu');
const mcpServer = new MCPServerStdio({
    name: 'Filesystem MCP Server',
    fullCommand: `npx -y @modelcontextprotocol/server-filesystem ${samplesDir}`,
});
await mcpServer.connect();

const runner = new Runner({
    workflowName: `Hotel_AI_${new Date().toISOString().replace(/[:.]/g, '_')}`,
});

const creditCardDetectionGuardrail = createCreditCardDetectionGuardrail(runner);
const restaurantAgent = createRestaurantAgent(mcpServer, creditCardDetectionGuardrail);
const bikeRentalAgent = createBikeRentalAgent();
const orchestratorAgent = createOrchestratorAgent(bikeRentalAgent, restaurantAgent);
bikeRentalAgent.handoffs.push(orchestratorAgent);
restaurantAgent.handoffs.push(orchestratorAgent);
let currentAgent = orchestratorAgent;

const rl = readline.promises.createInterface({ input, output });
while (true) {
    const command = await rl.question('You (quit to exit)> ');
    if (command === 'quit') { break; }

    try {
        const result = await runner.run(currentAgent, command, {
            stream: true,
            conversationId,
        });

        for await (const event of result) {
            if (event.type === 'raw_model_stream_event') {
                if (event.data.type === 'model') {
                    const ev = event.data.event as ParsedResponseStreamEvent;
                    switch (ev.type) {
                        case 'response.output_text.delta':
                            process.stdout.write(ev.delta);
                            break;
                        case 'response.output_text.done':
                            console.log();
                            break;
                        case 'response.output_item.done':
                            const item = ev.item;
                            if (item.type === 'function_call') {
                                console.log(`\n${chalk.bgGreen(item.name)}(${JSON.stringify(item.arguments)})\n`);
                            }
                            break;
                    }
                }
            }
        }

        currentAgent = result.lastAgent ?? orchestratorAgent;
    } catch (error) {
        if (error instanceof InputGuardrailTripwireTriggered) {
            console.error(chalk.bgRed.white('NEVER enter credit card data into the system!'));
            console.error('Conversation terminated, please restart if necessary.');
            break;
        }

        throw error;
    }
}

await mcpServer.close();
rl.close();
