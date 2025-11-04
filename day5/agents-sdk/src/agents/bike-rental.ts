import { Agent } from "@openai/agents";
import * as bikes from '../tools/bikes.js';
import { RECOMMENDED_PROMPT_PREFIX } from '@openai/agents-core/extensions';

/**
 * Demonstrates a GPT 5 agent with tools.
 * For more details see:
 * - https://openai.github.io/openai-agents-js/guides/agents/
 * - https://openai.github.io/openai-agents-js/guides/tools/
 * 
 * Note that OpenAI Agents SDK is not limited to GPT models. Custom
 * model providers are possible: https://openai.github.io/openai-agents-js/guides/models/#_top
 */

export function createBikeRentalAgent(): Agent {
    return new Agent({
        name: 'Bike Rental Agent',
        handoffDescription: 'This agent is responsible for bike rentals',
        model: 'gpt-5',
        modelSettings: {
            providerData: {
                reasoning: { effort: 'minimal' }
            }
        },
        instructions:
            `
            ${RECOMMENDED_PROMPT_PREFIX}

            You provide assistance with bike rentals at a hotel. 

            You can get available bikes, rent a bike and return a bike using the provided tools.

            Only assist with bike rentals. Do not offer additional services, even if they are 
            related to bike rentals (e.g. renting accessories). If the user asks about any
            other topics, handoff to the Orchestrator Agent.
            `,
        // Adding the tool to the agent
        tools: [bikes.getAvailableBikesTool, bikes.rentBikeTool, bikes.returnBikeTool],
        handoffs: [],
    });
}
