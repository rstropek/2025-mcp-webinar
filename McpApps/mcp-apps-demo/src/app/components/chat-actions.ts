/**
 * Chat-actions card. THE bidirectional showcase of MCP Apps.
 *
 * - "Ask AI to explain selected risks" → app.sendMessage()
 *     A *visible* user message is added to the chat. The host kicks off a new
 *     model turn just like a typed message. We pre-inject a richer markdown
 *     payload via updateModelContext() so the model has everything it needs
 *     even though the chat message itself stays short.
 *
 * - "Sync selection to model context (silent)" → app.updateModelContext()
 *     A *silent* update. No new chat turn is triggered, but the next time
 *     the user types something the model will already have context.
 *
 * - "Open runbook" → app.readServerResource()
 *     Reads a non-UI MCP resource (markdown) and renders it inside the App,
 *     proving the App is a small MCP client in its own right.
 *
 * - "Approve" → app.callServerTool() with a model-visible tool
 *     The host should treat this as a user-initiated, consent-gated action.
 */
import type { App } from "@modelcontextprotocol/ext-apps";
import { buildSelectionMarkdown, getState, setState } from "../state.js";

export function mountChatActions(app: App, setLastAction: (msg: string, kind?: "ok" | "err") => void): void {
  const askExplainBtn = document.getElementById("ask-explain") as HTMLButtonElement;
  const askRewriteBtn = document.getElementById("ask-rewrite") as HTMLButtonElement;
  const syncBtn = document.getElementById("sync-context") as HTMLButtonElement;
  const runbookBtn = document.getElementById("open-runbook") as HTMLButtonElement;
  const runbookOutput = document.getElementById("runbook-output")!;

  const approveBtn = document.getElementById("approve-btn") as HTMLButtonElement;
  const approverInput = document.getElementById("approver") as HTMLInputElement;
  const commentInput = document.getElementById("approval-comment") as HTMLInputElement;
  const approvalOutput = document.getElementById("approval-output")!;

  // -------- UI → chat (visible follow-up message) --------
  askExplainBtn.addEventListener("click", async () => {
    try {
      // 1. push selection silently as model context
      await app.updateModelContext({
        content: [{ type: "text", text: buildSelectionMarkdown() }],
      });
      // 2. then post a brief chat message that triggers a model turn
      await app.sendMessage({
        role: "user",
        content: [
          {
            type: "text",
            text: "Explain why the risks I selected in the cockpit matter for this rollout, and quantify the impact.",
          },
        ],
      });
      setLastAction("Asked AI to explain selected risks", "ok");
    } catch (err) {
      setLastAction(`sendMessage failed: ${(err as Error).message}`, "err");
    }
  });

  askRewriteBtn.addEventListener("click", async () => {
    try {
      await app.updateModelContext({
        content: [{ type: "text", text: buildSelectionMarkdown() }],
      });
      await app.sendMessage({
        role: "user",
        content: [
          {
            type: "text",
            text: "Rewrite the rollback plan based on my current cockpit selection, keeping it under 6 steps.",
          },
        ],
      });
      setLastAction("Asked AI to rewrite rollback plan", "ok");
    } catch (err) {
      setLastAction(`sendMessage failed: ${(err as Error).message}`, "err");
    }
  });

  // -------- UI → model context (silent) --------
  syncBtn.addEventListener("click", async () => {
    try {
      await app.updateModelContext({
        content: [{ type: "text", text: buildSelectionMarkdown() }],
      });
      setLastAction("Selection synced to model context (silent)", "ok");
    } catch (err) {
      setLastAction(`updateModelContext failed: ${(err as Error).message}`, "err");
    }
  });

  // -------- App reads a server resource (non-UI) --------
  runbookBtn.addEventListener("click", async () => {
    runbookOutput.textContent = "Loading runbook…";
    try {
      const uri = getState().plan?.runbookResourceUri;
      if (!uri) {
        runbookOutput.textContent = "No runbook URI on plan.";
        return;
      }
      const result = await app.readServerResource({ uri });
      const text = result.contents
        .map((c) => ("text" in c && typeof c.text === "string" ? c.text : ""))
        .join("\n\n");
      runbookOutput.textContent = text || "(empty runbook)";
      setLastAction("Loaded runbook resource", "ok");
    } catch (err) {
      runbookOutput.textContent = `Error: ${(err as Error).message}`;
      setLastAction("readServerResource failed", "err");
    }
  });

  // -------- Approval flow (model+app tool, user-initiated) --------
  approveBtn.addEventListener("click", async () => {
    const plan = getState().plan;
    if (!plan) return;
    const approver = approverInput.value.trim() || "unknown";
    const comment = commentInput.value.trim() || undefined;
    approvalOutput.textContent = "Requesting approval…";
    try {
      const result = await app.callServerTool({
        name: "approve-rollout",
        arguments: { feature: plan.feature, approver, comment },
      });
      if (result.isError) {
        approvalOutput.textContent = JSON.stringify(result.content, null, 2);
        setLastAction("Approval rejected by host", "err");
        return;
      }
      const data = result.structuredContent as
        | { ticket: string; approvedAt: string }
        | undefined;
      approvalOutput.textContent = data
        ? `Approved → ticket ${data.ticket} at ${data.approvedAt}`
        : (result.content?.[0] as { text?: string } | undefined)?.text ?? "Approved";

      // After an approval, also send a follow-up chat message so the model
      // knows the rollout was approved (great for downstream automation).
      await app.sendMessage({
        role: "user",
        content: [
          {
            type: "text",
            text: `Approved rollout for ${plan.feature}${comment ? ` — note: "${comment}"` : ""}. Please confirm next steps.`,
          },
        ],
      });
      setLastAction("Rollout approved", "ok");
      setState({ selection: { ...getState().selection, note: comment } });
    } catch (err) {
      approvalOutput.textContent = `Error: ${(err as Error).message}`;
      setLastAction("Approval failed", "err");
    }
  });
}
