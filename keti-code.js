#!/usr/bin/env node

/**
 * KETI Code - Zero Dependency AI Code Editor
 * Works on Ubuntu 18.04+ with ONLY Node.js built-in modules
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');
const readline = require('readline');
const os = require('os');
const url = require('url');

// Configuration
const CONFIG = {
    port: process.env.KETI_PORT || 3333,
    host: '127.0.0.1',
    apiKey: process.env.KETI_API_KEY || '',
    aiProvider: process.env.KETI_AI_PROVIDER || 'claude',
    homeDir: path.join(os.homedir(), '.keti-code'),
    workDir: process.cwd()
};

// Terminal sessions
const terminals = new Map();
let terminalIdCounter = 0;

// WebSocket connections (implemented from scratch)
const wsConnections = new Map();

/**
 * Simple WebSocket implementation (no dependencies)
 */
class SimpleWebSocket {
    constructor(request, socket) {
        this.socket = socket;
        this.state = 'CONNECTING';

        // Generate accept key
        const key = request.headers['sec-websocket-key'];
        const acceptKey = this.generateAcceptKey(key);

        // Send handshake
        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
            '\r\n'
        );

        this.state = 'OPEN';

        // Handle incoming frames
        socket.on('data', (buffer) => {
            this.parseFrame(buffer);
        });

        socket.on('close', () => {
            this.state = 'CLOSED';
        });
    }

    generateAcceptKey(key) {
        const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
        return crypto
            .createHash('sha1')
            .update(key + magic)
            .digest('base64');
    }

    parseFrame(buffer) {
        if (buffer.length < 2) return;

        let offset = 0;
        const firstByte = buffer[offset++];
        const fin = !!(firstByte & 0x80);
        const opcode = firstByte & 0x0f;

        const secondByte = buffer[offset++];
        const masked = !!(secondByte & 0x80);
        let payloadLength = secondByte & 0x7f;

        if (payloadLength === 126) {
            payloadLength = buffer.readUInt16BE(offset);
            offset += 2;
        } else if (payloadLength === 127) {
            offset += 4; // Skip high 32 bits
            payloadLength = buffer.readUInt32BE(offset);
            offset += 4;
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

        if (opcode === 0x1) { // Text frame
            const message = payload.toString('utf8');
            this.onMessage(message);
        } else if (opcode === 0x8) { // Close frame
            this.close();
        }
    }

    send(data) {
        if (this.state !== 'OPEN') return;

        const message = Buffer.from(data, 'utf8');
        const length = message.length;

        let frame;
        if (length < 126) {
            frame = Buffer.allocUnsafe(2);
            frame[0] = 0x81; // FIN=1, opcode=1 (text)
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

        this.socket.write(Buffer.concat([frame, message]));
    }

    close() {
        if (this.state === 'CLOSED') return;
        this.state = 'CLOSED';
        const closeFrame = Buffer.from([0x88, 0x00]);
        this.socket.write(closeFrame);
        this.socket.end();
    }

    onMessage(message) {
        // Override this
    }
}

/**
 * Terminal Manager
 */
class Terminal {
    constructor(id) {
        this.id = id;
        this.process = null;
        this.output = [];
        this.cwd = CONFIG.workDir;
    }

    start() {
        const shell = process.env.SHELL || '/bin/bash';
        this.process = spawn(shell, [], {
            cwd: this.cwd,
            env: { ...process.env, TERM: 'xterm-256color' },
            shell: false
        });

        this.process.stdout.on('data', (data) => {
            this.broadcast({
                type: 'output',
                data: data.toString()
            });
        });

        this.process.stderr.on('data', (data) => {
            this.broadcast({
                type: 'output',
                data: data.toString()
            });
        });

        this.process.on('exit', (code) => {
            this.broadcast({
                type: 'exit',
                code: code
            });
        });
    }

    write(data) {
        if (this.process) {
            this.process.stdin.write(data);
        }
    }

    resize(cols, rows) {
        // Try to resize (may not work without node-pty)
        if (this.process) {
            this.process.kill('SIGWINCH');
        }
    }

    broadcast(message) {
        const connections = wsConnections.get(this.id) || [];
        connections.forEach(ws => {
            ws.send(JSON.stringify(message));
        });
    }

    destroy() {
        if (this.process) {
            this.process.kill();
        }
    }
}

/**
 * AI Integration (using only https module)
 */
class AIClient {
    async complete(prompt) {
        if (!CONFIG.apiKey) {
            return { error: 'No API key configured' };
        }

        const providers = {
            claude: {
                hostname: 'api.anthropic.com',
                path: '/v1/messages',
                headers: {
                    'anthropic-version': '2023-06-01',
                    'x-api-key': CONFIG.apiKey
                },
                body: {
                    model: 'claude-3-sonnet-20240229',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 1000
                }
            },
            openai: {
                hostname: 'api.openai.com',
                path: '/v1/chat/completions',
                headers: {
                    'Authorization': `Bearer ${CONFIG.apiKey}`
                },
                body: {
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 1000
                }
            }
        };

        const provider = providers[CONFIG.aiProvider];
        if (!provider) {
            return { error: 'Unknown AI provider' };
        }

        return new Promise((resolve, reject) => {
            const data = JSON.stringify(provider.body);

            const options = {
                hostname: provider.hostname,
                port: 443,
                path: provider.path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length,
                    ...provider.headers
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseData);
                        if (res.statusCode === 200) {
                            const content = CONFIG.aiProvider === 'claude'
                                ? parsed.content?.[0]?.text
                                : parsed.choices?.[0]?.message?.content;
                            resolve({ content });
                        } else {
                            resolve({ error: parsed.error?.message || 'API error' });
                        }
                    } catch (err) {
                        resolve({ error: 'Failed to parse response' });
                    }
                });
            });

            req.on('error', (err) => {
                resolve({ error: err.message });
            });

            req.write(data);
            req.end();
        });
    }
}

const aiClient = new AIClient();

/**
 * Static file server
 */
function serveStatic(filePath, res) {
    const ext = path.extname(filePath);
    const contentTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json'
    };

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
        } else {
            res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
            res.end(content);
        }
    });
}

/**
 * HTTP Server
 */
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // API endpoints
    if (pathname.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');

        if (pathname === '/api/terminal/create' && req.method === 'POST') {
            const id = terminalIdCounter++;
            const terminal = new Terminal(id);
            terminal.start();
            terminals.set(id, terminal);

            res.end(JSON.stringify({ id }));

        } else if (pathname === '/api/ai/complete' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const { prompt } = JSON.parse(body);
                const result = await aiClient.complete(prompt);
                res.end(JSON.stringify(result));
            });

        } else if (pathname === '/api/files' && req.method === 'GET') {
            const dir = parsedUrl.query.dir || CONFIG.workDir;
            fs.readdir(dir, { withFileTypes: true }, (err, files) => {
                if (err) {
                    res.end(JSON.stringify({ error: err.message }));
                } else {
                    const items = files.map(f => ({
                        name: f.name,
                        type: f.isDirectory() ? 'dir' : 'file',
                        path: path.join(dir, f.name)
                    }));
                    res.end(JSON.stringify(items));
                }
            });

        } else if (pathname === '/api/file' && req.method === 'GET') {
            const filePath = parsedUrl.query.path;
            fs.readFile(filePath, 'utf8', (err, content) => {
                if (err) {
                    res.end(JSON.stringify({ error: err.message }));
                } else {
                    res.end(JSON.stringify({ content }));
                }
            });

        } else if (pathname === '/api/file' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const { path: filePath, content } = JSON.parse(body);
                fs.writeFile(filePath, content, (err) => {
                    if (err) {
                        res.end(JSON.stringify({ error: err.message }));
                    } else {
                        res.end(JSON.stringify({ success: true }));
                    }
                });
            });

        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    } else {
        // Serve static files
        let filePath = pathname === '/' ? '/index.html' : pathname;
        filePath = path.join(__dirname, filePath);
        serveStatic(filePath, res);
    }
});

// WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
    const pathname = url.parse(request.url).pathname;

    if (pathname.startsWith('/ws/terminal/')) {
        const terminalId = parseInt(pathname.split('/').pop());
        const ws = new SimpleWebSocket(request, socket);

        // Store connection
        if (!wsConnections.has(terminalId)) {
            wsConnections.set(terminalId, []);
        }
        wsConnections.get(terminalId).push(ws);

        // Handle messages
        ws.onMessage = (message) => {
            try {
                const data = JSON.parse(message);
                const terminal = terminals.get(terminalId);

                if (terminal) {
                    if (data.type === 'input') {
                        terminal.write(data.data);
                    } else if (data.type === 'resize') {
                        terminal.resize(data.cols, data.rows);
                    }
                }
            } catch (err) {
                console.error('WebSocket error:', err);
            }
        };

        socket.on('close', () => {
            const connections = wsConnections.get(terminalId);
            if (connections) {
                const index = connections.indexOf(ws);
                if (index !== -1) {
                    connections.splice(index, 1);
                }
            }
        });
    }
});

// Start server
server.listen(CONFIG.port, CONFIG.host, () => {
    console.log(`
╔════════════════════════════════════════╗
║        KETI Code - AI Editor           ║
║        Zero Dependencies Edition        ║
╠════════════════════════════════════════╣
║  URL: http://${CONFIG.host}:${CONFIG.port}         ║
║  AI:  ${CONFIG.aiProvider.padEnd(33)}║
║  Dir: ${CONFIG.workDir.substring(0, 33).padEnd(33)}║
╚════════════════════════════════════════╝

Press Ctrl+C to stop
`);

    // Auto-open browser
    const openCommands = {
        linux: 'xdg-open',
        darwin: 'open',
        win32: 'start'
    };

    const cmd = openCommands[process.platform];
    if (cmd) {
        exec(`${cmd} http://${CONFIG.host}:${CONFIG.port}`, (err) => {
            if (err) console.log('Could not auto-open browser');
        });
    }
});

// Cleanup on exit
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    terminals.forEach(term => term.destroy());
    process.exit(0);
});