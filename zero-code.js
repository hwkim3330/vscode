#!/usr/bin/env node

/**
 * Zero Code - Zero Dependency AI Code Editor
 * Works on Ubuntu 18.04+ without any npm packages
 * Supports Claude, OpenAI/Codex, Google Gemini
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');
const readline = require('readline');
const url = require('url');
const querystring = require('querystring');
const { promisify } = require('util');

// Configuration
const CONFIG = {
    port: process.env.ZERO_PORT || 3456,
    host: '127.0.0.1',
    configDir: path.join(os.homedir(), '.zero-code'),
    authFile: 'auth.json',
    sessionFile: 'session.json',
    workspaceDir: process.cwd()
};

// Ensure config directory exists
if (!fs.existsSync(CONFIG.configDir)) {
    fs.mkdirSync(CONFIG.configDir, { recursive: true });
}

/**
 * AI Provider Configuration
 */
const AI_PROVIDERS = {
    claude: {
        name: 'Claude (Anthropic)',
        apiUrl: 'https://api.anthropic.com',
        authUrl: 'https://console.anthropic.com/settings/keys',
        models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307', 'claude-2.1'],
        headers: (apiKey) => ({
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        }),
        formatRequest: (prompt, model) => ({
            model: model || 'claude-3-sonnet-20240229',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096
        }),
        parseResponse: (data) => {
            const parsed = JSON.parse(data);
            return parsed.content?.[0]?.text || parsed.error?.message || 'No response';
        },
        endpoint: '/v1/messages'
    },

    openai: {
        name: 'OpenAI (GPT/Codex)',
        apiUrl: 'https://api.openai.com',
        authUrl: 'https://platform.openai.com/api-keys',
        models: ['gpt-4', 'gpt-4-turbo-preview', 'gpt-3.5-turbo', 'code-davinci-002'],
        headers: (apiKey) => ({
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }),
        formatRequest: (prompt, model) => ({
            model: model || 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 4096
        }),
        parseResponse: (data) => {
            const parsed = JSON.parse(data);
            return parsed.choices?.[0]?.message?.content || parsed.error?.message || 'No response';
        },
        endpoint: '/v1/chat/completions'
    },

    gemini: {
        name: 'Google Gemini',
        apiUrl: 'https://generativelanguage.googleapis.com',
        authUrl: 'https://makersuite.google.com/app/apikey',
        models: ['gemini-pro', 'gemini-pro-vision', 'gemini-1.5-pro-latest', 'gemini-1.5-flash-latest'],
        headers: (apiKey) => ({
            'Content-Type': 'application/json'
        }),
        formatRequest: (prompt, model) => ({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4096
            }
        }),
        parseResponse: (data) => {
            const parsed = JSON.parse(data);
            return parsed.candidates?.[0]?.content?.parts?.[0]?.text || parsed.error?.message || 'No response';
        },
        endpoint: (model, apiKey) => `/v1beta/models/${model || 'gemini-pro'}:generateContent?key=${apiKey}`
    }
};

/**
 * Load authentication data
 */
function loadAuth() {
    const authPath = path.join(CONFIG.configDir, CONFIG.authFile);
    if (fs.existsSync(authPath)) {
        try {
            return JSON.parse(fs.readFileSync(authPath, 'utf8'));
        } catch (error) {
            console.error('Failed to load auth:', error.message);
        }
    }
    return {};
}

/**
 * Save authentication data
 */
function saveAuth(data) {
    const authPath = path.join(CONFIG.configDir, CONFIG.authFile);
    fs.writeFileSync(authPath, JSON.stringify(data, null, 2));
}

/**
 * Make API request to AI provider
 */
async function callAI(provider, prompt, options = {}) {
    return new Promise((resolve, reject) => {
        const auth = loadAuth();
        const providerConfig = AI_PROVIDERS[provider];

        if (!providerConfig) {
            reject(new Error(`Unknown provider: ${provider}`));
            return;
        }

        if (!auth[provider]?.apiKey) {
            reject(new Error(`No API key for ${provider}. Set it up first.`));
            return;
        }

        const apiKey = auth[provider].apiKey;
        const model = options.model || auth[provider].defaultModel;

        const requestBody = JSON.stringify(providerConfig.formatRequest(prompt, model));
        const endpoint = typeof providerConfig.endpoint === 'function'
            ? providerConfig.endpoint(model, apiKey)
            : providerConfig.endpoint;

        const urlParts = new URL(providerConfig.apiUrl);
        const requestOptions = {
            hostname: urlParts.hostname,
            path: endpoint,
            method: 'POST',
            headers: {
                ...providerConfig.headers(apiKey),
                'Content-Length': Buffer.byteLength(requestBody)
            }
        };

        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = providerConfig.parseResponse(data);
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.write(requestBody);
        req.end();
    });
}

/**
 * HTML for the web interface
 */
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zero Code - AI Code Editor</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #1e1e1e;
            color: #d4d4d4;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            background: #2d2d30;
            border-bottom: 1px solid #3e3e42;
            padding: 8px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .logo {
            font-size: 16px;
            font-weight: 600;
            color: #007acc;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .providers {
            display: flex;
            gap: 8px;
        }

        .provider-btn {
            padding: 4px 12px;
            background: #3e3e42;
            border: 1px solid #464647;
            border-radius: 4px;
            color: #cccccc;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        }

        .provider-btn:hover {
            background: #464647;
        }

        .provider-btn.active {
            background: #007acc;
            color: white;
            border-color: #007acc;
        }

        .provider-btn.configured {
            border-color: #4ec9b0;
        }

        .main-container {
            flex: 1;
            display: flex;
            overflow: hidden;
        }

        .sidebar {
            width: 240px;
            background: #252526;
            border-right: 1px solid #3e3e42;
            display: flex;
            flex-direction: column;
        }

        .sidebar-header {
            padding: 12px;
            border-bottom: 1px solid #3e3e42;
            font-size: 12px;
            text-transform: uppercase;
            color: #969696;
        }

        .file-list {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }

        .file-item {
            padding: 4px 8px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 13px;
            margin-bottom: 2px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .file-item:hover {
            background: #2a2a2a;
        }

        .file-item.active {
            background: #094771;
        }

        .editor-container {
            flex: 1;
            display: flex;
            flex-direction: column;
        }

        .tabs {
            background: #2d2d30;
            border-bottom: 1px solid #3e3e42;
            display: flex;
            overflow-x: auto;
        }

        .tab {
            padding: 8px 16px;
            cursor: pointer;
            border-right: 1px solid #3e3e42;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 8px;
            white-space: nowrap;
        }

        .tab:hover {
            background: #2a2a2a;
        }

        .tab.active {
            background: #1e1e1e;
            border-bottom: 2px solid #007acc;
        }

        .tab-close {
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 3px;
            cursor: pointer;
        }

        .tab-close:hover {
            background: #464647;
        }

        #editor {
            flex: 1;
            padding: 16px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.5;
            overflow-y: auto;
            background: #1e1e1e;
            outline: none;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .terminal {
            height: 200px;
            background: #1e1e1e;
            border-top: 1px solid #3e3e42;
            display: none;
            flex-direction: column;
        }

        .terminal.active {
            display: flex;
        }

        .terminal-header {
            padding: 8px;
            background: #2d2d30;
            border-bottom: 1px solid #3e3e42;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .terminal-output {
            flex: 1;
            padding: 8px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 12px;
            overflow-y: auto;
            white-space: pre-wrap;
        }

        .terminal-input {
            display: flex;
            padding: 8px;
            background: #252526;
            border-top: 1px solid #3e3e42;
        }

        .terminal-input input {
            flex: 1;
            background: #3c3c3c;
            border: 1px solid #464647;
            color: #cccccc;
            padding: 4px 8px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 12px;
            outline: none;
        }

        .ai-panel {
            width: 300px;
            background: #252526;
            border-left: 1px solid #3e3e42;
            display: none;
            flex-direction: column;
        }

        .ai-panel.active {
            display: flex;
        }

        .ai-header {
            padding: 12px;
            background: #2d2d30;
            border-bottom: 1px solid #3e3e42;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .ai-chat {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
        }

        .ai-message {
            margin-bottom: 12px;
            padding: 8px;
            border-radius: 4px;
            font-size: 13px;
            line-height: 1.5;
        }

        .ai-message.user {
            background: #094771;
            margin-left: 20px;
        }

        .ai-message.assistant {
            background: #2a2a2a;
            margin-right: 20px;
        }

        .ai-input {
            padding: 12px;
            border-top: 1px solid #3e3e42;
            display: flex;
            gap: 8px;
        }

        .ai-input textarea {
            flex: 1;
            background: #3c3c3c;
            border: 1px solid #464647;
            color: #cccccc;
            padding: 8px;
            font-family: inherit;
            font-size: 13px;
            resize: none;
            outline: none;
            border-radius: 4px;
        }

        .ai-input button {
            padding: 8px 16px;
            background: #007acc;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }

        .ai-input button:hover {
            background: #005a9e;
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            align-items: center;
            justify-content: center;
        }

        .modal.active {
            display: flex;
        }

        .modal-content {
            background: #2d2d30;
            border: 1px solid #464647;
            border-radius: 8px;
            padding: 24px;
            width: 400px;
            max-width: 90%;
        }

        .modal-header {
            font-size: 18px;
            margin-bottom: 16px;
            color: #cccccc;
        }

        .modal-body {
            margin-bottom: 20px;
        }

        .form-group {
            margin-bottom: 16px;
        }

        .form-group label {
            display: block;
            margin-bottom: 4px;
            font-size: 13px;
            color: #969696;
        }

        .form-group input, .form-group select {
            width: 100%;
            padding: 8px;
            background: #3c3c3c;
            border: 1px solid #464647;
            color: #cccccc;
            border-radius: 4px;
            font-size: 13px;
            outline: none;
        }

        .form-group input:focus {
            border-color: #007acc;
        }

        .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }

        .btn {
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            border: none;
            outline: none;
        }

        .btn-primary {
            background: #007acc;
            color: white;
        }

        .btn-primary:hover {
            background: #005a9e;
        }

        .btn-secondary {
            background: #3e3e42;
            color: #cccccc;
            border: 1px solid #464647;
        }

        .btn-secondary:hover {
            background: #464647;
        }

        .status-bar {
            height: 22px;
            background: #007acc;
            color: white;
            display: flex;
            align-items: center;
            padding: 0 12px;
            font-size: 12px;
        }

        .status-item {
            margin-right: 16px;
        }

        /* Syntax highlighting */
        .keyword { color: #569cd6; }
        .string { color: #ce9178; }
        .comment { color: #6a9955; }
        .number { color: #b5cea8; }
        .function { color: #dcdcaa; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">
            <span>⚡</span>
            <span>Zero Code</span>
        </div>
        <div class="providers">
            <button class="provider-btn" data-provider="claude" onclick="setupProvider('claude')">Claude</button>
            <button class="provider-btn" data-provider="openai" onclick="setupProvider('openai')">OpenAI</button>
            <button class="provider-btn" data-provider="gemini" onclick="setupProvider('gemini')">Gemini</button>
        </div>
    </div>

    <div class="main-container">
        <div class="sidebar">
            <div class="sidebar-header">Explorer</div>
            <div class="file-list" id="fileList"></div>
        </div>

        <div class="editor-container">
            <div class="tabs" id="tabs"></div>
            <div id="editor" contenteditable="true" spellcheck="false"></div>
        </div>

        <div class="ai-panel" id="aiPanel">
            <div class="ai-header">
                <span>AI Assistant</span>
                <button onclick="toggleAI()">×</button>
            </div>
            <div class="ai-chat" id="aiChat"></div>
            <div class="ai-input">
                <textarea id="aiInput" placeholder="Ask AI..." rows="3"></textarea>
                <button onclick="sendToAI()">Send</button>
            </div>
        </div>
    </div>

    <div class="terminal" id="terminal">
        <div class="terminal-header">
            <span>Terminal</span>
            <button onclick="toggleTerminal()">×</button>
        </div>
        <div class="terminal-output" id="terminalOutput"></div>
        <div class="terminal-input">
            <input type="text" id="terminalInput" placeholder="$ " onkeypress="handleTerminalInput(event)">
        </div>
    </div>

    <div class="status-bar">
        <span class="status-item" id="statusProvider">No AI Provider</span>
        <span class="status-item" id="statusFile">Ready</span>
    </div>

    <!-- Setup Modal -->
    <div class="modal" id="setupModal">
        <div class="modal-content">
            <div class="modal-header" id="modalTitle">Setup Provider</div>
            <div class="modal-body">
                <div class="form-group">
                    <label>API Key</label>
                    <input type="password" id="apiKeyInput" placeholder="Enter your API key">
                </div>
                <div class="form-group">
                    <label>Default Model</label>
                    <select id="modelSelect"></select>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn btn-primary" onclick="saveProviderSetup()">Save</button>
            </div>
        </div>
    </div>

    <script>
        let currentProvider = null;
        let currentFile = null;
        let openTabs = [];
        let files = {};

        // Initialize
        window.onload = function() {
            loadFiles();
            checkProviders();
            setupShortcuts();
        };

        // Load file list
        async function loadFiles() {
            const response = await fetch('/api/files');
            const data = await response.json();
            displayFiles(data.files);
        }

        // Display files in sidebar
        function displayFiles(fileList) {
            const container = document.getElementById('fileList');
            container.innerHTML = '';

            fileList.forEach(file => {
                const item = document.createElement('div');
                item.className = 'file-item';
                item.innerHTML = \`<span>\${getFileIcon(file)}</span><span>\${file}</span>\`;
                item.onclick = () => openFile(file);
                container.appendChild(item);
            });
        }

        // Get file icon
        function getFileIcon(filename) {
            const ext = filename.split('.').pop().toLowerCase();
            const icons = {
                js: '📜', py: '🐍', html: '🌐', css: '🎨',
                json: '📋', md: '📝', txt: '📄', sh: '🔧'
            };
            return icons[ext] || '📄';
        }

        // Open file
        async function openFile(filename) {
            const response = await fetch(\`/api/file?path=\${encodeURIComponent(filename)}\`);
            const data = await response.json();

            if (data.content !== undefined) {
                currentFile = filename;
                document.getElementById('editor').textContent = data.content;
                addTab(filename);
                highlightSyntax();
                updateStatus(\`Opened: \${filename}\`);
            }
        }

        // Add tab
        function addTab(filename) {
            if (!openTabs.includes(filename)) {
                openTabs.push(filename);
            }
            renderTabs();
        }

        // Render tabs
        function renderTabs() {
            const container = document.getElementById('tabs');
            container.innerHTML = '';

            openTabs.forEach(file => {
                const tab = document.createElement('div');
                tab.className = \`tab \${file === currentFile ? 'active' : ''}\`;
                tab.innerHTML = \`
                    <span onclick="openFile('\${file}')">\${file}</span>
                    <span class="tab-close" onclick="closeTab('\${file}')">×</span>
                \`;
                container.appendChild(tab);
            });
        }

        // Close tab
        function closeTab(filename) {
            event.stopPropagation();
            openTabs = openTabs.filter(f => f !== filename);
            if (currentFile === filename) {
                currentFile = openTabs[0] || null;
                if (currentFile) openFile(currentFile);
                else document.getElementById('editor').textContent = '';
            }
            renderTabs();
        }

        // Save file
        async function saveFile() {
            if (!currentFile) return;

            const content = document.getElementById('editor').textContent;
            const response = await fetch('/api/file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: currentFile, content })
            });

            if (response.ok) {
                updateStatus(\`Saved: \${currentFile}\`);
            }
        }

        // Check providers
        async function checkProviders() {
            const response = await fetch('/api/providers');
            const data = await response.json();

            Object.keys(data).forEach(provider => {
                if (data[provider].configured) {
                    const btn = document.querySelector(\`[data-provider="\${provider}"]\`);
                    if (btn) btn.classList.add('configured');
                }
                if (data[provider].active) {
                    currentProvider = provider;
                    const btn = document.querySelector(\`[data-provider="\${provider}"]\`);
                    if (btn) btn.classList.add('active');
                    updateStatus(\`AI: \${provider}\`);
                }
            });
        }

        // Setup provider
        function setupProvider(provider) {
            currentProvider = provider;
            document.getElementById('setupModal').classList.add('active');
            document.getElementById('modalTitle').textContent = \`Setup \${provider}\`;

            // Load models for provider
            fetch(\`/api/models?provider=\${provider}\`)
                .then(res => res.json())
                .then(data => {
                    const select = document.getElementById('modelSelect');
                    select.innerHTML = '';
                    data.models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model;
                        option.textContent = model;
                        select.appendChild(option);
                    });
                });
        }

        // Save provider setup
        async function saveProviderSetup() {
            const apiKey = document.getElementById('apiKeyInput').value;
            const model = document.getElementById('modelSelect').value;

            const response = await fetch('/api/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: currentProvider,
                    apiKey,
                    defaultModel: model
                })
            });

            if (response.ok) {
                closeModal();
                checkProviders();
                updateStatus(\`Configured: \${currentProvider}\`);
            }
        }

        // Close modal
        function closeModal() {
            document.getElementById('setupModal').classList.remove('active');
            document.getElementById('apiKeyInput').value = '';
        }

        // Toggle AI panel
        function toggleAI() {
            document.getElementById('aiPanel').classList.toggle('active');
        }

        // Send to AI
        async function sendToAI() {
            const input = document.getElementById('aiInput');
            const prompt = input.value.trim();
            if (!prompt) return;

            // Add user message
            addAIMessage(prompt, 'user');
            input.value = '';

            // Get selected code if any
            const selection = window.getSelection().toString();
            const context = selection || document.getElementById('editor').textContent;

            // Send to AI
            const response = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: currentProvider,
                    prompt,
                    context,
                    file: currentFile
                })
            });

            const data = await response.json();
            addAIMessage(data.response || data.error, 'assistant');
        }

        // Add AI message
        function addAIMessage(text, type) {
            const chat = document.getElementById('aiChat');
            const message = document.createElement('div');
            message.className = \`ai-message \${type}\`;
            message.textContent = text;
            chat.appendChild(message);
            chat.scrollTop = chat.scrollHeight;
        }

        // Toggle terminal
        function toggleTerminal() {
            document.getElementById('terminal').classList.toggle('active');
        }

        // Handle terminal input
        async function handleTerminalInput(event) {
            if (event.key !== 'Enter') return;

            const input = document.getElementById('terminalInput');
            const command = input.value.trim();
            if (!command) return;

            const output = document.getElementById('terminalOutput');
            output.textContent += \`$ \${command}\\n\`;
            input.value = '';

            // Execute command
            const response = await fetch('/api/terminal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command })
            });

            const data = await response.json();
            output.textContent += data.output + '\\n';
            output.scrollTop = output.scrollHeight;
        }

        // Update status
        function updateStatus(message) {
            document.getElementById('statusFile').textContent = message;
        }

        // Setup keyboard shortcuts
        function setupShortcuts() {
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    switch(e.key) {
                        case 's':
                            e.preventDefault();
                            saveFile();
                            break;
                        case 'j':
                            e.preventDefault();
                            toggleTerminal();
                            break;
                        case 'i':
                            e.preventDefault();
                            toggleAI();
                            break;
                    }
                }
            });
        }

        // Basic syntax highlighting
        function highlightSyntax() {
            // This is a placeholder - real syntax highlighting would be more complex
            const editor = document.getElementById('editor');
            const text = editor.textContent;

            // Simple keyword highlighting
            const keywords = ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return'];
            let highlighted = text;

            keywords.forEach(keyword => {
                const regex = new RegExp(\`\\\\b\${keyword}\\\\b\`, 'g');
                highlighted = highlighted.replace(regex, \`<span class="keyword">\${keyword}</span>\`);
            });

            // Don't apply for now to keep editing simple
            // editor.innerHTML = highlighted;
        }
    </script>
</body>
</html>`;

/**
 * API Routes Handler
 */
async function handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        switch (pathname) {
            case '/':
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(HTML_CONTENT);
                break;

            case '/api/files':
                const files = fs.readdirSync(CONFIG.workspaceDir)
                    .filter(f => !f.startsWith('.') && fs.statSync(path.join(CONFIG.workspaceDir, f)).isFile());
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ files }));
                break;

            case '/api/file':
                if (req.method === 'GET') {
                    const filePath = path.join(CONFIG.workspaceDir, parsedUrl.query.path);
                    if (fs.existsSync(filePath)) {
                        const content = fs.readFileSync(filePath, 'utf8');
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ content }));
                    } else {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'File not found' }));
                    }
                } else if (req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', () => {
                        const data = JSON.parse(body);
                        const filePath = path.join(CONFIG.workspaceDir, data.path);
                        fs.writeFileSync(filePath, data.content);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    });
                }
                break;

            case '/api/providers':
                const auth = loadAuth();
                const providers = {};
                Object.keys(AI_PROVIDERS).forEach(provider => {
                    providers[provider] = {
                        configured: !!auth[provider]?.apiKey,
                        active: auth.activeProvider === provider
                    };
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(providers));
                break;

            case '/api/models':
                const provider = parsedUrl.query.provider;
                const models = AI_PROVIDERS[provider]?.models || [];
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ models }));
                break;

            case '/api/setup':
                if (req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', () => {
                        const data = JSON.parse(body);
                        const auth = loadAuth();
                        auth[data.provider] = {
                            apiKey: data.apiKey,
                            defaultModel: data.defaultModel
                        };
                        auth.activeProvider = data.provider;
                        saveAuth(auth);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    });
                }
                break;

            case '/api/ai':
                if (req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', async () => {
                        const data = JSON.parse(body);
                        try {
                            const response = await callAI(data.provider, data.prompt, {
                                context: data.context,
                                file: data.file
                            });
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ response }));
                        } catch (error) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: error.message }));
                        }
                    });
                }
                break;

            case '/api/terminal':
                if (req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', () => {
                        const data = JSON.parse(body);
                        exec(data.command, { cwd: CONFIG.workspaceDir }, (error, stdout, stderr) => {
                            const output = error ? stderr || error.message : stdout;
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ output }));
                        });
                    });
                }
                break;

            default:
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
        }
    } catch (error) {
        console.error('Request error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
    }
}

/**
 * Start the server
 */
function startServer() {
    const server = http.createServer(handleRequest);

    server.listen(CONFIG.port, CONFIG.host, () => {
        console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════');
        console.log('\x1b[33m%s\x1b[0m', '⚡ Zero Code - AI Code Editor');
        console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════');
        console.log('\x1b[32m%s\x1b[0m', `✓ Server running at http://${CONFIG.host}:${CONFIG.port}`);
        console.log('\x1b[35m%s\x1b[0m', '✓ Zero dependencies - Works everywhere!');
        console.log('\x1b[34m%s\x1b[0m', '✓ Supports: Claude, OpenAI, Gemini');
        console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════');
        console.log('\x1b[33m%s\x1b[0m', 'Shortcuts:');
        console.log('  Ctrl+S - Save file');
        console.log('  Ctrl+J - Toggle terminal');
        console.log('  Ctrl+I - Toggle AI assistant');
        console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════');
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n\x1b[33m%s\x1b[0m', 'Shutting down gracefully...');
        server.close(() => {
            console.log('\x1b[32m%s\x1b[0m', '✓ Server closed');
            process.exit(0);
        });
    });
}

// CLI interface for setup
if (process.argv[2] === 'setup') {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════');
    console.log('\x1b[33m%s\x1b[0m', 'Zero Code Setup');
    console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════');

    const providers = ['claude', 'openai', 'gemini'];
    let currentIdx = 0;
    const auth = loadAuth();

    function setupNext() {
        if (currentIdx >= providers.length) {
            rl.close();
            console.log('\x1b[32m%s\x1b[0m', '✓ Setup complete!');
            console.log('Run: node zero-code.js');
            return;
        }

        const provider = providers[currentIdx];
        const config = AI_PROVIDERS[provider];

        rl.question(`\nSetup ${config.name}? (y/n): `, (answer) => {
            if (answer.toLowerCase() === 'y') {
                console.log(`Get API key from: \x1b[34m${config.authUrl}\x1b[0m`);
                rl.question('Enter API key (or press Enter to skip): ', (apiKey) => {
                    if (apiKey) {
                        auth[provider] = { apiKey, defaultModel: config.models[0] };
                        saveAuth(auth);
                        console.log('\x1b[32m%s\x1b[0m', `✓ ${provider} configured`);
                    }
                    currentIdx++;
                    setupNext();
                });
            } else {
                currentIdx++;
                setupNext();
            }
        });
    }

    setupNext();

} else {
    // Start the server
    startServer();
}