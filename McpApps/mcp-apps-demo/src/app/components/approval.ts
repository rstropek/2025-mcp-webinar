/**
 * Approval card on the Plan screen.
 *
 * On click:
 *   1. Calls the model+app visible `approve-rollout` tool. The host MAY
 *      surface a consent prompt before this is allowed.
 *   2. Shows the resulting ticket id inline.
 *   3. Switches the iframe view from Plan -> Monitor (in place, no second
 *      model turn required).
 *   4. Sends a brief follow-up message so the chat thread reflects the
 *      decision; the model can then continue the conversation if it wants.
 */
import type { App } from "@modelcontextprotocol/ext-apps";
import { getState } from "../state.js";

export interface ApprovalDeps {
  setView: (view: "plan" | "monitor") => void;
  setLastAction: (msg: string, kind?: "ok" | "err") => void;
  setApprovedHeadline: (ticket: string) => void;
}

export function mountApproval(app: App, deps: ApprovalDeps): void {
  const approveBtn = document.getElementById("approve-btn") as HTMLButtonElement;
  const approverInput = document.getElementById("approver") as HTMLInputElement;
  const approvalOutput = document.getElementById("approval-output")!;

  approveBtn.addEventListener("click", async () => {
    const plan = getState().plan;
    if (!plan) return;
    const approver = approverInput.value.trim() || "unknown";

    approveBtn.disabled = true;
    approvalOutput.textContent = "Requesting approval…";

    try {
      const result = await app.callServerTool({
        name: "approve-rollout",
        arguments: { feature: plan.feature, approver },
      });

      if (result.isError) {
        approveBtn.disabled = false;
        approvalOutput.textContent = "Approval was rejected.";
        deps.setLastAction("Approval rejected", "err");
        return;
      }

      const data = result.structuredContent as
        | { ticket: string; approvedAt: string }
        | undefined;
      const ticket = data?.ticket ?? "unknown";
      approvalOutput.textContent = `Approved → ticket ${ticket}`;
      deps.setApprovedHeadline(ticket);
      deps.setLastAction("Released", "ok");

      // In-place transition to the monitoring view. The user does NOT have to
      // type another prompt; the iframe simply swaps screens.
      deps.setView("monitor");

      // Tell the chat thread what happened so the model can continue the
      // story if the user keeps the conversation going. This is the
      // "visible follow-up" pattern from the MCP Apps spec.
      const msgResult = await app.sendMessage({
        role: "user",
        content: [
          {
            type: "text",
            text: `Approved rollout for ${plan.feature} (ticket ${ticket}). Now monitoring live metrics for 60 minutes.`,
          },
        ],
      });
      if (msgResult.isError) {
        deps.setLastAction("Approved, but host rejected chat follow-up", "err");
      }
    } catch (err) {
      approveBtn.disabled = false;
      approvalOutput.textContent = `Error: ${(err as Error).message}`;
      deps.setLastAction("Approval failed", "err");
    }
  });
}
