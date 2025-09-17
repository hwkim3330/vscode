#!/usr/bin/env node

/**
 * KETI Code - Unified AI Code Editor
 * Complete implementation with Codex/Copilot/Claude authentication
 * Zero dependencies - Works on Ubuntu 18.04+
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');
const readline = require('readline');

// Import our modules
const { CodexAuth } = require('./keti-codex-auth');
const { CodeCompletionEngine } = require('./keti-copilot-complete');

const PORT = process.env.KETI_PORT || 3000;
const KETI_HOME = process.env.KETI_HOME || path.join(os.homedir(), '.keti');

/**
 * Unified AI Provider System
 */
class UnifiedAISystem {
    constructor() {
        this.auth = new CodexAuth();
        this.completion = null;
        this.sessions = new Map();

        // Initialize if authenticated
        if (this.auth.isAuthenticated()) {
            this.completion = new CodeCompletionEngine(this.auth.authConfig);
        }
    }

    /**
     * Initialize authentication
     */
    async initialize() {
        if (!this.auth.isAuthenticated()) {
            console.log('🔐 Authentication required');
            await this.auth.login();
        }

        this.completion = new CodeCompletionEngine(this.auth.authConfig);
        return this.auth.authConfig;
    }

    /**
     * Get AI completion
     */
    async getAICompletion(prompt, options = {}) {
        if (!this.completion) {
            throw new Error('Not authenticated');
        }

        return this.completion.getCompletion(prompt, options);
    }

    /**
     * Get inline suggestion
     */
    async getInlineSuggestion(context) {
        if (!this.completion) {
            throw new Error('Not authenticated');
        }

        return this.completion.getInlineSuggestion(context);
    }

    /**
     * Stream completion
     */
    async* streamCompletion(prompt, options = {}) {
        if (!this.completion) {
            throw new Error('Not authenticated');
        }

        yield* this.completion.streamCompletion(prompt, options);
    }
}

/**
 * Web Server with IDE Interface
 */
class KEITCodeServer {
    constructor(aiSystem) {
        this.aiSystem = aiSystem;
        this.server = null;
        this.websockets = new Set();
    }

    /**
     * Start the server
     */
    async start() {
        // Initialize AI system
        await this.aiSystem.initialize();

        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        // Handle WebSocket upgrades
        this.server.on('upgrade', (request, socket, head) => {
            this.handleWebSocket(request, socket, head);
        });

        this.server.listen(PORT, () => {
            console.log('\n╔════════════════════════════════════════╗');
            console.log('║         KETI Code - Running            ║');
            console.log('╚════════════════════════════════════════╝\n');
            console.log(`🚀 Server: http://localhost:${PORT}`);
            console.log(`🔐 Provider: ${this.aiSystem.auth.authConfig?.provider}`);
            console.log(`👤 User: ${this.aiSystem.auth.authConfig?.user?.email}\n`);

            // Open browser
            this.openBrowser(`http://localhost:${PORT}`);
        });
    }

    /**
     * Handle HTTP requests
     */
    handleRequest(req, res) {
        const url = new URL(req.url, `http://localhost:${PORT}`);

        if (url.pathname === '/') {
            this.serveHTML(res);
        } else if (url.pathname === '/api/complete') {
            this.handleCompletion(req, res);
        } else if (url.pathname === '/api/suggest') {
            this.handleSuggestion(req, res);
        } else if (url.pathname === '/api/status') {
            this.handleStatus(req, res);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }

    /**
     * Serve main HTML interface
     */
    serveHTML(res) {
        const html = `<!DOCTYPE html>
<html>
<head>
    <title>KETI Code - AI Code Editor</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            background: #1e1e1e;
            color: #d4d4d4;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            background: #2d2d30;
            padding: 10px 20px;
            border-bottom: 1px solid #3e3e42;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .logo {
            font-size: 16px;
            font-weight: bold;
            color: #007acc;
        }

        .status {
            display: flex;
            gap: 20px;
            align-items: center;
            font-size: 12px;
            color: #969696;
        }

        .provider {
            padding: 4px 8px;
            background: #007acc;
            color: white;
            border-radius: 3px;
        }

        .main-container {
            flex: 1;
            display: flex;
            overflow: hidden;
        }

        .sidebar {
            width: 50px;
            background: #252526;
            border-right: 1px solid #3e3e42;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 10px 0;
        }

        .sidebar-icon {
            width: 30px;
            height: 30px;
            margin: 10px 0;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: #858585;
            transition: color 0.2s;
        }

        .sidebar-icon:hover {
            color: #d4d4d4;
        }

        .sidebar-icon.active {
            color: #007acc;
        }

        .editor-container {
            flex: 1;
            display: flex;
            flex-direction: column;
        }

        .tabs {
            background: #2d2d30;
            display: flex;
            border-bottom: 1px solid #3e3e42;
            min-height: 35px;
        }

        .tab {
            padding: 8px 20px;
            background: #2d2d30;
            border-right: 1px solid #3e3e42;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
        }

        .tab.active {
            background: #1e1e1e;
        }

        .tab:hover {
            background: #323233;
        }

        .editor {
            flex: 1;
            padding: 20px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 14px;
            line-height: 1.6;
            overflow: auto;
            background: #1e1e1e;
            position: relative;
        }

        #code-input {
            width: 100%;
            height: 100%;
            background: transparent;
            border: none;
            color: #d4d4d4;
            font-family: inherit;
            font-size: inherit;
            line-height: inherit;
            outline: none;
            resize: none;
            tab-size: 4;
        }

        .suggestion-overlay {
            position: absolute;
            background: #252526;
            border: 1px solid #454545;
            border-radius: 3px;
            padding: 8px;
            max-width: 500px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
            z-index: 1000;
            display: none;
        }

        .suggestion-item {
            padding: 4px 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .suggestion-item:hover {
            background: #2a2d2e;
        }

        .suggestion-text {
            flex: 1;
            color: #cccccc;
            font-family: 'Consolas', monospace;
            white-space: pre;
        }

        .suggestion-confidence {
            color: #969696;
            font-size: 11px;
        }

        .bottom-panel {
            height: 200px;
            background: #1e1e1e;
            border-top: 1px solid #3e3e42;
            display: flex;
            flex-direction: column;
        }

        .panel-tabs {
            background: #2d2d30;
            display: flex;
            padding: 0 10px;
            min-height: 30px;
        }

        .panel-tab {
            padding: 6px 12px;
            cursor: pointer;
            font-size: 12px;
            color: #969696;
        }

        .panel-tab.active {
            color: #d4d4d4;
            border-bottom: 2px solid #007acc;
        }

        .terminal {
            flex: 1;
            padding: 10px;
            background: #1e1e1e;
            color: #cccccc;
            font-family: 'Consolas', monospace;
            font-size: 12px;
            overflow-y: auto;
        }

        .terminal-input {
            display: flex;
            align-items: center;
            margin-top: 5px;
        }

        .terminal-prompt {
            color: #569cd6;
            margin-right: 5px;
        }

        #terminal-input {
            flex: 1;
            background: transparent;
            border: none;
            color: #d4d4d4;
            font-family: inherit;
            font-size: inherit;
            outline: none;
        }

        .ai-chat {
            flex: 1;
            padding: 10px;
            background: #1e1e1e;
            overflow-y: auto;
            display: none;
        }

        .chat-message {
            margin-bottom: 10px;
            padding: 8px;
            border-radius: 4px;
        }

        .chat-user {
            background: #2d2d30;
            margin-left: 20%;
        }

        .chat-ai {
            background: #252526;
            margin-right: 20%;
        }

        .chat-input-container {
            display: flex;
            padding: 10px;
            background: #252526;
            border-top: 1px solid #3e3e42;
        }

        #chat-input {
            flex: 1;
            background: #1e1e1e;
            border: 1px solid #3e3e42;
            color: #d4d4d4;
            padding: 8px;
            font-family: inherit;
            font-size: 13px;
            border-radius: 3px;
            outline: none;
        }

        .chat-send {
            margin-left: 10px;
            padding: 8px 16px;
            background: #007acc;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
        }

        .chat-send:hover {
            background: #005a9e;
        }

        /* Syntax highlighting */
        .keyword { color: #569cd6; }
        .string { color: #ce9178; }
        .comment { color: #6a9955; }
        .number { color: #b5cea8; }
        .function { color: #dcdcaa; }
        .operator { color: #d4d4d4; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">KETI Code</div>
        <div class="status">
            <span class="provider" id="provider-badge">Loading...</span>
            <span id="user-info">Initializing...</span>
            <span id="connection-status">🟢 Connected</span>
        </div>
    </div>

    <div class="main-container">
        <div class="sidebar">
            <div class="sidebar-icon active" title="Explorer">📁</div>
            <div class="sidebar-icon" title="Search">🔍</div>
            <div class="sidebar-icon" title="Git">🌿</div>
            <div class="sidebar-icon" title="Debug">🐛</div>
            <div class="sidebar-icon" title="Extensions">🧩</div>
        </div>

        <div class="editor-container">
            <div class="tabs">
                <div class="tab active">
                    <span>main.js</span>
                    <span style="color: #969696;">×</span>
                </div>
            </div>

            <div class="editor">
                <textarea id="code-input" placeholder="// Start coding with AI assistance...
// Press Ctrl+Space for suggestions
// Press Tab to accept suggestion
// Use the terminal below or chat with AI"></textarea>
                <div class="suggestion-overlay" id="suggestions"></div>
            </div>
        </div>
    </div>

    <div class="bottom-panel">
        <div class="panel-tabs">
            <div class="panel-tab active" onclick="switchPanel('terminal')">Terminal</div>
            <div class="panel-tab" onclick="switchPanel('ai-chat')">AI Chat</div>
            <div class="panel-tab" onclick="switchPanel('problems')">Problems</div>
            <div class="panel-tab" onclick="switchPanel('output')">Output</div>
        </div>

        <div class="terminal" id="terminal-panel">
            <div id="terminal-output"></div>
            <div class="terminal-input">
                <span class="terminal-prompt">$</span>
                <input type="text" id="terminal-input" placeholder="Enter command...">
            </div>
        </div>

        <div class="ai-chat" id="ai-chat-panel">
            <div id="chat-messages"></div>
            <div class="chat-input-container">
                <input type="text" id="chat-input" placeholder="Ask AI anything about your code...">
                <button class="chat-send" onclick="sendChatMessage()">Send</button>
            </div>
        </div>
    </div>

    <script>
        let ws = null;
        let currentSuggestions = [];
        let suggestionTimeout = null;

        // Initialize WebSocket connection
        function initWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(protocol + '//' + window.location.host + '/ws');

            ws.onopen = () => {
                console.log('WebSocket connected');
                document.getElementById('connection-status').textContent = '🟢 Connected';
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                handleMessage(data);
            };

            ws.onclose = () => {
                console.log('WebSocket disconnected');
                document.getElementById('connection-status').textContent = '🔴 Disconnected';
                // Reconnect after 2 seconds
                setTimeout(initWebSocket, 2000);
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        }

        // Handle incoming messages
        function handleMessage(data) {
            switch (data.type) {
                case 'suggestion':
                    showSuggestions(data.suggestions);
                    break;
                case 'completion':
                    insertCompletion(data.text);
                    break;
                case 'terminal':
                    appendTerminalOutput(data.output);
                    break;
                case 'chat':
                    appendChatMessage(data.message, 'ai');
                    break;
                case 'status':
                    updateStatus(data);
                    break;
            }
        }

        // Code editor functionality
        const codeInput = document.getElementById('code-input');

        codeInput.addEventListener('keydown', async (e) => {
            // Ctrl+Space for suggestions
            if (e.ctrlKey && e.code === 'Space') {
                e.preventDefault();
                requestSuggestions();
            }
            // Tab to accept suggestion
            else if (e.code === 'Tab' && currentSuggestions.length > 0) {
                e.preventDefault();
                acceptSuggestion(0);
            }
        });

        codeInput.addEventListener('input', () => {
            // Debounce suggestions
            clearTimeout(suggestionTimeout);
            suggestionTimeout = setTimeout(() => {
                requestSuggestions();
            }, 500);
        });

        // Request AI suggestions
        async function requestSuggestions() {
            const code = codeInput.value;
            const cursorPos = codeInput.selectionStart;

            const prefix = code.substring(0, cursorPos);
            const suffix = code.substring(cursorPos);

            const response = await fetch('/api/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prefix,
                    suffix,
                    filename: 'main.js',
                    language: 'javascript'
                })
            });

            const suggestions = await response.json();
            showSuggestions(suggestions);
        }

        // Show suggestions overlay
        function showSuggestions(suggestions) {
            currentSuggestions = suggestions;
            const overlay = document.getElementById('suggestions');

            if (!suggestions || suggestions.length === 0) {
                overlay.style.display = 'none';
                return;
            }

            overlay.innerHTML = suggestions.map((s, i) =>
                '<div class="suggestion-item" onclick="acceptSuggestion(' + i + ')">' +
                    '<span class="suggestion-text">' + escapeHtml(s.displayText) + '</span>' +
                    '<span class="suggestion-confidence">' + Math.round(s.confidence * 100) + '%</span>' +
                '</div>'
            ).join('');

            // Position overlay at cursor
            const rect = codeInput.getBoundingClientRect();
            overlay.style.left = '20px';
            overlay.style.top = '50px';
            overlay.style.display = 'block';
        }

        // Accept suggestion
        function acceptSuggestion(index) {
            const suggestion = currentSuggestions[index];
            if (!suggestion) return;

            const cursorPos = codeInput.selectionStart;
            const code = codeInput.value;

            const newCode = code.substring(0, cursorPos) + suggestion.text + code.substring(cursorPos);
            codeInput.value = newCode;
            codeInput.selectionStart = codeInput.selectionEnd = cursorPos + suggestion.text.length;

            document.getElementById('suggestions').style.display = 'none';
            currentSuggestions = [];
        }

        // Terminal functionality
        const terminalInput = document.getElementById('terminal-input');

        terminalInput.addEventListener('keydown', (e) => {
            if (e.code === 'Enter') {
                const command = terminalInput.value;
                if (command) {
                    executeCommand(command);
                    terminalInput.value = '';
                }
            }
        });

        function executeCommand(command) {
            appendTerminalOutput('$ ' + command);

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'terminal',
                    command
                }));
            }
        }

        function appendTerminalOutput(text) {
            const output = document.getElementById('terminal-output');
            const line = document.createElement('div');
            line.textContent = text;
            output.appendChild(line);
            output.scrollTop = output.scrollHeight;
        }

        // AI Chat functionality
        function sendChatMessage() {
            const input = document.getElementById('chat-input');
            const message = input.value.trim();

            if (!message) return;

            appendChatMessage(message, 'user');

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'chat',
                    message
                }));
            }

            input.value = '';
        }

        function appendChatMessage(text, sender) {
            const messages = document.getElementById('chat-messages');
            const message = document.createElement('div');
            message.className = 'chat-message chat-' + sender;
            message.textContent = text;
            messages.appendChild(message);
            messages.scrollTop = messages.scrollHeight;
        }

        document.getElementById('chat-input').addEventListener('keydown', (e) => {
            if (e.code === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });

        // Panel switching
        function switchPanel(panel) {
            // Hide all panels
            document.getElementById('terminal-panel').style.display = 'none';
            document.getElementById('ai-chat-panel').style.display = 'none';

            // Remove active class from all tabs
            document.querySelectorAll('.panel-tab').forEach(tab => {
                tab.classList.remove('active');
            });

            // Show selected panel
            if (panel === 'terminal') {
                document.getElementById('terminal-panel').style.display = 'flex';
            } else if (panel === 'ai-chat') {
                document.getElementById('ai-chat-panel').style.display = 'flex';
            }

            // Add active class to clicked tab
            event.target.classList.add('active');
        }

        // Update status
        async function updateStatus(data) {
            if (data) {
                document.getElementById('provider-badge').textContent = data.provider || 'Unknown';
                document.getElementById('user-info').textContent = data.user || 'Not authenticated';
            } else {
                // Fetch status from API
                const response = await fetch('/api/status');
                const status = await response.json();
                document.getElementById('provider-badge').textContent = status.provider || 'Unknown';
                document.getElementById('user-info').textContent = status.user || 'Not authenticated';
            }
        }

        // Utility functions
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Initialize
        initWebSocket();
        updateStatus();

        // Add some sample code
        codeInput.value = '// Welcome to KETI Code!\\n' +
            '// AI-powered code editor with Codex/Copilot-style completions\\n\\n' +
            'function fibonacci(n) {\\n' +
            '    // Press Ctrl+Space here for AI suggestions\\n\\n' +
            '}\\n\\n' +
            '// Try typing and see real-time AI completions\\n' +
            '// Use the terminal below or chat with AI\\n';
    </script>
</body>
</html>`;

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    }

    /**
     * Handle completion API
     */
    async handleCompletion(req, res) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const response = await this.aiSystem.getAICompletion(data.prompt, data.options);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    }

    /**
     * Handle suggestion API
     */
    async handleSuggestion(req, res) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const context = JSON.parse(body);
                const suggestions = await this.aiSystem.getInlineSuggestion(context);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(suggestions));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    }

    /**
     * Handle status API
     */
    handleStatus(req, res) {
        const status = {
            authenticated: this.aiSystem.auth.isAuthenticated(),
            provider: this.aiSystem.auth.authConfig?.provider,
            user: this.aiSystem.auth.authConfig?.user?.email,
            plan: this.aiSystem.auth.authConfig?.user?.plan
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
    }

    /**
     * Handle WebSocket connections
     */
    handleWebSocket(request, socket, head) {
        // Simple WebSocket handshake
        const key = request.headers['sec-websocket-key'];
        const acceptKey = this.generateAcceptKey(key);

        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
        );

        this.websockets.add(socket);

        socket.on('data', async (buffer) => {
            try {
                const message = this.parseWebSocketFrame(buffer);
                if (message) {
                    await this.handleWebSocketMessage(socket, JSON.parse(message));
                }
            } catch (error) {
                console.error('WebSocket error:', error);
            }
        });

        socket.on('close', () => {
            this.websockets.delete(socket);
        });
    }

    /**
     * Generate WebSocket accept key
     */
    generateAcceptKey(key) {
        const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
        return crypto
            .createHash('sha1')
            .update(key + GUID)
            .digest('base64');
    }

    /**
     * Parse WebSocket frame
     */
    parseWebSocketFrame(buffer) {
        if (buffer.length < 2) return null;

        const firstByte = buffer[0];
        const secondByte = buffer[1];

        const fin = !!(firstByte & 0x80);
        const opcode = firstByte & 0x0F;
        const masked = !!(secondByte & 0x80);
        let payloadLength = secondByte & 0x7F;

        let offset = 2;

        if (payloadLength === 126) {
            payloadLength = buffer.readUInt16BE(offset);
            offset += 2;
        } else if (payloadLength === 127) {
            offset += 8;
            payloadLength = buffer.readUInt32BE(offset - 4);
        }

        let maskKey;
        if (masked) {
            maskKey = buffer.slice(offset, offset + 4);
            offset += 4;
        }

        const payload = buffer.slice(offset, offset + payloadLength);

        if (masked) {
            for (let i = 0; i < payload.length; i++) {
                payload[i] ^= maskKey[i % 4];
            }
        }

        return payload.toString();
    }

    /**
     * Send WebSocket message
     */
    sendWebSocketMessage(socket, data) {
        const message = JSON.stringify(data);
        const length = Buffer.byteLength(message);

        let frame;
        if (length < 126) {
            frame = Buffer.allocUnsafe(2);
            frame[0] = 0x81;
            frame[1] = length;
        } else if (length < 65536) {
            frame = Buffer.allocUnsafe(4);
            frame[0] = 0x81;
            frame[1] = 126;
            frame.writeUInt16BE(length, 2);
        } else {
            frame = Buffer.allocUnsafe(10);
            frame[0] = 0x81;
            frame[1] = 127;
            frame.writeUInt32BE(0, 2);
            frame.writeUInt32BE(length, 6);
        }

        socket.write(Buffer.concat([frame, Buffer.from(message)]));
    }

    /**
     * Handle WebSocket messages
     */
    async handleWebSocketMessage(socket, message) {
        switch (message.type) {
            case 'terminal':
                // Execute terminal command
                const output = await this.executeCommand(message.command);
                this.sendWebSocketMessage(socket, {
                    type: 'terminal',
                    output
                });
                break;

            case 'chat':
                // Handle AI chat
                const response = await this.aiSystem.getAICompletion(message.message);
                this.sendWebSocketMessage(socket, {
                    type: 'chat',
                    message: response.completions[0]?.text || 'No response'
                });
                break;

            case 'complete':
                // Get completion
                const completion = await this.aiSystem.getAICompletion(message.prompt, message.options);
                this.sendWebSocketMessage(socket, {
                    type: 'completion',
                    text: completion.completions[0]?.text || ''
                });
                break;

            case 'suggest':
                // Get suggestions
                const suggestions = await this.aiSystem.getInlineSuggestion(message.context);
                this.sendWebSocketMessage(socket, {
                    type: 'suggestion',
                    suggestions
                });
                break;
        }
    }

    /**
     * Execute terminal command
     */
    executeCommand(command) {
        return new Promise((resolve) => {
            const child = spawn('sh', ['-c', command], {
                cwd: process.cwd(),
                env: process.env
            });

            let output = '';

            child.stdout.on('data', (data) => {
                output += data.toString();
            });

            child.stderr.on('data', (data) => {
                output += data.toString();
            });

            child.on('close', () => {
                resolve(output || 'Command completed');
            });

            // Timeout after 10 seconds
            setTimeout(() => {
                child.kill();
                resolve(output || 'Command timed out');
            }, 10000);
        });
    }

    /**
     * Open browser
     */
    openBrowser(url) {
        const commands = {
            darwin: ['open'],
            win32: ['cmd', '/c', 'start'],
            linux: ['xdg-open']
        };

        const command = commands[process.platform];
        if (command) {
            const child = spawn(command[0], [...command.slice(1), url], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
        }
    }
}

/**
 * Main function
 */
async function main() {
    console.log('\\n╔════════════════════════════════════════╗');
    console.log('║           KETI Code v1.0               ║');
    console.log('║    AI-Powered Code Editor              ║');
    console.log('║  Codex + Copilot + Claude Integration  ║');
    console.log('╚════════════════════════════════════════╝\\n');

    // Create AI system
    const aiSystem = new UnifiedAISystem();

    // Create and start server
    const server = new KEITCodeServer(aiSystem);
    await server.start();
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { UnifiedAISystem, KEITCodeServer };