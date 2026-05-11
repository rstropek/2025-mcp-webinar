# Release Cockpit — Demo Walkthrough

A step-by-step script for a live demo (≈ 6–8 minutes). Each step describes **what to do**, **what you should see**, and **what to point out to the audience**.

---

## Setup (before the demo)

1. **Server running** in one terminal:

   ```bash
   npm run build && npm run serve
   ```

   Console should print `[release-cockpit] MCP server listening on http://localhost:3001/mcp`.

2. **Host configured:** `npx @mcpjam/inspector@latest`

3. **Fresh chat.** Start a new chat so the model context is clean.

> **Tip:** keep the prompts below copy-pasteable. Live typos kill the pacing.

---

## Act 1 · "The AI opens a real app inside the chat" (≈ 90 s)

### Step 1.1 — Send the prompt

**Type into the chat:**

> Open the release cockpit for feature `checkout.express_pay`, audience `EU customers`, scheduled for tomorrow morning.

**What you should see:**

* The chat briefly shows `Calling tool open-release-cockpit…`.
* Then a **cockpit panel appears inline in the chat**:
  * Header: `Release Cockpit · checkout.express_pay`
  * Sub-header: `for EU customers · scheduled <date>`
  * Pill `6 phases` top-right
  * Left column: **Rollout phases** with 6 sliders (Internal, Canary, Validation, Ramp-up, Scale, Full rollout)
  * Big **Approve & release** button with a name input
  * Right column: **Key risks** — 4 entries (mix of warn / danger / ok)
  * Footer pill: `connected`

**What to say:**

> "This isn't a screenshot or a markdown table. The server returned a real mini-frontend bundle, and the host rendered it inside a sandboxed iframe in the chat. The plan you see was returned **in the same response** as the tool call — `structuredContent` flows from `open-release-cockpit` straight into the UI's `ontoolresult` callback. No second round trip."

---

## Act 2 · "The user manipulates the UI directly" (≈ 60 s)

### Step 2.1 — Move phase sliders

**What to click:**

* Drag the **Ramp-up** slider to ~40 %.
* Drag the **Scale** slider to ~60 %.

**What you should see:**

* The slider value updates live (`40 %`, `60 %`).
* Footer status changes briefly (e.g. `ready`).

**What to say:**

> "Direct manipulation. No prompt, no chat round trip. The user collaborates with the data the AI just produced."

### Step 2.2 — Mark relevant risks

**What to click:**

* In the **Key risks** card, click **"Payment timeout spike at 10:32–10:41"** (severity `danger`).
* Click **"Error budget at 78 %"** (severity `warn`).

**What you should see:**

* Both rows visually mark themselves as selected.

**What to say:**

> "These clicks fire `app.updateModelContext()` — silently, no chat message. The model now has a markdown summary of exactly which risks the user cares about, but the chat history isn't polluted with raw payloads. Watch what happens next."

---

## Act 3 · "The model already knows what you selected" (≈ 60 s)

### Step 3.1 — Ask a follow-up

**Type:**

> Based on what I selected, what should we double-check before approving?

**What you should see:**

* The AI replies **as text in the chat** (no new UI panel).
* The reply explicitly references the two selected risks — e.g. "You marked the payment-timeout spike and the error-budget alert. Suggest checking the Stripe-EU status page and reserving a hotfix slot…"

**What to say:**

> "I never typed which risks I selected. The UI pushed that context to the model in the background via `update-model-context`. That's one of the defining capabilities of MCP Apps — bidirectional context, not just rendering."

---

## Act 4 · "App-only tools — invisible to the model" (optional, ≈ 30 s)

> *Skip if pressed for time. Most useful for technical audiences.*

**What to do:** point at the upcoming live-metrics card (or just describe it).

**What to say:**

> "The metrics you'll see in a moment are polled every 4 seconds via a tool called `poll-metrics`. That tool is registered with `visibility: ["app"]`, meaning the **model never sees it** in `tools/list` and never sees the polling responses. Same for `get-log-chunk`, which the log filter uses. Without app-only tools, every poll would flood the LLM context."

---

## Act 5 · "One-click approve, automatic switch to monitoring" (≈ 90 s)

### Step 5.1 — Enter approver

* In the `Your name` field next to the Approve button, type a name, e.g. `Daniel`.

### Step 5.2 — Approve

**What to click:**

* The big **Approve & release** button.

**What you should see (all automatic, no further chat input):**

1. Button briefly shows "Requesting approval…".
2. Approval output appears: `Approved → ticket REL-XXXX`.
3. **The plan view disappears**, replaced by the **Monitor screen**:
   * Green banner: `Released ✓ · ticket REL-XXXX` and `Monitoring the rollout for the next 60 minutes.`
   * **Live metrics grid**: error rate, p95 latency, checkout conversion, support tickets — values refresh every few seconds.
   * **Sparkline SVG** draws the recent error-rate history.
   * Right column: **Recent activity** (logs) with a filter input and a level dropdown.
   * Big button: **Hand back to AI · request executive summary**.
4. In the chat, **a follow-up user message appears automatically**, something like "Approved rollout for checkout.express_pay (ticket REL-XXXX). Now monitoring live metrics for 60 minutes." — the AI usually responds with a short confirmation.

**What to say:**

> "Three things happened in one click:
> 1. The server confirmed the release via the `approve-rollout` tool. This is a regular model+app tool, exactly the kind of thing a host should consent-gate before executing.
> 2. The UI **switched screens by itself** — no second prompt, no second model turn. That's a state machine inside the iframe.
> 3. The app sent a **visible follow-up message** back into the chat, so the conversation continues naturally. That's `app.sendMessage()`."

---

## Act 6 · "Live operations: filter logs" (≈ 45 s)

### Step 6.1 — Filter logs

**Type into the filter input** (right side of the Activity card):

> payment

**What you should see:**

* The list narrows to entries containing "payment" (e.g. `payment timeout: stripe-eu` warnings).

### Step 6.2 — Set the level

**What to click:** the dropdown next to the filter → **errors**.

**What you should see:**

* List narrows further to error-level entries only.

**What to say:**

> "Each keystroke triggers `get-log-chunk` — also app-only. The host filters server-side, the model isn't bothered, and the chat history stays clean. Notice that the page never reloaded; the iframe is a tiny SPA."

---

## Act 7 · "Hand back to AI" (≈ 60 s)

### Step 7.1 — Request the summary

**What to click:** the **Hand back to AI · request executive summary** button.

**What you should see:**

* A user message appears in the chat: "Write an executive summary of this rollout: status, current metrics, top risks, and what to watch in the next hour."
* The AI replies with a structured executive summary — **as text in the chat**, not in the iframe.

**What to say:**

> "The transition from 'user with app' back to 'user with AI' is seamless. A button in the UI generates a chat message via `sendMessage`, and the conversation continues. The AI's response uses the context the cockpit has been quietly accumulating — risks the user marked, the approval ticket, the log filter — without us ever pasting any of that into the chat."

---

## Act 8 · "Fullscreen / display mode" (optional, ≈ 20 s)

**What to click:** the **⤢ Fullscreen** button in the top bar.

**What you should see:** the cockpit expands (if the host supports it; VS Code has experimental support).

**What to say:**

> "MCP Apps defines display modes (`inline`, `fullscreen`, `pip`). The app **requests** a mode; the host decides whether to grant it. The user keeps control."

---

## Reserve · "What if the host can't render MCP Apps?" (≈ 30 s)

**Without clicking, just say:**

> "If the host doesn't support MCP Apps — a headless CLI, an older client — the model still receives a fully-formed text response from `open-release-cockpit`: a markdown summary with phases, risks and rollback steps. Every tool follows the same pattern. Graceful degradation: no use-case is lost just because a host hasn't shipped MCP Apps yet."

---

## Cheat sheet · all prompts at a glance

```text
[Act 1]  Open the release cockpit for feature `checkout.express_pay`,
         audience `EU customers`, scheduled for tomorrow morning.

[Act 3]  Based on what I selected, what should we double-check
         before approving?

[Optional] Are there any risks in the current plan that you would
           personally want to escalate?
```

Plus the clicks:

* Drag the Ramp-up and Scale sliders
* Mark two risks
* Type approver name → **Approve & release**
* On the Monitor screen: filter `payment` → level `errors`
* Press **Hand back to AI**

---

## What this demo proves (capability checklist)

* [x] Tool with `_meta.ui.resourceUri` triggers the iframe render
* [x] `structuredContent` prefills the UI in the same response
* [x] App-only tools (`poll-metrics`, `get-log-chunk`) hidden from the model
* [x] Bidirectional context: silent `updateModelContext` from the UI
* [x] App-initiated chat messages: visible `sendMessage` after approval and "Hand back to AI"
* [x] Lifecycle / state machine: in-iframe Plan → Monitor transition without a model turn
* [x] iframe state survives remount via `sessionStorage`
* [x] Display modes (`inline` ⇄ `fullscreen`)
* [x] Theming: UI inherits host CSS variables
* [x] Auto-resize via `ResizeObserver`
* [x] Approval flow: `approve-rollout` is a model+app tool the host should consent-gate
* [x] Graceful degradation: every tool has a meaningful text fallback

---

## When something goes wrong (fallback plan)

| Symptom                                  | Quick fix                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Chat shows only text instead of the UI   | Set `chat.mcp.apps.enabled: true`, reload VS Code                         |
| `fetch failed`                           | Is `npm run serve` running? Try `127.0.0.1` instead of `localhost`        |
| `EADDRINUSE` on 3001                     | Kill the previous server, then restart                                    |
| UI stuck on "Waiting for plan…"          | Restart the MCP server in VS Code (`MCP: List Servers` → Restart)         |
| Model doesn't call the tool              | Be more explicit: "Use the `open-release-cockpit` tool to plan…"          |

---

**Shortest version (≈ 3 min):** Act 1 → Act 2.2 → Act 3 → Act 5 → Act 7. Enough to land the "aha" moment.
