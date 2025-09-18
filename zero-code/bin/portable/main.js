#!/usr/bin/env node

/**
 * Zero Code CLI - Universal AI Code Editor
 * Compatible with Node.js 8.0+
 * Zero npm dependencies
 */

'use strict';

var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');
var os = require('os');
var crypto = require('crypto');
var child_process = require('child_process');
var readline = require('readline');
var url = require('url');
var util = require('util');

// Version check
var nodeVersion = process.versions.node.split('.');
var majorVersion = parseInt(nodeVersion[0]);
if (majorVersion < 8) {
    console.error('Error: Node.js 8.0+ required. Current version: ' + process.version);
    process.exit(1);
}

// Configuration
var CONFIG = {
    name: 'Zero Code',
    version: '1.0.0',
    port: parseInt(process.env.ZERO_PORT) || 3456,
    host: process.env.ZERO_HOST || '127.0.0.1',
    configDir: path.join(os.homedir(), '.zero-code'),
    dataFile: 'config.json',
    debug: process.env.DEBUG === 'true'
};

// Colors for terminal (ANSI codes)
var COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

// Ensure config directory exists
try {
    if (!fs.existsSync(CONFIG.configDir)) {
        fs.mkdirSync(CONFIG.configDir, { recursive: true });
    }
} catch (err) {
    // Fallback for Node.js 8 (no recursive option)
    var mkdirp = function(dir) {
        try {
            fs.mkdirSync(dir);
        } catch(e) {
            if (e.code === 'ENOENT') {
                mkdirp(path.dirname(dir));
                mkdirp(dir);
            } else if (e.code !== 'EEXIST') {
                throw e;
            }
        }
    };
    mkdirp(CONFIG.configDir);
}

/**
 * AI Provider Configurations
 */
var AI_PROVIDERS = {
    claude: {
        name: 'Claude (Anthropic)',
        host: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
        defaultModel: 'claude-3-sonnet-20240229',
        headers: function(apiKey) {
            return {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            };
        },
        formatRequest: function(prompt, model) {
            return JSON.stringify({
                model: model || this.defaultModel,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 4096
            });
        },
        parseResponse: function(data) {
            try {
                var parsed = JSON.parse(data);
                if (parsed.content && parsed.content[0]) {
                    return parsed.content[0].text;
                }
                return parsed.error ? parsed.error.message : 'No response';
            } catch (e) {
                return 'Error parsing response';
            }
        }
    },

    openai: {
        name: 'OpenAI (GPT/Codex)',
        host: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        models: ['gpt-4', 'gpt-4-turbo-preview', 'gpt-3.5-turbo'],
        defaultModel: 'gpt-3.5-turbo',
        headers: function(apiKey) {
            return {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json'
            };
        },
        formatRequest: function(prompt, model) {
            return JSON.stringify({
                model: model || this.defaultModel,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 4096
            });
        },
        parseResponse: function(data) {
            try {
                var parsed = JSON.parse(data);
                if (parsed.choices && parsed.choices[0]) {
                    return parsed.choices[0].message.content;
                }
                return parsed.error ? parsed.error.message : 'No response';
            } catch (e) {
                return 'Error parsing response';
            }
        }
    },

    gemini: {
        name: 'Google Gemini',
        host: 'generativelanguage.googleapis.com',
        method: 'POST',
        models: ['gemini-pro', 'gemini-1.5-pro-latest', 'gemini-1.5-flash-latest'],
        defaultModel: 'gemini-pro',
        headers: function() {
            return {
                'Content-Type': 'application/json'
            };
        },
        getPath: function(model, apiKey) {
            return '/v1beta/models/' + (model || this.defaultModel) + ':generateContent?key=' + apiKey;
        },
        formatRequest: function(prompt) {
            return JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 4096
                }
            });
        },
        parseResponse: function(data) {
            try {
                var parsed = JSON.parse(data);
                if (parsed.candidates && parsed.candidates[0]) {
                    var content = parsed.candidates[0].content;
                    if (content && content.parts && content.parts[0]) {
                        return content.parts[0].text;
                    }
                }
                return parsed.error ? parsed.error.message : 'No response';
            } catch (e) {
                return 'Error parsing response';
            }
        }
    }
};

/**
 * Load configuration
 */
function loadConfig() {
    var configPath = path.join(CONFIG.configDir, CONFIG.dataFile);
    try {
        if (fs.existsSync(configPath)) {
            var data = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        if (CONFIG.debug) console.error('Failed to load config:', e);
    }
    return { providers: {} };
}

/**
 * Save configuration
 */
function saveConfig(config) {
    var configPath = path.join(CONFIG.configDir, CONFIG.dataFile);
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
    } catch (e) {
        if (CONFIG.debug) console.error('Failed to save config:', e);
        return false;
    }
}

/**
 * Call AI API
 */
function callAI(provider, prompt, callback) {
    var config = loadConfig();
    var providerConfig = AI_PROVIDERS[provider];

    if (!providerConfig) {
        callback(new Error('Unknown provider: ' + provider));
        return;
    }

    if (!config.providers[provider] || !config.providers[provider].apiKey) {
        callback(new Error('No API key configured for ' + provider));
        return;
    }

    var apiKey = config.providers[provider].apiKey;
    var model = config.providers[provider].model || providerConfig.defaultModel;

    var requestBody = providerConfig.formatRequest(prompt, model);
    var headers = providerConfig.headers(apiKey);
    headers['Content-Length'] = Buffer.byteLength(requestBody);

    var options = {
        hostname: providerConfig.host,
        path: providerConfig.getPath ? providerConfig.getPath(model, apiKey) : providerConfig.path,
        method: providerConfig.method,
        headers: headers
    };

    if (CONFIG.debug) {
        console.log('API Request to', provider + ':', options.hostname + options.path);
    }

    var req = https.request(options, function(res) {
        var data = '';
        res.on('data', function(chunk) {
            data += chunk;
        });
        res.on('end', function() {
            if (CONFIG.debug) {
                console.log('API Response:', data.substring(0, 200));
            }
            var response = providerConfig.parseResponse(data);
            callback(null, response);
        });
    });

    req.on('error', function(e) {
        callback(e);
    });

    req.write(requestBody);
    req.end();
}

/**
 * Web interface HTML
 */
function getHTML() {
    return '<!DOCTYPE html>\n' +
'<html>\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <title>Zero Code - AI Code Editor</title>\n' +
'    <style>\n' +
'        * { margin: 0; padding: 0; box-sizing: border-box; }\n' +
'        body {\n' +
'            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\n' +
'            background: #1e1e1e;\n' +
'            color: #d4d4d4;\n' +
'            height: 100vh;\n' +
'            display: flex;\n' +
'            flex-direction: column;\n' +
'        }\n' +
'        .header {\n' +
'            background: #2d2d30;\n' +
'            border-bottom: 1px solid #3e3e42;\n' +
'            padding: 10px 20px;\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            justify-content: space-between;\n' +
'        }\n' +
'        .logo {\n' +
'            font-size: 18px;\n' +
'            font-weight: bold;\n' +
'            color: #007acc;\n' +
'        }\n' +
'        .main {\n' +
'            flex: 1;\n' +
'            display: flex;\n' +
'            overflow: hidden;\n' +
'        }\n' +
'        .sidebar {\n' +
'            width: 240px;\n' +
'            background: #252526;\n' +
'            border-right: 1px solid #3e3e42;\n' +
'            padding: 20px;\n' +
'        }\n' +
'        .editor {\n' +
'            flex: 1;\n' +
'            display: flex;\n' +
'            flex-direction: column;\n' +
'        }\n' +
'        .editor-header {\n' +
'            background: #2d2d30;\n' +
'            padding: 10px;\n' +
'            border-bottom: 1px solid #3e3e42;\n' +
'        }\n' +
'        #code-area {\n' +
'            flex: 1;\n' +
'            background: #1e1e1e;\n' +
'            color: #d4d4d4;\n' +
'            border: none;\n' +
'            padding: 20px;\n' +
'            font-family: "Consolas", "Monaco", monospace;\n' +
'            font-size: 14px;\n' +
'            resize: none;\n' +
'            outline: none;\n' +
'        }\n' +
'        .ai-panel {\n' +
'            width: 350px;\n' +
'            background: #252526;\n' +
'            border-left: 1px solid #3e3e42;\n' +
'            display: flex;\n' +
'            flex-direction: column;\n' +
'        }\n' +
'        .ai-header {\n' +
'            background: #2d2d30;\n' +
'            padding: 10px;\n' +
'            border-bottom: 1px solid #3e3e42;\n' +
'        }\n' +
'        .ai-chat {\n' +
'            flex: 1;\n' +
'            padding: 10px;\n' +
'            overflow-y: auto;\n' +
'        }\n' +
'        .ai-input {\n' +
'            padding: 10px;\n' +
'            border-top: 1px solid #3e3e42;\n' +
'        }\n' +
'        .ai-input textarea {\n' +
'            width: 100%;\n' +
'            background: #3c3c3c;\n' +
'            border: 1px solid #464647;\n' +
'            color: #cccccc;\n' +
'            padding: 8px;\n' +
'            font-family: inherit;\n' +
'            font-size: 13px;\n' +
'            resize: none;\n' +
'            outline: none;\n' +
'            border-radius: 4px;\n' +
'        }\n' +
'        .btn {\n' +
'            padding: 6px 12px;\n' +
'            background: #007acc;\n' +
'            color: white;\n' +
'            border: none;\n' +
'            border-radius: 4px;\n' +
'            cursor: pointer;\n' +
'            font-size: 13px;\n' +
'            margin: 2px;\n' +
'        }\n' +
'        .btn:hover { background: #005a9e; }\n' +
'        .btn.secondary {\n' +
'            background: #3e3e42;\n' +
'        }\n' +
'        .btn.secondary:hover { background: #464647; }\n' +
'        .provider-select {\n' +
'            background: #3c3c3c;\n' +
'            color: #cccccc;\n' +
'            border: 1px solid #464647;\n' +
'            padding: 4px;\n' +
'            border-radius: 4px;\n' +
'            margin-left: 10px;\n' +
'        }\n' +
'        .message {\n' +
'            margin-bottom: 10px;\n' +
'            padding: 8px;\n' +
'            border-radius: 4px;\n' +
'            font-size: 13px;\n' +
'        }\n' +
'        .message.user {\n' +
'            background: #094771;\n' +
'            margin-left: 20px;\n' +
'        }\n' +
'        .message.assistant {\n' +
'            background: #2a2a2a;\n' +
'            margin-right: 20px;\n' +
'        }\n' +
'        .file-item {\n' +
'            padding: 5px;\n' +
'            cursor: pointer;\n' +
'            border-radius: 3px;\n' +
'            margin-bottom: 2px;\n' +
'        }\n' +
'        .file-item:hover {\n' +
'            background: #2a2a2a;\n' +
'        }\n' +
'        .status {\n' +
'            padding: 5px 20px;\n' +
'            background: #007acc;\n' +
'            color: white;\n' +
'            font-size: 12px;\n' +
'        }\n' +
'        .modal {\n' +
'            display: none;\n' +
'            position: fixed;\n' +
'            top: 0;\n' +
'            left: 0;\n' +
'            width: 100%;\n' +
'            height: 100%;\n' +
'            background: rgba(0,0,0,0.8);\n' +
'            justify-content: center;\n' +
'            align-items: center;\n' +
'        }\n' +
'        .modal.active { display: flex; }\n' +
'        .modal-content {\n' +
'            background: #2d2d30;\n' +
'            padding: 20px;\n' +
'            border-radius: 8px;\n' +
'            width: 400px;\n' +
'        }\n' +
'        .modal-content h3 {\n' +
'            margin-bottom: 15px;\n' +
'            color: #cccccc;\n' +
'        }\n' +
'        .modal-content input, .modal-content select {\n' +
'            width: 100%;\n' +
'            padding: 8px;\n' +
'            background: #3c3c3c;\n' +
'            border: 1px solid #464647;\n' +
'            color: #cccccc;\n' +
'            margin-bottom: 10px;\n' +
'            border-radius: 4px;\n' +
'        }\n' +
'    </style>\n' +
'</head>\n' +
'<body>\n' +
'    <div class="header">\n' +
'        <div class="logo">⚡ Zero Code</div>\n' +
'        <div>\n' +
'            <button class="btn secondary" onclick="setupProvider()">Setup AI</button>\n' +
'            <select class="provider-select" id="providerSelect" onchange="switchProvider()">\n' +
'                <option value="">Select AI Provider</option>\n' +
'                <option value="claude">Claude</option>\n' +
'                <option value="openai">OpenAI</option>\n' +
'                <option value="gemini">Gemini</option>\n' +
'            </select>\n' +
'        </div>\n' +
'    </div>\n' +
'    \n' +
'    <div class="main">\n' +
'        <div class="sidebar">\n' +
'            <h3 style="margin-bottom: 15px; font-size: 14px;">Files</h3>\n' +
'            <div id="fileList"></div>\n' +
'        </div>\n' +
'        \n' +
'        <div class="editor">\n' +
'            <div class="editor-header">\n' +
'                <span id="currentFile">Untitled</span>\n' +
'                <button class="btn" onclick="saveFile()" style="float: right;">Save</button>\n' +
'            </div>\n' +
'            <textarea id="code-area" placeholder="Start coding here..."></textarea>\n' +
'        </div>\n' +
'        \n' +
'        <div class="ai-panel">\n' +
'            <div class="ai-header">AI Assistant</div>\n' +
'            <div class="ai-chat" id="chatHistory"></div>\n' +
'            <div class="ai-input">\n' +
'                <textarea id="aiPrompt" placeholder="Ask AI..." rows="3"></textarea>\n' +
'                <button class="btn" onclick="sendToAI()" style="margin-top: 5px; width: 100%;">Send</button>\n' +
'            </div>\n' +
'        </div>\n' +
'    </div>\n' +
'    \n' +
'    <div class="status" id="status">Ready</div>\n' +
'    \n' +
'    <!-- Setup Modal -->\n' +
'    <div class="modal" id="setupModal">\n' +
'        <div class="modal-content">\n' +
'            <h3>Setup AI Provider</h3>\n' +
'            <select id="modalProvider" onchange="updateModelList()">\n' +
'                <option value="claude">Claude (Anthropic)</option>\n' +
'                <option value="openai">OpenAI</option>\n' +
'                <option value="gemini">Google Gemini</option>\n' +
'            </select>\n' +
'            <input type="password" id="apiKey" placeholder="API Key">\n' +
'            <select id="modelSelect"></select>\n' +
'            <div style="margin-top: 15px;">\n' +
'                <button class="btn" onclick="saveSetup()">Save</button>\n' +
'                <button class="btn secondary" onclick="closeModal()">Cancel</button>\n' +
'            </div>\n' +
'        </div>\n' +
'    </div>\n' +
'    \n' +
'    <script>\n' +
'        var currentFile = null;\n' +
'        var currentProvider = null;\n' +
'        \n' +
'        // Load files\n' +
'        function loadFiles() {\n' +
'            fetch("/api/files")\n' +
'                .then(function(res) { return res.json(); })\n' +
'                .then(function(data) {\n' +
'                    var list = document.getElementById("fileList");\n' +
'                    list.innerHTML = "";\n' +
'                    data.files.forEach(function(file) {\n' +
'                        var item = document.createElement("div");\n' +
'                        item.className = "file-item";\n' +
'                        item.textContent = file;\n' +
'                        item.onclick = function() { loadFile(file); };\n' +
'                        list.appendChild(item);\n' +
'                    });\n' +
'                });\n' +
'        }\n' +
'        \n' +
'        // Load file content\n' +
'        function loadFile(filename) {\n' +
'            fetch("/api/file?name=" + encodeURIComponent(filename))\n' +
'                .then(function(res) { return res.json(); })\n' +
'                .then(function(data) {\n' +
'                    document.getElementById("code-area").value = data.content;\n' +
'                    document.getElementById("currentFile").textContent = filename;\n' +
'                    currentFile = filename;\n' +
'                    updateStatus("Loaded: " + filename);\n' +
'                });\n' +
'        }\n' +
'        \n' +
'        // Save file\n' +
'        function saveFile() {\n' +
'            var filename = currentFile || prompt("Enter filename:");\n' +
'            if (!filename) return;\n' +
'            \n' +
'            var content = document.getElementById("code-area").value;\n' +
'            \n' +
'            fetch("/api/file", {\n' +
'                method: "POST",\n' +
'                headers: { "Content-Type": "application/json" },\n' +
'                body: JSON.stringify({ name: filename, content: content })\n' +
'            })\n' +
'            .then(function(res) { return res.json(); })\n' +
'            .then(function(data) {\n' +
'                updateStatus("Saved: " + filename);\n' +
'                currentFile = filename;\n' +
'                document.getElementById("currentFile").textContent = filename;\n' +
'                loadFiles();\n' +
'            });\n' +
'        }\n' +
'        \n' +
'        // Send to AI\n' +
'        function sendToAI() {\n' +
'            var prompt = document.getElementById("aiPrompt").value;\n' +
'            if (!prompt) return;\n' +
'            \n' +
'            if (!currentProvider) {\n' +
'                alert("Please select an AI provider first");\n' +
'                return;\n' +
'            }\n' +
'            \n' +
'            addMessage(prompt, "user");\n' +
'            document.getElementById("aiPrompt").value = "";\n' +
'            \n' +
'            var codeContext = document.getElementById("code-area").value;\n' +
'            var fullPrompt = prompt;\n' +
'            if (codeContext) {\n' +
'                fullPrompt = "Code context:\\n" + codeContext + "\\n\\nQuestion: " + prompt;\n' +
'            }\n' +
'            \n' +
'            updateStatus("Asking AI...");\n' +
'            \n' +
'            fetch("/api/ai", {\n' +
'                method: "POST",\n' +
'                headers: { "Content-Type": "application/json" },\n' +
'                body: JSON.stringify({ provider: currentProvider, prompt: fullPrompt })\n' +
'            })\n' +
'            .then(function(res) { return res.json(); })\n' +
'            .then(function(data) {\n' +
'                if (data.error) {\n' +
'                    addMessage("Error: " + data.error, "assistant");\n' +
'                } else {\n' +
'                    addMessage(data.response, "assistant");\n' +
'                }\n' +
'                updateStatus("Ready");\n' +
'            });\n' +
'        }\n' +
'        \n' +
'        // Add chat message\n' +
'        function addMessage(text, type) {\n' +
'            var chat = document.getElementById("chatHistory");\n' +
'            var msg = document.createElement("div");\n' +
'            msg.className = "message " + type;\n' +
'            msg.textContent = text;\n' +
'            chat.appendChild(msg);\n' +
'            chat.scrollTop = chat.scrollHeight;\n' +
'        }\n' +
'        \n' +
'        // Setup provider\n' +
'        function setupProvider() {\n' +
'            document.getElementById("setupModal").className = "modal active";\n' +
'            updateModelList();\n' +
'        }\n' +
'        \n' +
'        // Update model list\n' +
'        function updateModelList() {\n' +
'            var provider = document.getElementById("modalProvider").value;\n' +
'            var select = document.getElementById("modelSelect");\n' +
'            select.innerHTML = "";\n' +
'            \n' +
'            var models = {\n' +
'                claude: ["claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"],\n' +
'                openai: ["gpt-4", "gpt-4-turbo-preview", "gpt-3.5-turbo"],\n' +
'                gemini: ["gemini-pro", "gemini-1.5-pro-latest", "gemini-1.5-flash-latest"]\n' +
'            };\n' +
'            \n' +
'            models[provider].forEach(function(model) {\n' +
'                var option = document.createElement("option");\n' +
'                option.value = model;\n' +
'                option.textContent = model;\n' +
'                select.appendChild(option);\n' +
'            });\n' +
'        }\n' +
'        \n' +
'        // Save setup\n' +
'        function saveSetup() {\n' +
'            var provider = document.getElementById("modalProvider").value;\n' +
'            var apiKey = document.getElementById("apiKey").value;\n' +
'            var model = document.getElementById("modelSelect").value;\n' +
'            \n' +
'            if (!apiKey) {\n' +
'                alert("Please enter an API key");\n' +
'                return;\n' +
'            }\n' +
'            \n' +
'            fetch("/api/setup", {\n' +
'                method: "POST",\n' +
'                headers: { "Content-Type": "application/json" },\n' +
'                body: JSON.stringify({ provider: provider, apiKey: apiKey, model: model })\n' +
'            })\n' +
'            .then(function(res) { return res.json(); })\n' +
'            .then(function(data) {\n' +
'                if (data.success) {\n' +
'                    currentProvider = provider;\n' +
'                    document.getElementById("providerSelect").value = provider;\n' +
'                    updateStatus("Configured: " + provider);\n' +
'                    closeModal();\n' +
'                    loadProviders();\n' +
'                }\n' +
'            });\n' +
'        }\n' +
'        \n' +
'        // Close modal\n' +
'        function closeModal() {\n' +
'            document.getElementById("setupModal").className = "modal";\n' +
'            document.getElementById("apiKey").value = "";\n' +
'        }\n' +
'        \n' +
'        // Switch provider\n' +
'        function switchProvider() {\n' +
'            currentProvider = document.getElementById("providerSelect").value;\n' +
'            if (currentProvider) {\n' +
'                updateStatus("Using: " + currentProvider);\n' +
'            }\n' +
'        }\n' +
'        \n' +
'        // Load configured providers\n' +
'        function loadProviders() {\n' +
'            fetch("/api/providers")\n' +
'                .then(function(res) { return res.json(); })\n' +
'                .then(function(data) {\n' +
'                    if (data.active) {\n' +
'                        currentProvider = data.active;\n' +
'                        document.getElementById("providerSelect").value = data.active;\n' +
'                        updateStatus("Using: " + data.active);\n' +
'                    }\n' +
'                });\n' +
'        }\n' +
'        \n' +
'        // Update status\n' +
'        function updateStatus(msg) {\n' +
'            document.getElementById("status").textContent = msg;\n' +
'        }\n' +
'        \n' +
'        // Initialize\n' +
'        window.onload = function() {\n' +
'            loadFiles();\n' +
'            loadProviders();\n' +
'            \n' +
'            // Keyboard shortcuts\n' +
'            document.addEventListener("keydown", function(e) {\n' +
'                if ((e.ctrlKey || e.metaKey) && e.key === "s") {\n' +
'                    e.preventDefault();\n' +
'                    saveFile();\n' +
'                }\n' +
'            });\n' +
'            \n' +
'            // Enter key in AI input\n' +
'            document.getElementById("aiPrompt").addEventListener("keydown", function(e) {\n' +
'                if (e.key === "Enter" && !e.shiftKey) {\n' +
'                    e.preventDefault();\n' +
'                    sendToAI();\n' +
'                }\n' +
'            });\n' +
'        };\n' +
'    </script>\n' +
'</body>\n' +
'</html>';
}

/**
 * HTTP Server
 */
function startServer() {
    var server = http.createServer(function(req, res) {
        var parsedUrl = url.parse(req.url, true);
        var pathname = parsedUrl.pathname;

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // Routes
        if (pathname === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(getHTML());

        } else if (pathname === '/api/files') {
            var files = fs.readdirSync(process.cwd())
                .filter(function(f) {
                    return f.indexOf('.') !== 0 && fs.statSync(f).isFile();
                });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ files: files }));

        } else if (pathname === '/api/file') {
            if (req.method === 'GET') {
                var filename = parsedUrl.query.name;
                var filepath = path.join(process.cwd(), filename);
                if (fs.existsSync(filepath)) {
                    var content = fs.readFileSync(filepath, 'utf8');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ content: content }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'File not found' }));
                }
            } else if (req.method === 'POST') {
                var body = '';
                req.on('data', function(chunk) {
                    body += chunk.toString();
                });
                req.on('end', function() {
                    try {
                        var data = JSON.parse(body);
                        var filepath = path.join(process.cwd(), data.name);
                        fs.writeFileSync(filepath, data.content);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
            }

        } else if (pathname === '/api/ai' && req.method === 'POST') {
            var body = '';
            req.on('data', function(chunk) {
                body += chunk.toString();
            });
            req.on('end', function() {
                try {
                    var data = JSON.parse(body);
                    callAI(data.provider, data.prompt, function(err, response) {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: err.message }));
                        } else {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ response: response }));
                        }
                    });
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });

        } else if (pathname === '/api/setup' && req.method === 'POST') {
            var body = '';
            req.on('data', function(chunk) {
                body += chunk.toString();
            });
            req.on('end', function() {
                try {
                    var data = JSON.parse(body);
                    var config = loadConfig();
                    if (!config.providers) config.providers = {};
                    config.providers[data.provider] = {
                        apiKey: data.apiKey,
                        model: data.model
                    };
                    config.active = data.provider;
                    saveConfig(config);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });

        } else if (pathname === '/api/providers') {
            var config = loadConfig();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                providers: config.providers || {},
                active: config.active || null
            }));

        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    });

    server.listen(CONFIG.port, CONFIG.host, function() {
        console.log(COLORS.cyan + '═══════════════════════════════════════════' + COLORS.reset);
        console.log(COLORS.yellow + COLORS.bright + '⚡ ' + CONFIG.name + ' v' + CONFIG.version + COLORS.reset);
        console.log(COLORS.cyan + '═══════════════════════════════════════════' + COLORS.reset);
        console.log(COLORS.green + '✓ Server: http://' + CONFIG.host + ':' + CONFIG.port + COLORS.reset);
        console.log(COLORS.blue + '✓ Node.js: ' + process.version + COLORS.reset);
        console.log(COLORS.magenta + '✓ Zero npm dependencies!' + COLORS.reset);
        console.log(COLORS.cyan + '═══════════════════════════════════════════' + COLORS.reset);
        console.log('\nPress Ctrl+C to stop\n');
    });

    // Graceful shutdown
    process.on('SIGINT', function() {
        console.log('\n' + COLORS.yellow + 'Shutting down...' + COLORS.reset);
        server.close(function() {
            console.log(COLORS.green + '✓ Goodbye!' + COLORS.reset);
            process.exit(0);
        });
    });
}

/**
 * CLI Setup Mode
 */
function setupMode() {
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log(COLORS.cyan + '═══════════════════════════════════════════' + COLORS.reset);
    console.log(COLORS.yellow + COLORS.bright + 'Zero Code Setup' + COLORS.reset);
    console.log(COLORS.cyan + '═══════════════════════════════════════════' + COLORS.reset);

    var config = loadConfig();
    if (!config.providers) config.providers = {};

    var providers = ['claude', 'openai', 'gemini'];
    var index = 0;

    function setupNext() {
        if (index >= providers.length) {
            saveConfig(config);
            console.log(COLORS.green + '\n✓ Setup complete!' + COLORS.reset);
            console.log('\nRun: node ' + path.basename(process.argv[1]));
            rl.close();
            return;
        }

        var provider = providers[index];
        var providerConfig = AI_PROVIDERS[provider];

        console.log('\n' + COLORS.cyan + providerConfig.name + COLORS.reset);

        rl.question('Configure? (y/n): ', function(answer) {
            if (answer.toLowerCase() === 'y') {
                rl.question('API Key: ', function(apiKey) {
                    if (apiKey) {
                        config.providers[provider] = {
                            apiKey: apiKey,
                            model: providerConfig.defaultModel
                        };
                        if (!config.active) config.active = provider;
                        console.log(COLORS.green + '✓ Configured' + COLORS.reset);
                    }
                    index++;
                    setupNext();
                });
            } else {
                index++;
                setupNext();
            }
        });
    }

    setupNext();
}

/**
 * Main entry point
 */
function main() {
    var args = process.argv.slice(2);

    if (args[0] === 'setup') {
        setupMode();
    } else if (args[0] === '--help' || args[0] === '-h') {
        console.log('Zero Code - AI Code Editor\n');
        console.log('Usage:');
        console.log('  node main.js         Start the server');
        console.log('  node main.js setup   Configure AI providers');
        console.log('  node main.js --help  Show this help\n');
        console.log('Environment variables:');
        console.log('  ZERO_PORT=3456      Server port');
        console.log('  ZERO_HOST=127.0.0.1 Server host');
    } else {
        startServer();
    }
}

// Run
main();