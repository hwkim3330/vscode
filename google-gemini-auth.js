#!/usr/bin/env node

/**
 * Google Gemini Authentication
 * Google OAuth2 + Gemini API implementation
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');
const url = require('url');

const CONFIG_DIR = path.join(os.homedir(), '.keti');
const AUTH_FILE = path.join(CONFIG_DIR, 'google-auth.json');
const SESSION_FILE = path.join(CONFIG_DIR, 'google-session.json');
const AUTH_PORT = 1456;
const REDIRECT_URI = `http://localhost:${AUTH_PORT}/callback`;

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

/**
 * Google OAuth2 Configuration
 * Using Google's OAuth 2.0 for server-side web apps
 */
const GOOGLE_CONFIG = {
    authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    geminiApiEndpoint: 'https://generativelanguage.googleapis.com',
    scopes: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/generative-language.retrieval',
        'https://www.googleapis.com/auth/generative-language.tuning'
    ],
    // These would need to be replaced with your actual OAuth2 credentials
    // Get them from https://console.cloud.google.com/apis/credentials
    clientId: process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID.apps.googleusercontent.com',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET',
    geminiApiKey: process.env.GEMINI_API_KEY || '' // Optional: Can use API key instead of OAuth
};

/**
 * Color codes for terminal output
 */
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

/**
 * Generate PKCE challenge for OAuth2
 */
function generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
        .createHash('sha256')
        .update(verifier)
        .digest('base64url');
    return { verifier, challenge };
}

/**
 * Generate random state for OAuth2
 */
function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Save authentication data
 */
function saveAuth(data) {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
    console.log(`${COLORS.green}✓ Authentication saved${COLORS.reset}`);
}

/**
 * Load authentication data
 */
function loadAuth() {
    if (fs.existsSync(AUTH_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
        } catch (error) {
            console.error(`${COLORS.red}✗ Failed to load authentication${COLORS.reset}`);
        }
    }
    return null;
}

/**
 * Save session data
 */
function saveSession(data) {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
}

/**
 * Load session data
 */
function loadSession() {
    if (fs.existsSync(SESSION_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        } catch (error) {
            console.error(`${COLORS.red}✗ Failed to load session${COLORS.reset}`);
        }
    }
    return null;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code, codeVerifier) {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({
            client_id: GOOGLE_CONFIG.clientId,
            client_secret: GOOGLE_CONFIG.clientSecret,
            code: code,
            code_verifier: codeVerifier,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI
        });

        const options = {
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': params.toString().length
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const tokens = JSON.parse(data);
                    if (tokens.error) {
                        reject(new Error(tokens.error_description || tokens.error));
                    } else {
                        resolve(tokens);
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.write(params.toString());
        req.end();
    });
}

/**
 * Refresh access token
 */
async function refreshAccessToken(refreshToken) {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({
            client_id: GOOGLE_CONFIG.clientId,
            client_secret: GOOGLE_CONFIG.clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        });

        const options = {
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': params.toString().length
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const tokens = JSON.parse(data);
                    if (tokens.error) {
                        reject(new Error(tokens.error_description || tokens.error));
                    } else {
                        resolve(tokens);
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.write(params.toString());
        req.end();
    });
}

/**
 * Test Gemini API connection
 */
async function testGeminiAPI(apiKey) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models?key=${apiKey}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
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
                        reject(new Error(response.error?.message || 'API test failed'));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

/**
 * OAuth2 authentication flow
 */
async function authenticate() {
    console.log(`${COLORS.bright}${COLORS.blue}🔐 Google Gemini Authentication${COLORS.reset}\n`);

    // Check for API key first
    if (GOOGLE_CONFIG.geminiApiKey && GOOGLE_CONFIG.geminiApiKey !== 'YOUR_API_KEY') {
        console.log(`${COLORS.cyan}Using Gemini API Key authentication${COLORS.reset}`);

        try {
            const models = await testGeminiAPI(GOOGLE_CONFIG.geminiApiKey);
            console.log(`${COLORS.green}✓ API Key validated${COLORS.reset}`);
            console.log(`${COLORS.cyan}Available models:${COLORS.reset}`);
            models.models?.forEach(model => {
                console.log(`  - ${model.name}`);
            });

            saveAuth({
                type: 'api_key',
                apiKey: GOOGLE_CONFIG.geminiApiKey,
                timestamp: new Date().toISOString()
            });

            return;
        } catch (error) {
            console.error(`${COLORS.red}✗ API Key validation failed: ${error.message}${COLORS.reset}`);
            console.log(`${COLORS.yellow}Falling back to OAuth2 authentication${COLORS.reset}\n`);
        }
    }

    // OAuth2 flow
    const pkce = generatePKCE();
    const state = generateState();

    // Build authorization URL
    const authParams = new URLSearchParams({
        client_id: GOOGLE_CONFIG.clientId,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: GOOGLE_CONFIG.scopes.join(' '),
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        state: state,
        access_type: 'offline',
        prompt: 'consent'
    });

    const authUrl = `${GOOGLE_CONFIG.authEndpoint}?${authParams}`;

    console.log(`${COLORS.yellow}Opening browser for authentication...${COLORS.reset}`);
    console.log(`${COLORS.cyan}If browser doesn't open, visit:${COLORS.reset}`);
    console.log(authUrl);
    console.log();

    // Try to open browser
    const platform = process.platform;
    const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
    spawn(cmd, [authUrl], { detached: true, stdio: 'ignore' }).unref();

    // Start local server to receive callback
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            const parsedUrl = url.parse(req.url, true);

            if (parsedUrl.pathname === '/callback') {
                const code = parsedUrl.query.code;
                const returnedState = parsedUrl.query.state;

                if (returnedState !== state) {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end('<h1>Authentication Failed</h1><p>Invalid state parameter</p>');
                    server.close();
                    reject(new Error('Invalid state parameter'));
                    return;
                }

                if (code) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                        <html>
                        <head>
                            <style>
                                body { font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                                .success { text-align: center; }
                                h1 { color: #34A853; }
                            </style>
                        </head>
                        <body>
                            <div class="success">
                                <h1>✓ Authentication Successful</h1>
                                <p>You can close this window and return to the terminal.</p>
                            </div>
                        </body>
                        </html>
                    `);

                    try {
                        const tokens = await exchangeCodeForTokens(code, pkce.verifier);
                        saveAuth({
                            type: 'oauth2',
                            access_token: tokens.access_token,
                            refresh_token: tokens.refresh_token,
                            expires_in: tokens.expires_in,
                            timestamp: new Date().toISOString()
                        });

                        console.log(`${COLORS.green}✓ Authentication successful${COLORS.reset}`);
                        server.close();
                        resolve(tokens);
                    } catch (error) {
                        console.error(`${COLORS.red}✗ Token exchange failed: ${error.message}${COLORS.reset}`);
                        server.close();
                        reject(error);
                    }
                } else {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end('<h1>Authentication Failed</h1><p>No authorization code received</p>');
                    server.close();
                    reject(new Error('No authorization code received'));
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            }
        });

        server.listen(AUTH_PORT, 'localhost', () => {
            console.log(`${COLORS.cyan}Waiting for authentication callback on http://localhost:${AUTH_PORT}${COLORS.reset}`);
        });

        // Timeout after 5 minutes
        setTimeout(() => {
            server.close();
            reject(new Error('Authentication timeout'));
        }, 300000);
    });
}

/**
 * Check authentication status
 */
async function checkAuth() {
    const auth = loadAuth();

    if (!auth) {
        console.log(`${COLORS.yellow}⚠ Not authenticated${COLORS.reset}`);
        return false;
    }

    if (auth.type === 'api_key') {
        try {
            await testGeminiAPI(auth.apiKey);
            console.log(`${COLORS.green}✓ API Key is valid${COLORS.reset}`);
            return true;
        } catch (error) {
            console.log(`${COLORS.red}✗ API Key is invalid${COLORS.reset}`);
            return false;
        }
    }

    if (auth.type === 'oauth2') {
        const expiryTime = new Date(auth.timestamp).getTime() + (auth.expires_in * 1000);
        const now = Date.now();

        if (now >= expiryTime - 60000) { // Refresh if less than 1 minute remaining
            console.log(`${COLORS.yellow}Token expired, refreshing...${COLORS.reset}`);

            try {
                const tokens = await refreshAccessToken(auth.refresh_token);
                saveAuth({
                    ...auth,
                    access_token: tokens.access_token,
                    expires_in: tokens.expires_in,
                    timestamp: new Date().toISOString()
                });
                console.log(`${COLORS.green}✓ Token refreshed${COLORS.reset}`);
                return true;
            } catch (error) {
                console.log(`${COLORS.red}✗ Token refresh failed${COLORS.reset}`);
                return false;
            }
        }

        console.log(`${COLORS.green}✓ Authenticated via OAuth2${COLORS.reset}`);
        return true;
    }

    return false;
}

/**
 * Logout
 */
function logout() {
    if (fs.existsSync(AUTH_FILE)) {
        fs.unlinkSync(AUTH_FILE);
    }
    if (fs.existsSync(SESSION_FILE)) {
        fs.unlinkSync(SESSION_FILE);
    }
    console.log(`${COLORS.green}✓ Logged out successfully${COLORS.reset}`);
}

/**
 * Main CLI
 */
async function main() {
    const command = process.argv[2];

    switch (command) {
        case 'login':
            await authenticate();
            break;

        case 'status':
            await checkAuth();
            break;

        case 'logout':
            logout();
            break;

        case 'setup':
            console.log(`${COLORS.bright}${COLORS.cyan}Google Gemini Setup${COLORS.reset}\n`);
            console.log('1. Get OAuth2 credentials:');
            console.log(`   ${COLORS.blue}https://console.cloud.google.com/apis/credentials${COLORS.reset}`);
            console.log('\n2. Or get a Gemini API key:');
            console.log(`   ${COLORS.blue}https://makersuite.google.com/app/apikey${COLORS.reset}`);
            console.log('\n3. Set environment variables:');
            console.log(`   ${COLORS.yellow}export GOOGLE_CLIENT_ID="your-client-id"${COLORS.reset}`);
            console.log(`   ${COLORS.yellow}export GOOGLE_CLIENT_SECRET="your-client-secret"${COLORS.reset}`);
            console.log(`   ${COLORS.yellow}export GEMINI_API_KEY="your-api-key"${COLORS.reset}`);
            console.log('\n4. Run authentication:');
            console.log(`   ${COLORS.green}node google-gemini-auth.js login${COLORS.reset}`);
            break;

        default:
            console.log(`${COLORS.bright}Google Gemini Authentication${COLORS.reset}\n`);
            console.log('Usage:');
            console.log('  node google-gemini-auth.js login   - Authenticate with Google');
            console.log('  node google-gemini-auth.js status  - Check authentication status');
            console.log('  node google-gemini-auth.js logout  - Remove authentication');
            console.log('  node google-gemini-auth.js setup   - Show setup instructions');
    }
}

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error(`${COLORS.red}Error: ${error.message}${COLORS.reset}`);
        process.exit(1);
    });
}

module.exports = {
    authenticate,
    checkAuth,
    logout,
    loadAuth,
    loadSession,
    saveSession,
    testGeminiAPI,
    GOOGLE_CONFIG
};