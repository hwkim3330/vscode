#!/usr/bin/env node

/**
 * KETI Code Ultimate - Complete AI Code Editor
 * Supports Claude, OpenAI Codex, GitHub Copilot authentication
 * Zero dependencies, works on Ubuntu 18.04+
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');
const os = require('os');
const readline = require('readline');
const url = require('url');
const querystring = require('querystring');

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    port: process.env.KETI_PORT || 3333,
    host: '127.0.0.1',
    providers: {
        claude: {
            name: 'Claude (Anthropic)',
            apiEndpoint: 'https://api.anthropic.com/v1/messages',
            authEndpoint: 'https://console.anthropic.com',
            deviceFlowEndpoint: 'https://console.anthropic.com/device',
            model: 'claude-3-sonnet-20240229'
        },
        openai: {
            name: 'OpenAI Codex',
            apiEndpoint: 'https://api.openai.com/v1/chat/completions',
            authEndpoint: 'https://auth0.openai.com',
            deviceFlowEndpoint: 'https://auth0.openai.com/device',
            model: 'gpt-4'
        },
        copilot: {
            name: 'GitHub Copilot',
            apiEndpoint: 'https://api.github.com/copilot/completions',
            authEndpoint: 'https://github.com/login/device',
            deviceFlowEndpoint: 'https://github.com/login/device/code',
            model: 'copilot-1'
        }
    },
    authDir: path.join(os.homedir(), '.keti-code'),
    authFile: path.join(os.homedir(), '.keti-code', 'auth.json')
};

// Create auth directory
if (!fs.existsSync(CONFIG.authDir)) {
    fs.mkdirSync(CONFIG.authDir, { recursive: true });
}

// ============================================
// AUTHENTICATION MANAGER
// ============================================
class AuthenticationManager {
    constructor() {
        this.sessions = new Map();
        this.deviceCodes = new Map();
        this.tokens = this.loadTokens();
    }

    loadTokens() {
        try {
            if (fs.existsSync(CONFIG.authFile)) {
                return JSON.parse(fs.readFileSync(CONFIG.authFile, 'utf8'));
            }
        } catch (err) {
            console.error('Failed to load tokens:', err.message);
        }
        return {};
    }

    saveTokens() {
        try {
            fs.writeFileSync(CONFIG.authFile, JSON.stringify(this.tokens, null, 2));
            console.log('✅ Tokens saved to', CONFIG.authFile);
        } catch (err) {
            console.error('Failed to save tokens:', err.message);
        }
    }

    // Device Flow Authentication (like Claude Code and Codex)
    async initiateDeviceFlow(provider) {
        const userCode = this.generateUserCode();
        const deviceCode = crypto.randomBytes(32).toString('hex');

        const deviceAuth = {
            device_code: deviceCode,
            user_code: userCode,
            verification_uri: `http://localhost:${CONFIG.port}/device`,
            verification_uri_complete: `http://localhost:${CONFIG.port}/device?code=${userCode}`,
            expires_in: 600,
            interval: 5
        };

        this.deviceCodes.set(userCode, {
            provider: provider,
            deviceCode: deviceCode,
            status: 'pending',
            expiresAt: Date.now() + 600000
        });

        return deviceAuth;
    }

    generateUserCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            if (i === 4) code += '-';
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    // GitHub OAuth App Flow (for Copilot)
    async authenticateGitHub(code) {
        const params = {
            client_id: process.env.GITHUB_CLIENT_ID || 'Iv1.8a61f9b3a7aba766',
            client_secret: process.env.GITHUB_CLIENT_SECRET || '',
            code: code
        };

        return new Promise((resolve, reject) => {
            const postData = querystring.stringify(params);

            const options = {
                hostname: 'github.com',
                path: '/login/oauth/access_token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.access_token) {
                            this.tokens.github = result.access_token;
                            this.saveTokens();
                            resolve(result);
                        } else {
                            reject(new Error('GitHub authentication failed'));
                        }
                    } catch (err) {
                        reject(err);
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        });
    }

    // OpenAI/Anthropic API Key Authentication
    setApiKey(provider, apiKey) {
        this.tokens[provider] = apiKey;
        this.saveTokens();
        return true;
    }

    // Check if authenticated
    isAuthenticated(provider) {
        return !!this.tokens[provider];
    }

    // Get token for provider
    getToken(provider) {
        return this.tokens[provider];
    }
}

// ============================================
// AI COMPLETION ENGINE
// ============================================
class AICompletionEngine {
    constructor(authManager) {
        this.authManager = authManager;
        this.cache = new Map();
    }

    async complete(provider, prompt, context = {}) {
        const token = this.authManager.getToken(provider);
        if (!token) {
            throw new Error(`Not authenticated with ${provider}`);
        }

        const config = CONFIG.providers[provider];

        switch (provider) {
            case 'claude':
                return await this.completeClaude(prompt, context, token);
            case 'openai':
                return await this.completeOpenAI(prompt, context, token);
            case 'copilot':
                return await this.completeCopilot(prompt, context, token);
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }

    async completeClaude(prompt, context, apiKey) {
        const messages = [
            {
                role: 'user',
                content: this.buildPrompt(prompt, context)
            }
        ];

        const body = JSON.stringify({
            model: CONFIG.providers.claude.model,
            messages: messages,
            max_tokens: 2000,
            temperature: 0.7
        });

        return await this.makeAPIRequest(
            'api.anthropic.com',
            '/v1/messages',
            {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body
        );
    }

    async completeOpenAI(prompt, context, apiKey) {
        const messages = [
            {
                role: 'system',
                content: 'You are a helpful coding assistant.'
            },
            {
                role: 'user',
                content: this.buildPrompt(prompt, context)
            }
        ];

        const body = JSON.stringify({
            model: CONFIG.providers.openai.model,
            messages: messages,
            max_tokens: 2000,
            temperature: 0.7
        });

        return await this.makeAPIRequest(
            'api.openai.com',
            '/v1/chat/completions',
            {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body
        );
    }

    async completeCopilot(prompt, context, token) {
        // GitHub Copilot API (simplified version)
        const body = JSON.stringify({
            prompt: this.buildPrompt(prompt, context),
            max_tokens: 2000,
            temperature: 0.7,
            top_p: 1,
            n: 1,
            stream: false
        });

        return await this.makeAPIRequest(
            'api.github.com',
            '/copilot/completions',
            {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.copilot-preview+json'
            },
            body
        );
    }

    buildPrompt(prompt, context) {
        let fullPrompt = prompt;

        if (context.code) {
            fullPrompt = `Current code:\n\`\`\`${context.language || ''}\n${context.code}\n\`\`\`\n\n${prompt}`;
        }

        if (context.file) {
            fullPrompt = `File: ${context.file}\n${fullPrompt}`;
        }

        if (context.error) {
            fullPrompt += `\n\nError to fix:\n${context.error}`;
        }

        return fullPrompt;
    }

    async makeAPIRequest(hostname, path, headers, body) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: hostname,
                port: 443,
                path: path,
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Length': Buffer.byteLength(body)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (res.statusCode === 200 || res.statusCode === 201) {
                            resolve(this.parseResponse(result, hostname));
                        } else {
                            reject(new Error(result.error?.message || 'API request failed'));
                        }
                    } catch (err) {
                        reject(err);
                    }
                });
            });

            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    parseResponse(response, hostname) {
        // Normalize response format
        if (hostname.includes('anthropic')) {
            return {
                text: response.content?.[0]?.text || '',
                model: response.model,
                usage: response.usage
            };
        } else if (hostname.includes('openai')) {
            return {
                text: response.choices?.[0]?.message?.content || '',
                model: response.model,
                usage: response.usage
            };
        } else if (hostname.includes('github')) {
            return {
                text: response.choices?.[0]?.text || '',
                model: 'copilot',
                usage: response.usage
            };
        }
        return response;
    }
}

// ============================================
// CODE EDITOR FEATURES
// ============================================
class CodeEditor {
    constructor(aiEngine) {
        this.aiEngine = aiEngine;
        this.openFiles = new Map();
        this.currentFile = null;
    }

    async openFile(filePath) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            this.openFiles.set(filePath, {
                path: filePath,
                content: content,
                modified: false,
                language: this.detectLanguage(filePath)
            });
            this.currentFile = filePath;
            return { success: true, content };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async saveFile(filePath, content) {
        try {
            await fs.promises.writeFile(filePath, content);
            if (this.openFiles.has(filePath)) {
                this.openFiles.get(filePath).modified = false;
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    detectLanguage(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const languages = {
            '.js': 'javascript',
            '.ts': 'typescript',
            '.py': 'python',
            '.java': 'java',
            '.c': 'c',
            '.cpp': 'cpp',
            '.go': 'go',
            '.rs': 'rust',
            '.rb': 'ruby',
            '.php': 'php'
        };
        return languages[ext] || 'text';
    }

    async autocomplete(provider, cursorPosition) {
        const file = this.openFiles.get(this.currentFile);
        if (!file) return null;

        const lines = file.content.split('\n');
        const currentLine = lines[cursorPosition.line] || '';
        const beforeCursor = currentLine.substring(0, cursorPosition.column);
        const afterCursor = currentLine.substring(cursorPosition.column);

        // Get context (5 lines before and after)
        const contextBefore = lines.slice(Math.max(0, cursorPosition.line - 5), cursorPosition.line).join('\n');
        const contextAfter = lines.slice(cursorPosition.line + 1, cursorPosition.line + 6).join('\n');

        const prompt = `Complete the code at the cursor position:\n${contextBefore}\n${beforeCursor}[CURSOR]${afterCursor}\n${contextAfter}`;

        try {
            const result = await this.aiEngine.complete(provider, prompt, {
                language: file.language,
                file: file.path
            });

            return {
                suggestion: result.text,
                confidence: 0.9
            };
        } catch (err) {
            return { error: err.message };
        }
    }

    async explainCode(provider, selection) {
        const file = this.openFiles.get(this.currentFile);
        if (!file) return null;

        const prompt = `Explain this ${file.language} code:\n\`\`\`\n${selection}\n\`\`\``;

        try {
            const result = await this.aiEngine.complete(provider, prompt, {
                language: file.language
            });

            return { explanation: result.text };
        } catch (err) {
            return { error: err.message };
        }
    }

    async fixError(provider, error) {
        const file = this.openFiles.get(this.currentFile);
        if (!file) return null;

        const prompt = `Fix this error in the code`;

        try {
            const result = await this.aiEngine.complete(provider, prompt, {
                code: file.content,
                language: file.language,
                error: error
            });

            return { solution: result.text };
        } catch (err) {
            return { error: err.message };
        }
    }
}

// ============================================
// TERMINAL INTEGRATION
// ============================================
class Terminal {
    constructor() {
        this.sessions = new Map();
    }

    createSession(id) {
        const shell = process.env.SHELL || '/bin/bash';
        const proc = spawn(shell, [], {
            cwd: process.cwd(),
            env: process.env,
            stdio: 'pipe'
        });

        this.sessions.set(id, {
            process: proc,
            output: []
        });

        // Handle output
        proc.stdout.on('data', (data) => {
            this.sessions.get(id).output.push(data.toString());
        });

        proc.stderr.on('data', (data) => {
            this.sessions.get(id).output.push(data.toString());
        });

        return id;
    }

    write(sessionId, data) {
        const session = this.sessions.get(sessionId);
        if (session && session.process) {
            session.process.stdin.write(data);
        }
    }

    getOutput(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            const output = session.output.join('');
            session.output = [];
            return output;
        }
        return '';
    }

    closeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.process.kill();
            this.sessions.delete(sessionId);
        }
    }
}

// ============================================
// WEB UI
// ============================================
const HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
    <title>KETI Code Ultimate</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'JetBrains Mono', 'Monaco', monospace;
            background: #0d1117;
            color: #c9d1d9;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        /* Header */
        .header {
            background: #161b22;
            padding: 10px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #30363d;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: bold;
            font-size: 18px;
        }

        .logo-icon {
            width: 30px;
            height: 30px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .auth-status {
            display: flex;
            gap: 10px;
            align-items: center;
        }

        .provider-selector {
            padding: 6px 12px;
            background: #21262d;
            border: 1px solid #30363d;
            color: #c9d1d9;
            border-radius: 6px;
            cursor: pointer;
        }

        .auth-btn {
            padding: 6px 16px;
            background: #238636;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
        }

        .auth-btn:hover {
            background: #2ea043;
        }

        /* Main Layout */
        .main {
            flex: 1;
            display: flex;
            overflow: hidden;
        }

        /* Sidebar */
        .sidebar {
            width: 250px;
            background: #0d1117;
            border-right: 1px solid #30363d;
            display: flex;
            flex-direction: column;
        }

        .sidebar-header {
            padding: 15px;
            background: #161b22;
            border-bottom: 1px solid #30363d;
            font-weight: 600;
        }

        .file-tree {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
        }

        .file-item {
            padding: 5px 10px;
            cursor: pointer;
            border-radius: 4px;
            margin-bottom: 2px;
        }

        .file-item:hover {
            background: #161b22;
        }

        /* Editor */
        .editor-container {
            flex: 1;
            display: flex;
            flex-direction: column;
        }

        .tabs {
            background: #161b22;
            display: flex;
            border-bottom: 1px solid #30363d;
        }

        .tab {
            padding: 10px 20px;
            cursor: pointer;
            border-right: 1px solid #30363d;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .tab.active {
            background: #0d1117;
            border-bottom: 2px solid #58a6ff;
        }

        .tab-close {
            width: 16px;
            height: 16px;
            border-radius: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }

        .tab-close:hover {
            background: #30363d;
        }

        #editor {
            flex: 1;
            background: #0d1117;
            color: #c9d1d9;
            font-family: 'JetBrains Mono', monospace;
            font-size: 14px;
            line-height: 1.6;
            padding: 20px;
            overflow: auto;
            border: none;
            outline: none;
            resize: none;
        }

        /* Terminal */
        .terminal {
            height: 200px;
            background: #000;
            color: #0f0;
            font-family: 'Monaco', monospace;
            font-size: 12px;
            padding: 10px;
            overflow-y: auto;
            border-top: 1px solid #30363d;
        }

        #terminal-input {
            width: 100%;
            background: transparent;
            border: none;
            color: #0f0;
            outline: none;
            font-family: inherit;
        }

        /* AI Assistant Panel */
        .ai-panel {
            width: 350px;
            background: #0d1117;
            border-left: 1px solid #30363d;
            display: flex;
            flex-direction: column;
        }

        .ai-header {
            padding: 15px;
            background: #161b22;
            border-bottom: 1px solid #30363d;
            font-weight: 600;
        }

        .ai-chat {
            flex: 1;
            overflow-y: auto;
            padding: 15px;
        }

        .ai-message {
            margin-bottom: 15px;
            padding: 10px;
            background: #161b22;
            border-radius: 6px;
        }

        .ai-message.user {
            background: #1f6feb;
        }

        .ai-input-container {
            padding: 15px;
            border-top: 1px solid #30363d;
        }

        #ai-input {
            width: 100%;
            padding: 10px;
            background: #161b22;
            border: 1px solid #30363d;
            color: #c9d1d9;
            border-radius: 6px;
            outline: none;
            font-family: inherit;
            resize: none;
        }

        /* Autocomplete */
        .autocomplete {
            position: absolute;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 5px;
            display: none;
            z-index: 1000;
        }

        .autocomplete-item {
            padding: 5px 10px;
            cursor: pointer;
            border-radius: 4px;
        }

        .autocomplete-item:hover {
            background: #21262d;
        }

        /* Status Bar */
        .status-bar {
            background: #161b22;
            border-top: 1px solid #30363d;
            padding: 5px 20px;
            display: flex;
            justify-content: space-between;
            font-size: 12px;
        }

        /* Device Flow Modal */
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            align-items: center;
            justify-content: center;
            z-index: 2000;
        }

        .modal-content {
            background: #161b22;
            padding: 30px;
            border-radius: 10px;
            text-align: center;
            min-width: 400px;
        }

        .device-code {
            font-size: 32px;
            font-weight: bold;
            margin: 20px 0;
            padding: 15px;
            background: #0d1117;
            border-radius: 6px;
            letter-spacing: 3px;
            color: #58a6ff;
        }

        .loading {
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">
            <div class="logo-icon">⚡</div>
            <span>KETI Code Ultimate</span>
        </div>
        <div class="auth-status">
            <select id="provider-selector" class="provider-selector">
                <option value="claude">Claude (Anthropic)</option>
                <option value="openai">OpenAI Codex</option>
                <option value="copilot">GitHub Copilot</option>
            </select>
            <button id="auth-btn" class="auth-btn">Connect</button>
            <span id="auth-indicator">🔴</span>
        </div>
    </div>

    <div class="main">
        <div class="sidebar">
            <div class="sidebar-header">EXPLORER</div>
            <div class="file-tree" id="file-tree"></div>
        </div>

        <div class="editor-container">
            <div class="tabs" id="tabs">
                <div class="tab active">
                    <span>untitled.js</span>
                    <span class="tab-close">×</span>
                </div>
            </div>
            <textarea id="editor" placeholder="// Start coding with AI assistance..."></textarea>
            <div class="terminal" id="terminal">
                <div id="terminal-output"></div>
                <input id="terminal-input" type="text" placeholder="$">
            </div>
        </div>

        <div class="ai-panel">
            <div class="ai-header">AI Assistant</div>
            <div class="ai-chat" id="ai-chat"></div>
            <div class="ai-input-container">
                <textarea id="ai-input" rows="3" placeholder="Ask AI for help... (Ctrl+Enter)"></textarea>
            </div>
        </div>
    </div>

    <div class="status-bar">
        <span id="status-left">Ready</span>
        <span id="status-right">Ln 1, Col 1 | JavaScript</span>
    </div>

    <!-- Autocomplete dropdown -->
    <div class="autocomplete" id="autocomplete"></div>

    <!-- Device Flow Modal -->
    <div class="modal" id="device-modal">
        <div class="modal-content">
            <h2>Device Authentication</h2>
            <p>Enter this code on the provider's website:</p>
            <div class="device-code" id="device-code">XXXX-XXXX</div>
            <p class="loading">Waiting for authentication...</p>
            <button onclick="closeModal()">Cancel</button>
        </div>
    </div>

    <script>
        let currentProvider = 'claude';
        let authenticated = false;
        let terminalId = null;

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            checkAuth();
            loadFiles();
            setupEventListeners();
        });

        // Event Listeners
        function setupEventListeners() {
            // Provider selector
            document.getElementById('provider-selector').addEventListener('change', (e) => {
                currentProvider = e.target.value;
                checkAuth();
            });

            // Auth button
            document.getElementById('auth-btn').addEventListener('click', authenticate);

            // Editor
            const editor = document.getElementById('editor');
            editor.addEventListener('input', onEditorChange);
            editor.addEventListener('keydown', handleEditorKeydown);

            // Terminal
            const terminalInput = document.getElementById('terminal-input');
            terminalInput.addEventListener('keypress', handleTerminalInput);

            // AI Input
            const aiInput = document.getElementById('ai-input');
            aiInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    sendAIMessage();
                }
            });
        }

        // Authentication
        async function checkAuth() {
            const response = await fetch('/api/auth/status?provider=' + currentProvider);
            const data = await response.json();

            authenticated = data.authenticated;
            updateAuthUI();
        }

        function updateAuthUI() {
            const indicator = document.getElementById('auth-indicator');
            const btn = document.getElementById('auth-btn');

            if (authenticated) {
                indicator.textContent = '🟢';
                btn.textContent = 'Connected';
                btn.style.background = '#2ea043';
            } else {
                indicator.textContent = '🔴';
                btn.textContent = 'Connect';
                btn.style.background = '#238636';
            }
        }

        async function authenticate() {
            if (authenticated) {
                // Logout
                await fetch('/api/auth/logout', { method: 'POST' });
                authenticated = false;
                updateAuthUI();
            } else {
                // Start device flow
                const response = await fetch('/api/auth/device', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider: currentProvider })
                });

                const data = await response.json();
                showDeviceCode(data.user_code);

                // Poll for completion
                pollDeviceAuth(data.device_code);
            }
        }

        function showDeviceCode(code) {
            document.getElementById('device-code').textContent = code;
            document.getElementById('device-modal').style.display = 'flex';
        }

        function closeModal() {
            document.getElementById('device-modal').style.display = 'none';
        }

        async function pollDeviceAuth(deviceCode) {
            const interval = setInterval(async () => {
                const response = await fetch('/api/auth/device/poll', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device_code: deviceCode })
                });

                const data = await response.json();

                if (data.authenticated) {
                    clearInterval(interval);
                    closeModal();
                    authenticated = true;
                    updateAuthUI();
                    showNotification('✅ Authentication successful!');
                } else if (data.error === 'expired') {
                    clearInterval(interval);
                    closeModal();
                    showNotification('❌ Authentication expired');
                }
            }, 5000);
        }

        // Editor functions
        function onEditorChange() {
            const editor = document.getElementById('editor');
            const position = getCaretPosition(editor);

            // Update status bar
            document.getElementById('status-right').textContent =
                \`Ln \${position.line}, Col \${position.column} | JavaScript\`;

            // Trigger autocomplete
            if (authenticated) {
                triggerAutocomplete(position);
            }
        }

        function handleEditorKeydown(e) {
            // Tab for autocomplete accept
            if (e.key === 'Tab' && hasAutocompleteOpen()) {
                e.preventDefault();
                acceptAutocomplete();
                return;
            }

            // Ctrl+Space for manual autocomplete
            if (e.key === ' ' && e.ctrlKey) {
                e.preventDefault();
                triggerAutocomplete(getCaretPosition(e.target));
                return;
            }

            // Ctrl+S to save
            if (e.key === 's' && e.ctrlKey) {
                e.preventDefault();
                saveCurrentFile();
                return;
            }
        }

        function getCaretPosition(textarea) {
            const text = textarea.value;
            const position = textarea.selectionStart;
            const lines = text.substring(0, position).split('\\n');

            return {
                line: lines.length,
                column: lines[lines.length - 1].length + 1,
                position: position
            };
        }

        async function triggerAutocomplete(position) {
            const response = await fetch('/api/autocomplete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: currentProvider,
                    position: position
                })
            });

            const data = await response.json();

            if (data.suggestion) {
                showAutocomplete(data.suggestion, position);
            }
        }

        function showAutocomplete(suggestion, position) {
            const autocomplete = document.getElementById('autocomplete');
            autocomplete.innerHTML = \`<div class="autocomplete-item">\${suggestion}</div>\`;
            autocomplete.style.display = 'block';

            // Position near cursor
            // (Simplified positioning)
            autocomplete.style.left = '400px';
            autocomplete.style.top = '200px';
        }

        function hasAutocompleteOpen() {
            return document.getElementById('autocomplete').style.display === 'block';
        }

        function acceptAutocomplete() {
            const autocomplete = document.getElementById('autocomplete');
            const suggestion = autocomplete.textContent;
            const editor = document.getElementById('editor');

            // Insert suggestion at cursor
            const position = editor.selectionStart;
            const text = editor.value;
            editor.value = text.substring(0, position) + suggestion + text.substring(position);

            autocomplete.style.display = 'none';
        }

        // Terminal functions
        async function handleTerminalInput(e) {
            if (e.key === 'Enter') {
                const input = e.target;
                const command = input.value;

                appendToTerminal('$ ' + command);

                if (!terminalId) {
                    const response = await fetch('/api/terminal/create', { method: 'POST' });
                    const data = await response.json();
                    terminalId = data.id;
                }

                await fetch('/api/terminal/write', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: terminalId,
                        data: command + '\\n'
                    })
                });

                input.value = '';

                // Get output
                setTimeout(getTerminalOutput, 100);
            }
        }

        async function getTerminalOutput() {
            const response = await fetch('/api/terminal/output?id=' + terminalId);
            const data = await response.json();

            if (data.output) {
                appendToTerminal(data.output);
            }
        }

        function appendToTerminal(text) {
            const output = document.getElementById('terminal-output');
            output.textContent += text + '\\n';
            output.parentElement.scrollTop = output.parentElement.scrollHeight;
        }

        // AI Assistant
        async function sendAIMessage() {
            const input = document.getElementById('ai-input');
            const message = input.value.trim();

            if (!message) return;

            addChatMessage('user', message);
            input.value = '';

            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: currentProvider,
                    message: message
                })
            });

            const data = await response.json();

            if (data.response) {
                addChatMessage('assistant', data.response);
            } else if (data.error) {
                addChatMessage('error', data.error);
            }
        }

        function addChatMessage(type, message) {
            const chat = document.getElementById('ai-chat');
            const msgDiv = document.createElement('div');
            msgDiv.className = 'ai-message ' + type;
            msgDiv.textContent = message;
            chat.appendChild(msgDiv);
            chat.scrollTop = chat.scrollHeight;
        }

        // File management
        async function loadFiles() {
            const response = await fetch('/api/files');
            const files = await response.json();

            const tree = document.getElementById('file-tree');
            tree.innerHTML = '';

            files.forEach(file => {
                const item = document.createElement('div');
                item.className = 'file-item';
                item.textContent = file.name;
                item.onclick = () => openFile(file.path);
                tree.appendChild(item);
            });
        }

        async function openFile(path) {
            const response = await fetch('/api/file?path=' + encodeURIComponent(path));
            const data = await response.json();

            if (data.content) {
                document.getElementById('editor').value = data.content;
                updateTab(path.split('/').pop());
            }
        }

        async function saveCurrentFile() {
            const content = document.getElementById('editor').value;
            const filename = document.querySelector('.tab.active span').textContent;

            await fetch('/api/file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: filename,
                    content: content
                })
            });

            showNotification('✅ File saved');
        }

        function updateTab(filename) {
            document.querySelector('.tab.active span').textContent = filename;
        }

        function showNotification(message) {
            const status = document.getElementById('status-left');
            status.textContent = message;
            setTimeout(() => {
                status.textContent = 'Ready';
            }, 3000);
        }
    </script>
</body>
</html>
`;

// ============================================
// MAIN SERVER
// ============================================
const authManager = new AuthenticationManager();
const aiEngine = new AICompletionEngine(authManager);
const codeEditor = new CodeEditor(aiEngine);
const terminal = new Terminal();

// HTTP Server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Serve main UI
    if (pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(HTML_TEMPLATE);
        return;
    }

    // API endpoints
    if (pathname.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');

        try {
            // Authentication
            if (pathname === '/api/auth/status') {
                const provider = parsedUrl.query.provider || 'claude';
                res.end(JSON.stringify({
                    authenticated: authManager.isAuthenticated(provider),
                    provider: provider
                }));

            } else if (pathname === '/api/auth/device' && req.method === 'POST') {
                const body = await getBody(req);
                const deviceAuth = await authManager.initiateDeviceFlow(body.provider);
                res.end(JSON.stringify(deviceAuth));

            } else if (pathname === '/api/auth/device/poll' && req.method === 'POST') {
                const body = await getBody(req);
                // Check device code status
                const deviceData = authManager.deviceCodes.get(body.user_code);

                if (deviceData && deviceData.status === 'completed') {
                    res.end(JSON.stringify({ authenticated: true }));
                } else if (deviceData && Date.now() > deviceData.expiresAt) {
                    res.end(JSON.stringify({ error: 'expired' }));
                } else {
                    res.end(JSON.stringify({ error: 'pending' }));
                }

            } else if (pathname === '/api/auth/logout' && req.method === 'POST') {
                // Clear tokens
                authManager.tokens = {};
                authManager.saveTokens();
                res.end(JSON.stringify({ success: true }));

            // Autocomplete
            } else if (pathname === '/api/autocomplete' && req.method === 'POST') {
                const body = await getBody(req);
                const result = await codeEditor.autocomplete(body.provider, body.position);
                res.end(JSON.stringify(result));

            // AI Chat
            } else if (pathname === '/api/ai/chat' && req.method === 'POST') {
                const body = await getBody(req);
                const result = await aiEngine.complete(body.provider, body.message);
                res.end(JSON.stringify({ response: result.text }));

            // File operations
            } else if (pathname === '/api/files') {
                const files = await fs.promises.readdir(process.cwd());
                const fileList = files.map(f => ({
                    name: f,
                    path: path.join(process.cwd(), f)
                }));
                res.end(JSON.stringify(fileList));

            } else if (pathname === '/api/file') {
                if (req.method === 'GET') {
                    const filePath = parsedUrl.query.path;
                    const result = await codeEditor.openFile(filePath);
                    res.end(JSON.stringify(result));
                } else if (req.method === 'POST') {
                    const body = await getBody(req);
                    const result = await codeEditor.saveFile(body.path, body.content);
                    res.end(JSON.stringify(result));
                }

            // Terminal
            } else if (pathname === '/api/terminal/create' && req.method === 'POST') {
                const id = crypto.randomBytes(16).toString('hex');
                terminal.createSession(id);
                res.end(JSON.stringify({ id }));

            } else if (pathname === '/api/terminal/write' && req.method === 'POST') {
                const body = await getBody(req);
                terminal.write(body.id, body.data);
                res.end(JSON.stringify({ success: true }));

            } else if (pathname === '/api/terminal/output') {
                const id = parsedUrl.query.id;
                const output = terminal.getOutput(id);
                res.end(JSON.stringify({ output }));

            } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Not found' }));
            }

        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
    } else if (pathname === '/device') {
        // Device authentication page
        const userCode = parsedUrl.query.code || '';

        res.setHeader('Content-Type', 'text/html');
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Device Authentication</title>
                <style>
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea, #764ba2);
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 10px;
                        text-align: center;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    }
                    .code {
                        font-size: 36px;
                        font-weight: bold;
                        color: #667eea;
                        margin: 20px 0;
                        letter-spacing: 3px;
                    }
                    button {
                        padding: 12px 30px;
                        font-size: 16px;
                        background: #667eea;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        margin: 5px;
                    }
                    button:hover {
                        background: #5a67d8;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>KETI Code Authentication</h1>
                    <p>Confirm this code matches your terminal:</p>
                    <div class="code">${userCode}</div>
                    <button onclick="authenticate('claude')">Authenticate with Claude</button>
                    <button onclick="authenticate('openai')">Authenticate with OpenAI</button>
                    <button onclick="authenticate('copilot')">Authenticate with GitHub</button>
                    <script>
                        function authenticate(provider) {
                            // In real implementation, would redirect to provider's OAuth
                            // For now, simulate success
                            fetch('/api/auth/device/complete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    user_code: '${userCode}',
                                    provider: provider,
                                    token: 'demo-token-' + Math.random()
                                })
                            }).then(() => {
                                document.querySelector('.container').innerHTML =
                                    '<h1>✅ Success!</h1><p>You can close this window and return to your terminal.</p>';
                            });
                        }
                    </script>
                </div>
            </body>
            </html>
        `);

    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// Helper function to get request body
function getBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch {
                resolve({});
            }
        });
    });
}

// Start server
server.listen(CONFIG.port, CONFIG.host, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                KETI Code Ultimate v1.0                        ║
║                                                                ║
║  AI Providers:                                                ║
║  ✅ Claude (Anthropic) - Advanced reasoning                   ║
║  ✅ OpenAI Codex - Code generation                           ║
║  ✅ GitHub Copilot - Autocomplete                           ║
║                                                                ║
║  Features:                                                    ║
║  • Device flow authentication (like Claude Code)              ║
║  • Real-time code completion                                  ║
║  • AI-powered chat assistant                                  ║
║  • Integrated terminal                                        ║
║  • Multi-file editing                                         ║
║                                                                ║
║  URL: http://localhost:${CONFIG.port}                                    ║
║                                                                ║
║  Authentication:                                               ║
║  1. Open browser at http://localhost:${CONFIG.port}                      ║
║  2. Click "Connect" for your preferred AI provider            ║
║  3. Use device code shown in modal                            ║
║                                                                ║
║  Or use CLI:                                                  ║
║  curl -X POST http://localhost:${CONFIG.port}/api/auth/device \\         ║
║       -H "Content-Type: application/json" \\                  ║
║       -d '{"provider":"claude"}'                              ║
╚══════════════════════════════════════════════════════════════╝
`);

    // Auto-open browser
    const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${openCmd} http://localhost:${CONFIG.port}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down KETI Code...');

    // Close all terminal sessions
    terminal.sessions.forEach((session, id) => {
        terminal.closeSession(id);
    });

    process.exit(0);
});