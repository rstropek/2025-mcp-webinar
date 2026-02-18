var mcpUrl = 'http://localhost:3001/mcp';
(function() {
    var data = window.__MCP_INITIAL_DATA__;
    if (data && data.mcpServerUrl) {
        mcpUrl = data.mcpServerUrl.replace(/\/$/, '') + '/mcp';
        return;
    }
    try {
        var origin = window.parent && window.parent.location && window.parent.location.origin;
        if (origin && (origin.startsWith('http://') || origin.startsWith('https://')) && origin.indexOf('localhost') !== -1) {
            mcpUrl = origin + '/mcp';
        }
    } catch (e) {}
})();

var mcpSessionId = null;
var mcpSessionInitialized = false;
var mcpSessionPromise = null;

function initMcpSession() {
    if (mcpSessionPromise) {
        return mcpSessionPromise;
    }

    mcpSessionPromise = fetch(mcpUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'password-form', version: '1.0.0' }
            }
        })
    })
    .then(function(response) {
        mcpSessionId = response.headers.get('mcp-session-id') || response.headers.get('Mcp-Session-Id');
        if (!mcpSessionId) {
            throw new Error('No session ID received from MCP server');
        }
        mcpSessionInitialized = true;

        if (response.headers.get('content-type')?.includes('text/event-stream')) {
            return response.text().then(function(text) {
                var lines = text.split('\n');
                for (var i = 0; i < lines.length; i++) {
                    if (lines[i].startsWith('data: ')) {
                        var jsonData = lines[i].substring(6);
                        return JSON.parse(jsonData);
                    }
                }
                throw new Error('No data found in SSE response');
            });
        } else {
            return response.json();
        }
    })
    .catch(function(err) {
        mcpSessionPromise = null;
        throw err;
    });

    return mcpSessionPromise;
}

function callMcpTool(name, args) {
    return initMcpSession()
    .then(function() {
        if (!mcpSessionId) {
            throw new Error('MCP session not initialized');
        }
        return fetch(mcpUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'mcp-session-id': mcpSessionId
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/call',
                params: { name: name, arguments: args }
            })
        });
    })
    .then(function(response) {
        if (!response.ok) {
            return response.text().then(function(text) {
                throw new Error('HTTP ' + response.status + ': ' + text);
            });
        }

        if (response.headers.get('content-type')?.includes('text/event-stream')) {
            return response.text().then(function(text) {
                var lines = text.split('\n');
                for (var i = 0; i < lines.length; i++) {
                    if (lines[i].startsWith('data: ')) {
                        var jsonData = lines[i].substring(6);
                        return JSON.parse(jsonData);
                    }
                }
                throw new Error('No data found in SSE response');
            });
        } else {
            return response.json();
        }
    })
    .then(function(data) {
        if (data.error) {
            throw new Error(data.error.message || 'Tool call failed');
        }
        if (data.result && data.result.content && data.result.content[0]) {
            var text = data.result.content[0].text;
            try {
                return { result: JSON.parse(text) };
            } catch (e) {
                return { result: text };
            }
        }
        if (data.result && data.result.structuredContent) {
            return { result: data.result.structuredContent.result };
        }
        return { result: data.result };
    });
}

initMcpSession().catch(function() {});

var windowData = window.__MCP_INITIAL_DATA__ || {};
var initialData = windowData.initialData || {};
var allPonies = windowData.ponies || [];

var DEFAULTS = { count: 5, minLength: 16, special: false };
var countVal = initialData.count != null ? Number(initialData.count) : DEFAULTS.count;
var minLengthVal = initialData.minLength != null ? Number(initialData.minLength) : DEFAULTS.minLength;
var specialVal = initialData.special != null ? !!initialData.special : DEFAULTS.special;
var selectedPoniesVal = Array.isArray(initialData.selectedPonies) ? initialData.selectedPonies : [];

var countEl = document.getElementById('count');
var minLengthEl = document.getElementById('minLength');
var specialEl = document.getElementById('special');
if (countEl) {
    countEl.value = Math.min(50, Math.max(1, isNaN(countVal) ? DEFAULTS.count : countVal));
}
if (minLengthEl) {
    minLengthEl.value = Math.max(1, isNaN(minLengthVal) ? DEFAULTS.minLength : minLengthVal);
}
if (specialEl) {
    specialEl.checked = specialVal;
}

if (allPonies.length > 0) {
    renderPonies(allPonies, selectedPoniesVal);
}

window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'mcp-app-initial-data' || !e.data.initialData) return;
    applyInitialData(e.data.initialData);
});

function applyInitialData(initialData) {
    var d = initialData || {};
    var countVal = d.count != null ? Number(d.count) : DEFAULTS.count;
    var minLengthVal = d.minLength != null ? Number(d.minLength) : DEFAULTS.minLength;
    var specialVal = d.special != null ? !!d.special : DEFAULTS.special;
    var selectedPoniesVal = Array.isArray(d.selectedPonies) ? d.selectedPonies : [];
    if (countEl) countEl.value = Math.min(50, Math.max(1, isNaN(countVal) ? DEFAULTS.count : countVal));
    if (minLengthEl) minLengthEl.value = Math.max(1, isNaN(minLengthVal) ? DEFAULTS.minLength : minLengthVal);
    if (specialEl) specialEl.checked = specialVal;
    if (allPonies.length > 0) renderPonies(allPonies, selectedPoniesVal);
}

function renderPonies(ponies, selectedPonies) {
    if (!selectedPonies) selectedPonies = [];
    var grid = document.getElementById('poniesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (!ponies || ponies.length === 0) return;

    function formatPonyName(name) {
        return name.replace(/([a-z])([A-Z])/g, '$1 $2');
    }

    ponies.forEach(function(pony) {
        var fullName = pony.last ? pony.first + pony.last.replace(/\s+/g, '') : pony.first;
        var displayName;
        if (pony.last) {
            displayName = pony.first + ' ' + pony.last;
        } else {
            displayName = formatPonyName(pony.first);
        }
        var isSelected = selectedPonies.indexOf(fullName) !== -1;

        var div = document.createElement('div');
        div.className = 'pony-checkbox';
        div.innerHTML = '<input type="checkbox" id="pony-' + fullName + '" value="' + fullName + '"' + (isSelected ? ' checked' : '') + '>' +
            '<label for="pony-' + fullName + '">' + displayName + '</label>';
        grid.appendChild(div);
    });
}

var form = document.getElementById('passwordForm');
if (form) {
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        var countInput = document.getElementById('count');
        var minLengthInput = document.getElementById('minLength');
        var specialInput = document.getElementById('special');
        if (!countInput || !minLengthInput || !specialInput) return;
        var count = parseInt(countInput.value, 10);
        var minLength = parseInt(minLengthInput.value, 10);
        var special = specialInput.checked;
        var checkboxes = document.querySelectorAll('#poniesGrid input[type="checkbox"]:checked');
        var selectedPonies = [];
        for (var i = 0; i < checkboxes.length; i++) {
            selectedPonies.push(checkboxes[i].value);
        }
        var generateBtn = document.getElementById('generateBtn');
        var resultDiv = document.getElementById('result');
        var errorDiv = document.getElementById('error');
        if (!generateBtn || !resultDiv || !errorDiv) return;

        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
        resultDiv.style.display = 'none';
        errorDiv.style.display = 'none';

        try {
            var toolArgs = {
                count: count,
                minLength: minLength,
                special: special
            };
            if (selectedPonies.length > 0) {
                toolArgs.selectedPonies = selectedPonies;
            }
            var result = await callMcpTool('pony_password_batch', toolArgs);
            var passwords = null;
            if (result && result.result && Array.isArray(result.result)) {
                passwords = result.result;
            } else if (result && result.content && result.content[0] && result.content[0].text) {
                passwords = JSON.parse(result.content[0].text);
            } else {
                throw new Error('Invalid response from server');
            }
            if (passwords) {
                var passwordHtml = '<h3>Generated Passwords:</h3>';
                for (var i = 0; i < passwords.length; i++) {
                    passwordHtml += '<div class="password">' + passwords[i] + '</div>';
                }
                resultDiv.innerHTML = passwordHtml;
                resultDiv.style.display = 'block';
                try {
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({
                            type: 'mcp-app-result',
                            toolName: 'pony_password_batch',
                            passwords: passwords
                        }, '*');
                    }
                } catch (err) {}
            }
        } catch (error) {
            errorDiv.textContent = 'Error: ' + (error.message || String(error));
            errorDiv.style.display = 'block';
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate Passwords';
        }
    });
}
