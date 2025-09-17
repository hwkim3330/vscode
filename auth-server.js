#!/usr/bin/env node

/**
 * KETI Code - OAuth2 Authentication Server
 * Supports Claude (Anthropic) and OpenAI account login
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const { URL } = require('url');

// OAuth2 Configuration
const OAUTH_CONFIG = {
    anthropic: {
        authorizationURL: 'https://console.anthropic.com/oauth/authorize',
        tokenURL: 'https://api.anthropic.com/oauth/token',
        userInfoURL: 'https://api.anthropic.com/v1/users/me',
        clientId: process.env.ANTHROPIC_CLIENT_ID || 'keti-code-client',
        clientSecret: process.env.ANTHROPIC_CLIENT_SECRET || '',
        redirectURI: 'http://localhost:3333/auth/callback/anthropic',
        scopes: ['read', 'write', 'model:claude-3']
    },
    openai: {
        authorizationURL: 'https://auth0.openai.com/authorize',
        tokenURL: 'https://auth0.openai.com/oauth/token',
        userInfoURL: 'https://api.openai.com/v1/me',
        clientId: process.env.OPENAI_CLIENT_ID || 'keti-code-client',
        clientSecret: process.env.OPENAI_CLIENT_SECRET || '',
        redirectURI: 'http://localhost:3333/auth/callback/openai',
        scopes: ['openai.api', 'openai.organization.read']
    },
    github: {
        authorizationURL: 'https://github.com/login/oauth/authorize',
        tokenURL: 'https://github.com/login/oauth/access_token',
        userInfoURL: 'https://api.github.com/user',
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
        redirectURI: 'http://localhost:3333/auth/callback/github',
        scopes: ['user', 'repo']
    }
};

// Session storage (in production, use Redis or database)
const sessions = new Map();
const authCodes = new Map();

class OAuthServer {
    constructor() {
        this.state = new Map(); // CSRF protection
    }

    // Generate authorization URL
    getAuthorizationURL(provider) {
        const config = OAUTH_CONFIG[provider];
        if (!config) throw new Error('Unknown provider');

        const state = crypto.randomBytes(16).toString('hex');
        this.state.set(state, { provider, timestamp: Date.now() });

        const params = {
            client_id: config.clientId,
            redirect_uri: config.redirectURI,
            response_type: 'code',
            scope: config.scopes.join(' '),
            state: state
        };

        return `${config.authorizationURL}?${querystring.stringify(params)}`;
    }

    // Exchange authorization code for access token
    async exchangeCodeForToken(provider, code) {
        const config = OAUTH_CONFIG[provider];

        const params = {
            grant_type: 'authorization_code',
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code: code,
            redirect_uri: config.redirectURI
        };

        return await this.makeTokenRequest(config.tokenURL, params);
    }

    // Refresh access token
    async refreshToken(provider, refreshToken) {
        const config = OAUTH_CONFIG[provider];

        const params = {
            grant_type: 'refresh_token',
            client_id: config.clientId,
            client_secret: config.clientSecret,
            refresh_token: refreshToken
        };

        return await this.makeTokenRequest(config.tokenURL, params);
    }

    // Make token request
    async makeTokenRequest(tokenURL, params) {
        return new Promise((resolve, reject) => {
            const url = new URL(tokenURL);
            const postData = querystring.stringify(params);

            const options = {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const tokens = JSON.parse(data);
                        resolve(tokens);
                    } catch (err) {
                        reject(new Error('Failed to parse token response'));
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        });
    }

    // Get user info
    async getUserInfo(provider, accessToken) {
        const config = OAUTH_CONFIG[provider];

        return new Promise((resolve, reject) => {
            const url = new URL(config.userInfoURL);

            const options = {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const userInfo = JSON.parse(data);
                        resolve(userInfo);
                    } catch (err) {
                        reject(new Error('Failed to parse user info'));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    // Validate state parameter
    validateState(state) {
        const stateData = this.state.get(state);
        if (!stateData) return null;

        // Check if state is not too old (5 minutes)
        if (Date.now() - stateData.timestamp > 300000) {
            this.state.delete(state);
            return null;
        }

        this.state.delete(state);
        return stateData.provider;
    }
}

// Session Manager
class SessionManager {
    createSession(userId, provider, tokens) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        const session = {
            id: sessionId,
            userId: userId,
            provider: provider,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + (tokens.expires_in * 1000),
            createdAt: Date.now()
        };

        sessions.set(sessionId, session);
        return sessionId;
    }

    getSession(sessionId) {
        return sessions.get(sessionId);
    }

    async refreshSession(sessionId, oauthServer) {
        const session = this.getSession(sessionId);
        if (!session) return null;

        // Check if token needs refresh
        if (Date.now() < session.expiresAt - 60000) {
            return session; // Still valid
        }

        // Refresh the token
        try {
            const tokens = await oauthServer.refreshToken(
                session.provider,
                session.refreshToken
            );

            session.accessToken = tokens.access_token;
            session.expiresAt = Date.now() + (tokens.expires_in * 1000);

            return session;
        } catch (err) {
            sessions.delete(sessionId);
            return null;
        }
    }

    deleteSession(sessionId) {
        sessions.delete(sessionId);
    }
}

// Device Flow for CLI authentication (like Claude Code does)
class DeviceFlow {
    constructor() {
        this.pendingAuthorizations = new Map();
    }

    async initiateDeviceFlow(provider) {
        const userCode = this.generateUserCode();
        const deviceCode = crypto.randomBytes(32).toString('hex');

        const verificationURI = `http://localhost:3333/device`;

        this.pendingAuthorizations.set(userCode, {
            deviceCode: deviceCode,
            provider: provider,
            userCode: userCode,
            verificationURI: verificationURI,
            expiresAt: Date.now() + 600000, // 10 minutes
            interval: 5,
            status: 'pending'
        });

        return {
            device_code: deviceCode,
            user_code: userCode,
            verification_uri: verificationURI,
            verification_uri_complete: `${verificationURI}?user_code=${userCode}`,
            expires_in: 600,
            interval: 5
        };
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

    verifyUserCode(userCode) {
        const auth = this.pendingAuthorizations.get(userCode);
        if (!auth) return null;

        if (Date.now() > auth.expiresAt) {
            this.pendingAuthorizations.delete(userCode);
            return null;
        }

        return auth;
    }

    completeAuthorization(userCode, userId, tokens) {
        const auth = this.pendingAuthorizations.get(userCode);
        if (!auth) return false;

        auth.status = 'completed';
        auth.userId = userId;
        auth.tokens = tokens;

        return true;
    }

    checkDeviceCode(deviceCode) {
        for (const [userCode, auth] of this.pendingAuthorizations) {
            if (auth.deviceCode === deviceCode) {
                if (auth.status === 'completed') {
                    this.pendingAuthorizations.delete(userCode);
                    return {
                        success: true,
                        userId: auth.userId,
                        tokens: auth.tokens
                    };
                } else if (Date.now() > auth.expiresAt) {
                    this.pendingAuthorizations.delete(userCode);
                    return { error: 'expired' };
                } else {
                    return { error: 'pending' };
                }
            }
        }
        return { error: 'not_found' };
    }
}

// Initialize components
const oauthServer = new OAuthServer();
const sessionManager = new SessionManager();
const deviceFlow = new DeviceFlow();

// HTTP Server
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // OAuth2 endpoints
    if (url.pathname === '/auth/login') {
        // Initiate OAuth2 flow
        const provider = url.searchParams.get('provider') || 'anthropic';

        try {
            const authURL = oauthServer.getAuthorizationURL(provider);
            res.writeHead(302, { 'Location': authURL });
            res.end();
        } catch (err) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: err.message }));
        }

    } else if (url.pathname.startsWith('/auth/callback/')) {
        // OAuth2 callback
        const provider = url.pathname.split('/').pop();
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');

        // Validate state
        const validProvider = oauthServer.validateState(state);
        if (!validProvider || validProvider !== provider) {
            res.writeHead(400);
            res.end('Invalid state parameter');
            return;
        }

        try {
            // Exchange code for tokens
            const tokens = await oauthServer.exchangeCodeForToken(provider, code);

            // Get user info
            const userInfo = await oauthServer.getUserInfo(provider, tokens.access_token);

            // Create session
            const sessionId = sessionManager.createSession(
                userInfo.id || userInfo.email,
                provider,
                tokens
            );

            // Set cookie and redirect
            res.setHeader('Set-Cookie', `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
            res.writeHead(302, { 'Location': '/' });
            res.end();

        } catch (err) {
            res.writeHead(500);
            res.end('Authentication failed: ' + err.message);
        }

    } else if (url.pathname === '/auth/device') {
        // Device flow initiation
        if (req.method === 'POST') {
            const provider = url.searchParams.get('provider') || 'anthropic';
            const deviceAuth = await deviceFlow.initiateDeviceFlow(provider);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(deviceAuth));

        } else {
            // Device verification page
            const userCode = url.searchParams.get('user_code');

            res.setHeader('Content-Type', 'text/html');
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>KETI Code - Device Authorization</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        }
                        .container {
                            background: white;
                            padding: 40px;
                            border-radius: 10px;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                            text-align: center;
                            max-width: 400px;
                        }
                        h1 { color: #333; margin-bottom: 20px; }
                        .code-display {
                            font-size: 32px;
                            font-weight: bold;
                            letter-spacing: 3px;
                            color: #667eea;
                            margin: 30px 0;
                            padding: 15px;
                            background: #f5f5f5;
                            border-radius: 5px;
                        }
                        input {
                            width: 100%;
                            padding: 12px;
                            font-size: 20px;
                            text-align: center;
                            letter-spacing: 2px;
                            border: 2px solid #ddd;
                            border-radius: 5px;
                            margin: 20px 0;
                            text-transform: uppercase;
                        }
                        button {
                            background: #667eea;
                            color: white;
                            border: none;
                            padding: 12px 40px;
                            font-size: 16px;
                            border-radius: 5px;
                            cursor: pointer;
                            transition: all 0.3s;
                        }
                        button:hover {
                            background: #5a67d8;
                            transform: translateY(-2px);
                        }
                        .provider-buttons {
                            display: flex;
                            gap: 10px;
                            margin-top: 20px;
                        }
                        .provider-btn {
                            flex: 1;
                            padding: 10px;
                            border: 2px solid #ddd;
                            background: white;
                            color: #333;
                            border-radius: 5px;
                            cursor: pointer;
                        }
                        .provider-btn:hover {
                            border-color: #667eea;
                            background: #f8f9ff;
                        }
                        .provider-btn.anthropic { border-color: #FF6B00; }
                        .provider-btn.openai { border-color: #10a37f; }
                        .provider-btn.github { border-color: #333; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🚀 KETI Code</h1>
                        <p>Enter the code shown in your terminal:</p>

                        ${userCode ? `
                            <div class="code-display">${userCode}</div>
                            <p>Confirm this code to authorize KETI Code</p>
                        ` : `
                            <input type="text" id="userCode" placeholder="XXXX-XXXX" maxlength="9" />
                        `}

                        <div class="provider-buttons">
                            <button class="provider-btn anthropic" onclick="authorize('anthropic')">
                                Claude (Anthropic)
                            </button>
                            <button class="provider-btn openai" onclick="authorize('openai')">
                                OpenAI
                            </button>
                            <button class="provider-btn github" onclick="authorize('github')">
                                GitHub
                            </button>
                        </div>

                        <script>
                            function authorize(provider) {
                                const code = '${userCode}' || document.getElementById('userCode').value;
                                if (!code) {
                                    alert('Please enter a code');
                                    return;
                                }

                                // Redirect to OAuth login with device code
                                window.location.href = '/auth/device/verify?user_code=' + code + '&provider=' + provider;
                            }
                        </script>
                    </div>
                </body>
                </html>
            `);
        }

    } else if (url.pathname === '/auth/device/verify') {
        // Verify device code and initiate OAuth
        const userCode = url.searchParams.get('user_code');
        const provider = url.searchParams.get('provider');

        const auth = deviceFlow.verifyUserCode(userCode);
        if (!auth) {
            res.writeHead(400);
            res.end('Invalid or expired code');
            return;
        }

        // Store device auth in session for callback
        const tempSession = crypto.randomBytes(16).toString('hex');
        sessions.set(tempSession, { deviceAuth: auth, userCode: userCode });

        // Redirect to OAuth flow
        const authURL = oauthServer.getAuthorizationURL(provider);
        res.setHeader('Set-Cookie', `temp_session=${tempSession}; Path=/; HttpOnly`);
        res.writeHead(302, { 'Location': authURL });
        res.end();

    } else if (url.pathname === '/auth/device/token') {
        // Check device code status (for CLI polling)
        const deviceCode = url.searchParams.get('device_code');
        const result = deviceFlow.checkDeviceCode(deviceCode);

        res.setHeader('Content-Type', 'application/json');

        if (result.success) {
            res.end(JSON.stringify({
                access_token: result.tokens.access_token,
                refresh_token: result.tokens.refresh_token,
                expires_in: result.tokens.expires_in,
                token_type: 'Bearer'
            }));
        } else if (result.error === 'pending') {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'authorization_pending' }));
        } else {
            res.writeHead(400);
            res.end(JSON.stringify({ error: result.error }));
        }

    } else if (url.pathname === '/auth/logout') {
        // Logout
        const cookies = parseCookies(req.headers.cookie);
        if (cookies.session) {
            sessionManager.deleteSession(cookies.session);
        }

        res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
        res.writeHead(302, { 'Location': '/' });
        res.end();

    } else if (url.pathname === '/api/user') {
        // Get current user info
        const cookies = parseCookies(req.headers.cookie);
        const session = cookies.session ? sessionManager.getSession(cookies.session) : null;

        res.setHeader('Content-Type', 'application/json');

        if (session) {
            res.end(JSON.stringify({
                authenticated: true,
                userId: session.userId,
                provider: session.provider
            }));
        } else {
            res.end(JSON.stringify({
                authenticated: false
            }));
        }

    } else {
        // Serve main page
        res.setHeader('Content-Type', 'text/html');
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>KETI Code - Authentication</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 10px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        text-align: center;
                    }
                    h1 { color: #333; }
                    .login-buttons {
                        margin-top: 30px;
                    }
                    .login-btn {
                        display: block;
                        width: 300px;
                        padding: 15px;
                        margin: 10px auto;
                        border: none;
                        border-radius: 5px;
                        font-size: 16px;
                        cursor: pointer;
                        transition: all 0.3s;
                        text-decoration: none;
                        color: white;
                    }
                    .login-btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                    }
                    .anthropic {
                        background: linear-gradient(135deg, #FF6B00 0%, #FF8E00 100%);
                    }
                    .openai {
                        background: linear-gradient(135deg, #10a37f 0%, #12b886 100%);
                    }
                    .github {
                        background: linear-gradient(135deg, #333 0%, #555 100%);
                    }
                    #userInfo {
                        margin-top: 20px;
                        padding: 20px;
                        background: #f5f5f5;
                        border-radius: 5px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🚀 KETI Code</h1>
                    <p>AI-Powered Code Editor</p>

                    <div id="userInfo"></div>

                    <div class="login-buttons">
                        <a href="/auth/login?provider=anthropic" class="login-btn anthropic">
                            Login with Claude (Anthropic)
                        </a>
                        <a href="/auth/login?provider=openai" class="login-btn openai">
                            Login with OpenAI
                        </a>
                        <a href="/auth/login?provider=github" class="login-btn github">
                            Login with GitHub
                        </a>
                    </div>

                    <div style="margin-top: 30px;">
                        <p style="color: #666;">Or use device authorization:</p>
                        <code style="background: #f5f5f5; padding: 10px; border-radius: 5px;">
                            curl -X POST http://localhost:3333/auth/device?provider=anthropic
                        </code>
                    </div>

                    <script>
                        // Check authentication status
                        fetch('/api/user')
                            .then(r => r.json())
                            .then(data => {
                                if (data.authenticated) {
                                    document.getElementById('userInfo').innerHTML =
                                        '<h3>Logged in as: ' + data.userId + '</h3>' +
                                        '<p>Provider: ' + data.provider + '</p>' +
                                        '<a href="/auth/logout">Logout</a>';
                                    document.querySelector('.login-buttons').style.display = 'none';
                                }
                            });
                    </script>
                </div>
            </body>
            </html>
        `);
    }
});

// Helper function to parse cookies
function parseCookies(cookieHeader) {
    const cookies = {};
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            const [key, value] = cookie.trim().split('=');
            cookies[key] = value;
        });
    }
    return cookies;
}

// Start server
const PORT = process.env.AUTH_PORT || 3333;
server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║      KETI Code - OAuth2 Authentication Server     ║
║                                                    ║
║  Supported Providers:                             ║
║  • Claude (Anthropic)                             ║
║  • OpenAI                                         ║
║  • GitHub                                         ║
║                                                    ║
║  Web Login: http://localhost:${PORT}              ║
║                                                    ║
║  CLI Device Flow:                                 ║
║  curl -X POST http://localhost:${PORT}/auth/device ║
╚══════════════════════════════════════════════════╝
`);
});