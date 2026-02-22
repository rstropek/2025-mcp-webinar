/**
 * Pony Password MCP App — for VS Code, Claude, ChatGPT.
 * Uses @modelcontextprotocol/ext-apps: ontoolinput (pre-fill from model), callServerTool (submit).
 */
import { App, applyDocumentTheme, type McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import './mcp-app.css';

const DEFAULTS = { count: 5, minLength: 16, special: false };

const mainEl = document.querySelector('.container') as HTMLElement;
const countEl = document.getElementById('count') as HTMLInputElement;
const minLengthEl = document.getElementById('minLength') as HTMLInputElement;
const specialEl = document.getElementById('special') as HTMLInputElement;
const poniesGrid = document.getElementById('poniesGrid')!;
const resultDiv = document.getElementById('result')!;
const errorDiv = document.getElementById('error')!;
const form = document.getElementById('passwordForm') as HTMLFormElement;
const generateBtn = document.getElementById('generateBtn')!;

let allPonies: Array<{ first: string; last?: string }> = [];
let lastToolArgs: Record<string, unknown> | undefined;
const generatedPasswordRuns: string[][] = [];

function applyInitialData(args: Record<string, unknown> | undefined) {
  lastToolArgs = args;
  const d = args ?? {};
  const count = Math.min(50, Math.max(1, Number(d.count) || DEFAULTS.count));
  const minLength = Math.max(1, Number(d.minLength) || DEFAULTS.minLength);
  const special = d.special === true;
  const selectedPonies = Array.isArray(d.selectedPonies) ? (d.selectedPonies as string[]) : [];
  const sampledPonies = Array.isArray(d.sampledPonies)
    ? (d.sampledPonies as Array<{ first: string; last?: string }>)
    : null;
  if (countEl) countEl.value = String(count);
  if (minLengthEl) minLengthEl.value = String(minLength);
  if (specialEl) specialEl.checked = special;
  const poniesToShow = sampledPonies?.length ? sampledPonies : allPonies;
  if (poniesToShow.length > 0) renderPonies(poniesToShow, selectedPonies);
}

function renderPonies(ponies: Array<{ first: string; last?: string }>, selectedPonies: string[]) {
  poniesGrid.innerHTML = '';
  if (!ponies.length) return;
  const format = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2');
  ponies.forEach((pony) => {
    const fullName = pony.last ? pony.first + pony.last.replace(/\s+/g, '') : pony.first;
    const displayName = pony.last ? pony.first + ' ' + pony.last : format(pony.first);
    const isSelected = selectedPonies.includes(fullName);
    const div = document.createElement('div');
    div.className = 'pony-checkbox';
    div.innerHTML = `<input type="checkbox" id="pony-${fullName}" value="${fullName}" ${isSelected ? 'checked' : ''}><label for="pony-${fullName}">${displayName}</label>`;
    poniesGrid.appendChild(div);
  });
}

function showPasswords(passwords: string[]) {
  errorDiv.style.display = 'none';
  resultDiv.innerHTML = '<h3>Generated Passwords:</h3>' + passwords.map((p) => `<div class="password">${p}</div>`).join('');
  resultDiv.style.display = 'block';
}
function showHostStatus(message: string) {
  const existing = resultDiv.querySelector('[data-host-status]');
  if (existing) existing.remove();
  const statusDiv = document.createElement('div');
  statusDiv.className = 'password';
  statusDiv.setAttribute('data-host-status', 'true');
  statusDiv.textContent = `Delivery status: ${message}`;
  resultDiv.appendChild(statusDiv);
}

function formatGeneratedRunsContextText(): string {
  return generatedPasswordRuns
    .map((run, index) => `Run ${index + 1}: ${run.join(', ')}`)
    .join('\n');
}

/** Send generated passwords back to the host so the AI sees them. Try sendMessage; fallback: updateModelContext. */
async function notifyHostOfPasswords(passwords: string[]): Promise<string> {
  generatedPasswordRuns.push([...passwords]);
  const text = `I have generated the following password(s) in the form: ${passwords.join(', ')}.`;
  const caps = app.getHostCapabilities();
  let contextUpdated = false;

  if (caps?.updateModelContext) {
    try {
      await app.updateModelContext({ content: [{ type: 'text', text: `Generated passwords (from form):\n${formatGeneratedRunsContextText()}` }] });
      contextUpdated = true;
    } catch (e) {
      console.warn('[Pony Password] updateModelContext failed:', e);
    }
  }

  if (caps?.message) {
    try {
      await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
      return 'sendMessage delivered to host (auto-reply depends on chat host behavior).';
    } catch (e) {
      console.warn('[Pony Password] sendMessage failed:', e);
      if (contextUpdated) {
        return 'sendMessage failed; context was updated only (no guaranteed auto-reply).';
      }
      return 'sendMessage failed and no context update was applied.';
    }
  }

  if (contextUpdated) return 'Host supports context update only (no automatic reply trigger).';
  return 'Host does not support message or context update capabilities.';
}

function showError(msg: string) {
  errorDiv.textContent = msg;
  errorDiv.style.display = 'block';
  resultDiv.style.display = 'none';
}

function extractPasswords(result: CallToolResult): string[] | null {
  if (result.isError || !result.content) return null;
  const text = result.content.find((c) => c.type === 'text');
  if (!text || text.type !== 'text' || !text.text) return null;
  try {
    const data = JSON.parse(text.text);
    const r = (data && data.result) || data;
    return Array.isArray(r) ? r : r ? [r] : null;
  } catch {
    return null;
  }
}

const app = new App({ name: 'Pony Password Generator', version: '1.0.0' });

app.onteardown = async () => ({});
app.ontoolinput = (params) => {
  if (params?.arguments) applyInitialData(params.arguments as Record<string, unknown>);
};

app.ontoolresult = (params) => {
  const pw = extractPasswords(params);
  if (pw && pw.length > 0) showPasswords(pw);
};

app.onhostcontextchanged = (ctx: McpUiHostContext) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.safeAreaInsets && mainEl) {
    mainEl.style.paddingTop = `${ctx.safeAreaInsets.top}px`;
    mainEl.style.paddingRight = `${ctx.safeAreaInsets.right}px`;
    mainEl.style.paddingBottom = `${ctx.safeAreaInsets.bottom}px`;
    mainEl.style.paddingLeft = `${ctx.safeAreaInsets.left}px`;
  }
};

app.onerror = (e) => console.error('[Pony Password]', e);

// Load default pony list on connect; re-apply last tool args so AI-selected/sampled ponies stay
async function loadPonies() {
  try {
    const result = await app.callServerTool({ name: 'list_ponies', arguments: {} });
    const data = result.structuredContent as { ponies?: Array<{ first: string; last?: string }> } | undefined;
    if (data?.ponies?.length) {
      allPonies = data.ponies;
      applyInitialData(lastToolArgs);
    }
  } catch (err) {
    console.warn('Could not load ponies:', err);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const count = parseInt(countEl.value, 10) || DEFAULTS.count;
  const minLength = parseInt(minLengthEl.value, 10) || DEFAULTS.minLength;
  const special = specialEl.checked;
  const checkboxes = poniesGrid.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
  const selectedPonies = Array.from(checkboxes).map((c) => c.value);

  (generateBtn as HTMLButtonElement).disabled = true;
  generateBtn.textContent = 'Generating...';
  resultDiv.style.display = 'none';
  errorDiv.style.display = 'none';

  try {
    const toolArgs: Record<string, unknown> = { count, minLength, special };
    if (selectedPonies.length > 0) toolArgs.selectedPonies = selectedPonies;

    const result = await app.callServerTool({ name: 'pony_password_batch', arguments: toolArgs });
    const passwords = extractPasswords(result);
    if (passwords && passwords.length > 0) {
      showPasswords(passwords);
      const hostStatus = await notifyHostOfPasswords(passwords);
      showHostStatus(hostStatus);
    } else {
      showError(result.isError ? 'Tool error' : 'No passwords in response');
    }
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  } finally {
    (generateBtn as HTMLButtonElement).disabled = false;
    generateBtn.textContent = 'Generate Passwords';
  }
});

app.connect().then(async () => {
  const ctx = app.getHostContext();
  if (ctx) app.onhostcontextchanged?.(ctx);
  await loadPonies();
});
