import { Agent, run, Runner, type InputGuardrail } from "@openai/agents";
import z from "zod";

const creditCardDetectionAgent = new Agent({
    name: 'Guardrail check',
    instructions: 
        `
        Check if the user's message contains a credit card number.
        If it does, return true. If it does not, return false.
        `,
    model: 'gpt-5-mini',
    outputType: z.object({
      containsCreditCardNumber: z.boolean(),
    }),
});

export function createCreditCardDetectionGuardrail(runner: Runner): InputGuardrail {
return {
    name: 'Credit Card Detection Guardrail',
    execute: async ({ input, context }) => {
      const result = await runner.run(creditCardDetectionAgent, input, { context });
      return {
        outputInfo: result.finalOutput,
        tripwireTriggered: result.finalOutput?.containsCreditCardNumber ?? false,
      };
    },
  };
}
