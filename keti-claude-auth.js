#!/usr/bin/env node

/**
 * KETI Claude Authentication
 * Real Anthropic Claude authentication implementation
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');

const CONFIG_DIR = path.join(os.homedir(), '.keti');
const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');
const SESSION_FILE = path.join(CONFIG_DIR, 'session.json');
const AUTH_PORT = 1455;

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

/**
 * Authentication Providers with real endpoints
 */
const PROVIDERS = {
    anthropic: {
        name: 'Claude (Anthropic)',
        apiUrl: 'https://api.anthropic.com',
        consoleUrl: 'https://console.anthropic.com',
        authUrl: 'https://console.anthropic.com/login',
        color: '\x1b[33m',
        models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
        requiresApiKey: true
    },
    openai: {
        name: 'OpenAI (ChatGPT)',
        apiUrl: 'https://api.openai.com',
        authUrl: 'https://auth0.openai.com/u/login',
        platformUrl: 'https://platform.openai.com',
        color: '\x1b[32m',
        models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        deviceFlow: {
            authEndpoint: 'https://auth0.openai.com/oauth/device/code',
            tokenEndpoint: 'https://auth0.openai.com/oauth/token',
            clientId: 'DRivsnm2Mu42T3KOpqdtwB3NYviHYzwD', // Public client ID
            audience: 'https://api.openai.com/v1',
            scope: 'openid profile email offline_access model.read model.request'
        }
    },
    github: {
        name: 'GitHub Copilot',
        apiUrl: 'https://api.github.com',
        authUrl: 'https://github.com/login',
        color: '\x1b[36m',
        deviceFlow: {
            authEndpoint: 'https://github.com/login/device/code',
            tokenEndpoint: 'https://github.com/login/oauth/access_token',
            clientId: '01ab8ac9400c4e429b23',
            scope: 'user:email read:user'
        }
    }
};

class ClaudeAuthenticator {
    constructor() {
        this.currentAuth = this.loadAuth();
        this.session = this.loadSession();
    }

    loadAuth() {
        try {
            if (fs.existsSync(AUTH_FILE)) {
                return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
            }
        } catch (e) {}
        return null;
    }

    loadSession() {
        try {
            if (fs.existsSync(SESSION_FILE)) {
                return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
            }
        } catch (e) {}
        return null;
    }

    saveAuth(auth) {
        fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2));
        fs.chmodSync(AUTH_FILE, 0o600);
        this.currentAuth = auth;
    }

    saveSession(session) {
        fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
        fs.chmodSync(SESSION_FILE, 0o600);
        this.session = session;
    }

    /**
     * Start web-based authentication flow
     */
    async startWebAuth() {
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                const url = new URL(req.url, `http://localhost:${AUTH_PORT}`);

                if (url.pathname === '/') {
                    this.serveAuthPage(res);
                } else if (url.pathname === '/save-key') {
                    this.handleApiKey(req, res, server, resolve, reject);
                } else if (url.pathname === '/login') {
                    this.handleLogin(req, res, server, resolve, reject);
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            });

            server.listen(AUTH_PORT, () => {
                const authUrl = `http://localhost:${AUTH_PORT}`;
                console.log(`\n🌐 Authentication server running at: ${authUrl}\n`);
                this.openBrowser(authUrl);
            });

            // Timeout after 5 minutes
            setTimeout(() => {
                server.close();
                reject(new Error('Authentication timeout'));
            }, 300000);
        });
    }

    serveAuthPage(res) {
        const html = `<!DOCTYPE html>
<html>
<head>
    <title>KETI Code - Authentication</title>
    <meta charset="utf-8">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica", sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 600px;
            width: 100%;
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea, #764ba2);
            padding: 30px;
            text-align: center;
            color: white;
        }
        .logo {
            font-size: 48px;
            margin-bottom: 10px;
        }
        h1 {
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 10px;
        }
        .subtitle {
            opacity: 0.9;
            font-size: 16px;
        }
        .content {
            padding: 40px;
        }
        .provider-card {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            transition: all 0.3s;
        }
        .provider-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
        }
        .provider-header {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }
        .provider-icon {
            font-size: 32px;
            margin-right: 15px;
        }
        .provider-name {
            font-size: 20px;
            font-weight: 600;
            color: #333;
        }
        .api-key-input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e1e4e8;
            border-radius: 8px;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 14px;
            margin-bottom: 10px;
            transition: border-color 0.3s;
        }
        .api-key-input:focus {
            outline: none;
            border-color: #667eea;
        }
        .help-text {
            font-size: 13px;
            color: #666;
            margin-bottom: 10px;
        }
        .help-text a {
            color: #667eea;
            text-decoration: none;
        }
        .help-text a:hover {
            text-decoration: underline;
        }
        .btn {
            width: 100%;
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            color: white;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea, #764ba2);
        }
        .btn-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        .btn-claude {
            background: linear-gradient(135deg, #D4A574, #C49464);
        }
        .btn-openai {
            background: linear-gradient(135deg, #10a37f, #0e8e6f);
        }
        .btn-github {
            background: linear-gradient(135deg, #24292e, #1a1e22);
        }
        .divider {
            text-align: center;
            margin: 30px 0;
            position: relative;
            color: #999;
        }
        .divider:before {
            content: '';
            position: absolute;
            top: 50%;
            left: 0;
            right: 0;
            height: 1px;
            background: #e1e4e8;
        }
        .divider span {
            background: white;
            padding: 0 20px;
            position: relative;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .status {
            margin-top: 20px;
            padding: 15px;
            border-radius: 8px;
            font-size: 14px;
            text-align: center;
            display: none;
        }
        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
            display: block;
        }
        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
            display: block;
        }
        .status.info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
            display: block;
        }
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 1s linear infinite;
            vertical-align: middle;
            margin-left: 10px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .oauth-buttons {
            margin-top: 20px;
        }
        .oauth-btn {
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🚀</div>
            <h1>KETI Code</h1>
            <p class="subtitle">AI-Powered Code Editor Authentication</p>
        </div>

        <div class="content">
            <!-- Claude/Anthropic -->
            <div class="provider-card">
                <div class="provider-header">
                    <span class="provider-icon">🧠</span>
                    <span class="provider-name">Claude (Anthropic)</span>
                </div>
                <input
                    type="password"
                    class="api-key-input"
                    id="anthropic-key"
                    placeholder="sk-ant-api03-..."
                    autocomplete="off"
                >
                <p class="help-text">
                    Get your API key from
                    <a href="https://console.anthropic.com/settings/keys" target="_blank">console.anthropic.com</a>
                </p>
                <button class="btn btn-claude" onclick="saveKey('anthropic')">
                    Use Claude API Key
                </button>
                <div class="oauth-buttons">
                    <button class="btn btn-claude oauth-btn" onclick="loginWithProvider('anthropic')">
                        Sign in with Anthropic Account
                    </button>
                </div>
            </div>

            <!-- OpenAI -->
            <div class="provider-card">
                <div class="provider-header">
                    <span class="provider-icon">🤖</span>
                    <span class="provider-name">OpenAI (ChatGPT)</span>
                </div>
                <input
                    type="password"
                    class="api-key-input"
                    id="openai-key"
                    placeholder="sk-..."
                    autocomplete="off"
                >
                <p class="help-text">
                    Get your API key from
                    <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>
                </p>
                <button class="btn btn-openai" onclick="saveKey('openai')">
                    Use OpenAI API Key
                </button>
                <div class="oauth-buttons">
                    <button class="btn btn-openai oauth-btn" onclick="loginWithProvider('openai')">
                        Sign in with ChatGPT Account
                    </button>
                </div>
            </div>

            <!-- GitHub Copilot -->
            <div class="provider-card">
                <div class="provider-header">
                    <span class="provider-icon">🐙</span>
                    <span class="provider-name">GitHub Copilot</span>
                </div>
                <p class="help-text">
                    Requires GitHub account with Copilot subscription
                </p>
                <button class="btn btn-github" onclick="loginWithProvider('github')">
                    Sign in with GitHub
                </button>
            </div>

            <div id="status" class="status"></div>
        </div>
    </div>

    <script>
        async function saveKey(provider) {
            const input = document.getElementById(provider + '-key');
            const key = input.value.trim();

            if (!key) {
                showStatus('Please enter an API key', 'error');
                return;
            }

            // Validate key format
            if (provider === 'anthropic' && !key.startsWith('sk-ant-')) {
                showStatus('Invalid Claude API key format (should start with sk-ant-)', 'error');
                return;
            }
            if (provider === 'openai' && !key.startsWith('sk-')) {
                showStatus('Invalid OpenAI API key format (should start with sk-)', 'error');
                return;
            }

            showStatus('Validating API key...', 'info');

            try {
                const response = await fetch('/save-key', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider, key })
                });

                const result = await response.json();
                if (result.success) {
                    showStatus('✅ API key saved successfully! Closing in 2 seconds...', 'success');
                    setTimeout(() => window.close(), 2000);
                } else {
                    showStatus('❌ ' + (result.error || 'Failed to save API key'), 'error');
                }
            } catch (error) {
                showStatus('❌ Network error: ' + error.message, 'error');
            }
        }

        async function loginWithProvider(provider) {
            showStatus('Starting authentication with ' + provider + '...', 'info');

            try {
                const response = await fetch('/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider })
                });

                const result = await response.json();
                if (result.authUrl) {
                    showStatus('Redirecting to ' + provider + ' login...', 'info');

                    if (provider === 'anthropic') {
                        // For Claude, show instructions
                        showStatus(
                            'Claude OAuth is not publicly available yet. ' +
                            'Please use an API key instead. ' +
                            'Visit console.anthropic.com to get your key.',
                            'info'
                        );
                    } else {
                        // Open OAuth URL
                        window.open(result.authUrl, '_blank');
                        showStatus(
                            'Please complete authentication in the new window. ' +
                            'Enter the device code if prompted: ' + (result.userCode || 'N/A'),
                            'info'
                        );
                    }
                } else {
                    showStatus('Authentication started. Check your terminal for instructions.', 'info');
                }
            } catch (error) {
                showStatus('❌ Failed to start authentication: ' + error.message, 'error');
            }
        }

        function showStatus(message, type) {
            const status = document.getElementById('status');
            status.className = 'status ' + type;
            status.innerHTML = message;
        }

        // Check if already authenticated
        window.addEventListener('load', async () => {
            try {
                const response = await fetch('/status');
                const status = await response.json();
                if (status.authenticated) {
                    showStatus('✅ Already authenticated with ' + status.provider, 'success');
                }
            } catch (e) {}
        });
    </script>
</body>
</html>`;

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    }

    handleApiKey(req, res, server, resolve, reject) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { provider, key } = JSON.parse(body);

                // Test the API key
                const isValid = await this.testApiKey(provider, key);

                if (isValid) {
                    const authData = {
                        provider,
                        api_key: key,
                        token_type: 'Bearer',
                        created_at: new Date().toISOString(),
                        is_api_key: true
                    };

                    this.saveAuth(authData);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));

                    setTimeout(() => {
                        server.close();
                        resolve(authData);
                    }, 100);
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid API key' }));
                }
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
    }

    handleLogin(req, res, server, resolve, reject) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { provider } = JSON.parse(body);

                if (provider === 'anthropic') {
                    // Claude doesn't have public OAuth yet
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        message: 'Please use API key for Claude',
                        requiresApiKey: true
                    }));
                } else {
                    // Start device flow for other providers
                    const deviceAuth = await this.startDeviceFlow(provider);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(deviceAuth));
                }
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    }

    async testApiKey(provider, key) {
        return new Promise((resolve) => {
            const config = PROVIDERS[provider];
            if (!config) {
                resolve(false);
                return;
            }

            let options;
            if (provider === 'anthropic') {
                // Test Claude API
                options = {
                    hostname: 'api.anthropic.com',
                    path: '/v1/messages',
                    method: 'POST',
                    headers: {
                        'x-api-key': key,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json'
                    }
                };
            } else if (provider === 'openai') {
                // Test OpenAI API
                options = {
                    hostname: 'api.openai.com',
                    path: '/v1/models',
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${key}`
                    }
                };
            }

            const req = https.request(options, (res) => {
                // API key is valid if we get 200 or 400 (400 means auth worked but request was bad)
                resolve(res.statusCode === 200 || res.statusCode === 400);
            });

            req.on('error', () => resolve(false));

            if (provider === 'anthropic') {
                // Send minimal request to test auth
                req.write(JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 1
                }));
            }

            req.end();
        });
    }

    async startDeviceFlow(provider) {
        const config = PROVIDERS[provider]?.deviceFlow;
        if (!config) {
            throw new Error(`Device flow not supported for ${provider}`);
        }

        // Implementation would go here for real OAuth
        // For now, return mock data
        return {
            authUrl: PROVIDERS[provider].authUrl,
            userCode: 'XXXX-XXXX',
            message: 'Complete authentication in your browser'
        };
    }

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

    async makeClaudeRequest(apiKey, prompt) {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                model: 'claude-3-haiku-20240307',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1024
            });

            const options = {
                hostname: 'api.anthropic.com',
                path: '/v1/messages',
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (res.statusCode === 200) {
                            resolve(response);
                        } else {
                            reject(new Error(response.error?.message || data));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        });
    }

    status() {
        if (this.currentAuth) {
            const provider = PROVIDERS[this.currentAuth.provider];
            console.log('\n✅ Authenticated');
            console.log(`Provider: ${provider?.name || this.currentAuth.provider}`);
            if (this.currentAuth.is_api_key) {
                console.log('Type: API Key');
            }
            console.log(`Created: ${this.currentAuth.created_at}`);
        } else {
            console.log('\n❌ Not authenticated');
            console.log('Run "keti-claude auth" to authenticate');
        }
    }

    async testConnection() {
        if (!this.currentAuth) {
            console.log('❌ Not authenticated');
            return;
        }

        console.log('\nTesting API connection...');

        try {
            if (this.currentAuth.provider === 'anthropic') {
                const response = await this.makeClaudeRequest(
                    this.currentAuth.api_key,
                    'Say "Hello from KETI Code!" in exactly 5 words.'
                );
                console.log('✅ Claude API working!');
                console.log('Response:', response.content[0]?.text);
            } else if (this.currentAuth.provider === 'openai') {
                console.log('✅ OpenAI API ready');
            }
        } catch (error) {
            console.error('❌ API test failed:', error.message);
        }
    }
}

async function main() {
    const auth = new ClaudeAuthenticator();
    const command = process.argv[2];

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║     KETI Code - Claude Authentication  ║');
    console.log('╚════════════════════════════════════════╝');

    switch (command) {
        case 'auth':
        case 'login':
            try {
                await auth.startWebAuth();
                console.log('\n✅ Authentication successful!');
            } catch (error) {
                console.error('\n❌ Authentication failed:', error.message);
                process.exit(1);
            }
            break;

        case 'logout':
            if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
            if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
            console.log('\n✅ Logged out successfully');
            break;

        case 'status':
            auth.status();
            break;

        case 'test':
            await auth.testConnection();
            break;

        default:
            console.log('\nUsage: keti-claude <command>');
            console.log('\nCommands:');
            console.log('  auth    - Authenticate with Claude/OpenAI/GitHub');
            console.log('  logout  - Sign out');
            console.log('  status  - Check authentication status');
            console.log('  test    - Test API connection');
            console.log('\nAuth files:');
            console.log('  ' + AUTH_FILE);
            console.log('  ' + SESSION_FILE);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { ClaudeAuthenticator, PROVIDERS };