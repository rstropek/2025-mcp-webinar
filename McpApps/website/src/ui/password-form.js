"use strict";
(function () {
    const DEFAULTS = { count: 5, minLength: 16, special: false };
    const windowData = window.__MCP_INITIAL_DATA__ ?? {};
    const initialData = (windowData.initialData ?? {});
    const allPonies = (windowData.ponies ?? []);
    const countEl = document.getElementById('count');
    const minLengthEl = document.getElementById('minLength');
    const specialEl = document.getElementById('special');
    function applyInitialData(data) {
        const d = data ?? {};
        let countVal = d.count != null ? Number(d.count) : DEFAULTS.count;
        let minLengthVal = d.minLength != null ? Number(d.minLength) : DEFAULTS.minLength;
        if (isNaN(minLengthVal) || minLengthVal < 10)
            minLengthVal = DEFAULTS.minLength;
        const specialVal = d.special != null ? !!d.special : DEFAULTS.special;
        const selectedPoniesVal = (Array.isArray(d.selectedPonies) ? d.selectedPonies : []);
        if (countEl)
            countEl.value = String(Math.min(50, Math.max(1, isNaN(countVal) ? DEFAULTS.count : countVal)));
        if (minLengthEl)
            minLengthEl.value = String(Math.max(1, minLengthVal));
        if (specialEl)
            specialEl.checked = specialVal;
        if (allPonies.length > 0)
            renderPonies(allPonies, selectedPoniesVal);
    }
    function renderPonies(ponies, selectedPonies) {
        const grid = document.getElementById('poniesGrid');
        if (!grid)
            return;
        grid.innerHTML = '';
        if (!ponies?.length)
            return;
        function formatPonyName(name) {
            return name.replace(/([a-z])([A-Z])/g, '$1 $2');
        }
        ponies.forEach((pony) => {
            const fullName = pony.last ? pony.first + pony.last.replace(/\s+/g, '') : pony.first;
            const displayName = pony.last ? pony.first + ' ' + pony.last : formatPonyName(pony.first);
            const isSelected = selectedPonies.indexOf(fullName) !== -1;
            const div = document.createElement('div');
            div.className = 'pony-checkbox';
            div.innerHTML =
                `<input type="checkbox" id="pony-${fullName}" value="${fullName}"${isSelected ? ' checked' : ''}>` +
                    `<label for="pony-${fullName}">${displayName}</label>`;
            grid.appendChild(div);
        });
    }
    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }
    function showPasswords(passwords, resultDiv, errorDiv) {
        errorDiv.style.display = 'none';
        if (!passwords?.length) {
            showError('No passwords in response from server.', errorDiv, resultDiv);
            return;
        }
        const nonEmpty = passwords.filter((p) => p != null && String(p).trim().length > 0);
        if (nonEmpty.length === 0) {
            showError('Server returned no valid passwords. Try again or check server logs.', errorDiv, resultDiv);
            return;
        }
        let html = '<h3>Generated Passwords:</h3>';
        for (let i = 0; i < nonEmpty.length; i++) {
            html += '<div class="password">' + escapeHtml(String(nonEmpty[i])) + '</div>';
        }
        resultDiv.innerHTML = html;
        resultDiv.style.display = 'block';
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'mcp-app-result', toolName: 'pony_password_batch', passwords: nonEmpty }, '*');
            }
        }
        catch {
            /* ignore */
        }
    }
    function showError(msg, errorDiv, resultDiv) {
        errorDiv.textContent = msg;
        errorDiv.style.display = 'block';
        resultDiv.style.display = 'none';
    }
    applyInitialData(initialData);
    const form = document.getElementById('passwordForm');
    if (!form)
        return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const countInput = document.getElementById('count');
        const minLengthInput = document.getElementById('minLength');
        const specialInput = document.getElementById('special');
        if (!countInput || !minLengthInput || !specialInput)
            return;
        const count = parseInt(countInput.value, 10) || DEFAULTS.count;
        const minLength = parseInt(minLengthInput.value, 10) || DEFAULTS.minLength;
        const special = specialInput.checked;
        const checkboxes = document.querySelectorAll('#poniesGrid input[type="checkbox"]:checked');
        const selectedPonies = Array.from(checkboxes).map((c) => c.value);
        const generateBtn = document.getElementById('generateBtn');
        const resultDiv = document.getElementById('result');
        const errorDiv = document.getElementById('error');
        if (!generateBtn || !resultDiv || !errorDiv)
            return;
        const toolArgs = { count, minLength, special };
        if (selectedPonies.length > 0)
            toolArgs.selectedPonies = selectedPonies;
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
        resultDiv.style.display = 'none';
        errorDiv.style.display = 'none';
        try {
            const res = await fetch('/api/generate-passwords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(toolArgs),
            });
            const data = (await res.json());
            if (!res.ok) {
                showError('Error: ' + (data.error ?? res.statusText), errorDiv, resultDiv);
            }
            else {
                const passwords = data.result;
                if (passwords == null) {
                    showError('Server returned no result. Check server logs.', errorDiv, resultDiv);
                }
                else {
                    showPasswords(Array.isArray(passwords) ? passwords : [passwords], resultDiv, errorDiv);
                }
            }
        }
        catch (err) {
            showError('Error: ' + (err instanceof Error ? err.message : String(err)), errorDiv, resultDiv);
        }
        finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate Passwords';
        }
    });
})();
