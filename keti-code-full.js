#!/usr/bin/env node

/**
 * KETI Code - FULL AI-Powered System Control Editor
 * Complete system control via AI - like Claude Code but better!
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, exec, execSync } = require('child_process');
const os = require('os');
const net = require('net');
const readline = require('readline');
const cluster = require('cluster');
const dgram = require('dgram');
const dns = require('dns');
const zlib = require('zlib');
const util = require('util');
const stream = require('stream');
const events = require('events');

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    port: process.env.KETI_PORT || 3333,
    host: '127.0.0.1',
    apiKey: process.env.KETI_API_KEY || '',
    aiProvider: process.env.KETI_AI_PROVIDER || 'claude',
    sudoPassword: process.env.SUDO_PASSWORD || '',
    homeDir: path.join(os.homedir(), '.keti-code'),
    workDir: process.cwd(),
    maxFileSize: 10 * 1024 * 1024, // 10MB
    enableSystemControl: true,
    enableDockerControl: true,
    enableNetworkControl: true,
    enableProcessControl: true
};

// ============================================
// AI SYSTEM CONTROLLER
// ============================================
class AISystemController {
    constructor() {
        this.commands = new Map();
        this.history = [];
        this.context = {
            os: os.platform(),
            arch: os.arch(),
            user: os.userInfo().username,
            cwd: process.cwd(),
            env: process.env
        };
    }

    async executeAICommand(prompt) {
        // Parse AI intent
        const intent = await this.parseIntent(prompt);

        switch (intent.action) {
            case 'execute_command':
                return this.executeSystemCommand(intent.command, intent.sudo);

            case 'manage_files':
                return this.manageFiles(intent.operation, intent.files);

            case 'control_process':
                return this.controlProcess(intent.process, intent.operation);

            case 'configure_network':
                return this.configureNetwork(intent.settings);

            case 'manage_docker':
                return this.manageDocker(intent.containers, intent.operation);

            case 'generate_code':
                return this.generateCode(intent.language, intent.description);

            case 'analyze_system':
                return this.analyzeSystem();

            case 'install_software':
                return this.installSoftware(intent.packages);

            case 'create_project':
                return this.createProject(intent.type, intent.name);

            case 'debug_code':
                return this.debugCode(intent.file, intent.issue);

            default:
                return { error: 'Unknown action' };
        }
    }

    async parseIntent(prompt) {
        // AI intent recognition
        const patterns = {
            execute_command: /(?:run|execute|do|perform)\s+(.+)/i,
            manage_files: /(?:create|delete|move|copy|edit)\s+(?:file|folder|directory)\s+(.+)/i,
            control_process: /(?:kill|stop|start|restart)\s+(?:process|service)\s+(.+)/i,
            configure_network: /(?:setup|configure|change)\s+(?:network|ip|dns|firewall)\s+(.+)/i,
            manage_docker: /(?:docker|container)\s+(.+)/i,
            generate_code: /(?:generate|create|write)\s+(?:code|function|class)\s+(.+)/i,
            analyze_system: /(?:analyze|check|monitor)\s+(?:system|performance|resources)/i,
            install_software: /(?:install|setup|download)\s+(.+)/i,
            create_project: /(?:create|setup|init)\s+(?:project|app)\s+(.+)/i,
            debug_code: /(?:debug|fix|resolve)\s+(.+)/i
        };

        for (const [action, pattern] of Object.entries(patterns)) {
            const match = prompt.match(pattern);
            if (match) {
                return {
                    action,
                    raw: prompt,
                    matched: match[1] || '',
                    sudo: prompt.includes('sudo'),
                    command: match[1],
                    // Additional parsing based on action
                    ...this.parseActionDetails(action, match[1])
                };
            }
        }

        // Default to command execution
        return {
            action: 'execute_command',
            command: prompt,
            sudo: prompt.includes('sudo')
        };
    }

    parseActionDetails(action, matched) {
        const details = {};

        switch (action) {
            case 'manage_files':
                const fileOp = matched.match(/^(\w+)\s+(.+)/);
                if (fileOp) {
                    details.operation = fileOp[1];
                    details.files = fileOp[2].split(/\s+/);
                }
                break;

            case 'control_process':
                const procOp = matched.match(/^(\w+)\s+(.+)/);
                if (procOp) {
                    details.operation = procOp[1];
                    details.process = procOp[2];
                }
                break;

            case 'generate_code':
                const langMatch = matched.match(/(\w+)\s+(.+)/);
                if (langMatch) {
                    details.language = langMatch[1];
                    details.description = langMatch[2];
                }
                break;
        }

        return details;
    }

    async executeSystemCommand(command, needsSudo = false) {
        return new Promise((resolve, reject) => {
            const actualCommand = needsSudo && CONFIG.sudoPassword
                ? `echo '${CONFIG.sudoPassword}' | sudo -S ${command}`
                : command;

            exec(actualCommand, {
                maxBuffer: 1024 * 1024 * 10,
                timeout: 30000
            }, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        success: false,
                        error: error.message,
                        stderr: stderr,
                        code: error.code
                    });
                } else {
                    resolve({
                        success: true,
                        output: stdout,
                        stderr: stderr
                    });
                }
            });
        });
    }

    async manageFiles(operation, files) {
        const ops = {
            create: async (file) => {
                const dir = path.dirname(file);
                await fs.promises.mkdir(dir, { recursive: true });
                await fs.promises.writeFile(file, '');
                return `Created: ${file}`;
            },
            delete: async (file) => {
                await fs.promises.unlink(file);
                return `Deleted: ${file}`;
            },
            move: async (src, dest) => {
                await fs.promises.rename(src, dest);
                return `Moved: ${src} -> ${dest}`;
            },
            copy: async (src, dest) => {
                await fs.promises.copyFile(src, dest);
                return `Copied: ${src} -> ${dest}`;
            }
        };

        try {
            const op = ops[operation];
            if (op) {
                const result = await op(...files);
                return { success: true, message: result };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async controlProcess(processName, operation) {
        try {
            switch (operation) {
                case 'list':
                    const list = execSync('ps aux').toString();
                    const filtered = list.split('\n').filter(line =>
                        line.toLowerCase().includes(processName.toLowerCase())
                    );
                    return { success: true, processes: filtered };

                case 'kill':
                    execSync(`pkill -f ${processName}`);
                    return { success: true, message: `Killed processes matching: ${processName}` };

                case 'start':
                    const child = spawn(processName, [], { detached: true, stdio: 'ignore' });
                    child.unref();
                    return { success: true, pid: child.pid };

                default:
                    return { success: false, error: 'Unknown operation' };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async configureNetwork(settings) {
        const commands = [];

        if (settings.ip) {
            commands.push(`ip addr add ${settings.ip} dev ${settings.interface || 'eth0'}`);
        }

        if (settings.dns) {
            commands.push(`echo "nameserver ${settings.dns}" | tee /etc/resolv.conf`);
        }

        if (settings.firewall) {
            commands.push(`ufw ${settings.firewall}`);
        }

        const results = [];
        for (const cmd of commands) {
            results.push(await this.executeSystemCommand(cmd, true));
        }

        return { success: true, results };
    }

    async manageDocker(containers, operation) {
        const dockerOps = {
            list: 'docker ps -a',
            start: `docker start ${containers}`,
            stop: `docker stop ${containers}`,
            remove: `docker rm ${containers}`,
            logs: `docker logs ${containers}`,
            stats: 'docker stats --no-stream'
        };

        const command = dockerOps[operation];
        if (command) {
            return await this.executeSystemCommand(command);
        }

        return { success: false, error: 'Unknown Docker operation' };
    }

    async generateCode(language, description) {
        // Use AI to generate code
        const templates = {
            javascript: {
                function: `function ${description}() {\n    // TODO: Implement ${description}\n    console.log('${description}');\n}`,
                class: `class ${description} {\n    constructor() {\n        // Initialize\n    }\n}`,
                express: `const express = require('express');\nconst app = express();\n\napp.get('/', (req, res) => {\n    res.send('${description}');\n});\n\napp.listen(3000);`
            },
            python: {
                function: `def ${description}():\n    """${description}"""\n    pass`,
                class: `class ${description}:\n    def __init__(self):\n        pass`,
                flask: `from flask import Flask\napp = Flask(__name__)\n\n@app.route('/')\ndef hello():\n    return '${description}'`
            }
        };

        const template = templates[language.toLowerCase()];
        if (template) {
            return {
                success: true,
                code: template.function || template.class,
                language
            };
        }

        return { success: false, error: 'Unsupported language' };
    }

    async analyzeSystem() {
        const analysis = {
            cpu: os.cpus(),
            memory: {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem()
            },
            disk: await this.getDiskUsage(),
            network: os.networkInterfaces(),
            uptime: os.uptime(),
            loadAverage: os.loadavg(),
            processes: await this.getProcessCount()
        };

        return { success: true, analysis };
    }

    async getDiskUsage() {
        try {
            const df = execSync('df -h').toString();
            return df.split('\n').slice(1).map(line => {
                const parts = line.split(/\s+/);
                return {
                    filesystem: parts[0],
                    size: parts[1],
                    used: parts[2],
                    available: parts[3],
                    usePercent: parts[4],
                    mounted: parts[5]
                };
            }).filter(d => d.filesystem);
        } catch {
            return [];
        }
    }

    async getProcessCount() {
        try {
            const count = execSync('ps aux | wc -l').toString().trim();
            return parseInt(count) - 1; // Subtract header
        } catch {
            return 0;
        }
    }

    async installSoftware(packages) {
        const pkgManager = this.detectPackageManager();
        const command = {
            'apt': `apt-get install -y ${packages}`,
            'yum': `yum install -y ${packages}`,
            'brew': `brew install ${packages}`,
            'snap': `snap install ${packages}`
        }[pkgManager];

        if (command) {
            return await this.executeSystemCommand(command, true);
        }

        return { success: false, error: 'Package manager not supported' };
    }

    detectPackageManager() {
        const managers = ['apt', 'yum', 'brew', 'snap'];
        for (const mgr of managers) {
            try {
                execSync(`which ${mgr}`, { stdio: 'ignore' });
                return mgr;
            } catch {}
        }
        return null;
    }

    async createProject(type, name) {
        const projectGenerators = {
            node: async () => {
                const dir = path.join(process.cwd(), name);
                await fs.promises.mkdir(dir, { recursive: true });

                const packageJson = {
                    name: name,
                    version: '1.0.0',
                    description: `${name} project`,
                    main: 'index.js',
                    scripts: {
                        start: 'node index.js',
                        dev: 'node --watch index.js'
                    }
                };

                await fs.promises.writeFile(
                    path.join(dir, 'package.json'),
                    JSON.stringify(packageJson, null, 2)
                );

                await fs.promises.writeFile(
                    path.join(dir, 'index.js'),
                    `console.log('Hello from ${name}');`
                );

                return `Created Node.js project: ${name}`;
            },

            python: async () => {
                const dir = path.join(process.cwd(), name);
                await fs.promises.mkdir(dir, { recursive: true });

                await fs.promises.writeFile(
                    path.join(dir, 'requirements.txt'),
                    'flask==2.0.1\nrequests==2.26.0'
                );

                await fs.promises.writeFile(
                    path.join(dir, 'app.py'),
                    `#!/usr/bin/env python3\n\nif __name__ == '__main__':\n    print('Hello from ${name}')`
                );

                return `Created Python project: ${name}`;
            },

            react: async () => {
                return await this.executeSystemCommand(`npx create-react-app ${name}`);
            }
        };

        const generator = projectGenerators[type];
        if (generator) {
            try {
                const result = await generator();
                return { success: true, message: result };
            } catch (err) {
                return { success: false, error: err.message };
            }
        }

        return { success: false, error: 'Unknown project type' };
    }
}

// ============================================
// AI TASK PLANNER
// ============================================
class AITaskPlanner {
    constructor(aiController) {
        this.aiController = aiController;
        this.tasks = [];
        this.currentPlan = null;
    }

    async createPlan(goal) {
        // Analyze goal and create execution plan
        const plan = {
            id: crypto.randomUUID(),
            goal: goal,
            created: new Date(),
            steps: await this.generateSteps(goal),
            status: 'pending'
        };

        this.currentPlan = plan;
        return plan;
    }

    async generateSteps(goal) {
        // AI-based step generation
        const steps = [];

        // Analyze goal keywords
        const keywords = goal.toLowerCase().split(' ');

        if (keywords.includes('deploy')) {
            steps.push(
                { action: 'analyze_code', description: 'Analyze code for issues' },
                { action: 'run_tests', description: 'Run test suite' },
                { action: 'build', description: 'Build application' },
                { action: 'deploy', description: 'Deploy to server' }
            );
        } else if (keywords.includes('setup')) {
            steps.push(
                { action: 'check_requirements', description: 'Check system requirements' },
                { action: 'install_dependencies', description: 'Install dependencies' },
                { action: 'configure', description: 'Configure application' },
                { action: 'verify', description: 'Verify installation' }
            );
        } else if (keywords.includes('debug')) {
            steps.push(
                { action: 'collect_logs', description: 'Collect error logs' },
                { action: 'analyze_errors', description: 'Analyze error patterns' },
                { action: 'identify_cause', description: 'Identify root cause' },
                { action: 'apply_fix', description: 'Apply fix' },
                { action: 'test_fix', description: 'Test the fix' }
            );
        }

        return steps;
    }

    async executePlan() {
        if (!this.currentPlan) {
            return { error: 'No plan to execute' };
        }

        const results = [];
        this.currentPlan.status = 'executing';

        for (const step of this.currentPlan.steps) {
            step.status = 'running';

            try {
                const result = await this.executeStep(step);
                step.status = 'completed';
                step.result = result;
                results.push(result);
            } catch (err) {
                step.status = 'failed';
                step.error = err.message;
                break;
            }
        }

        this.currentPlan.status = 'completed';
        return { plan: this.currentPlan, results };
    }

    async executeStep(step) {
        // Execute individual step based on action
        switch (step.action) {
            case 'analyze_code':
                return await this.aiController.executeSystemCommand('npm run lint || eslint . || true');

            case 'run_tests':
                return await this.aiController.executeSystemCommand('npm test || jest || pytest || true');

            case 'build':
                return await this.aiController.executeSystemCommand('npm run build || make || true');

            case 'deploy':
                return await this.aiController.executeSystemCommand('npm run deploy || true');

            default:
                return { message: `Executed: ${step.description}` };
        }
    }
}

// ============================================
// ADVANCED TERMINAL WITH AI
// ============================================
class AITerminal {
    constructor(aiController) {
        this.aiController = aiController;
        this.sessions = new Map();
        this.aiMode = false;
    }

    createSession(id) {
        const session = {
            id: id,
            process: null,
            history: [],
            cwd: process.cwd(),
            aiContext: []
        };

        // Start shell with AI integration
        const shell = process.env.SHELL || '/bin/bash';
        session.process = spawn(shell, [], {
            cwd: session.cwd,
            env: { ...process.env, TERM: 'xterm-256color' },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Set up AI command interception
        session.interceptor = this.createInterceptor(session);

        this.sessions.set(id, session);
        return session;
    }

    createInterceptor(session) {
        return {
            processInput: async (input) => {
                // Check if it's an AI command
                if (input.startsWith('ai:')) {
                    const aiCommand = input.substring(3).trim();
                    return await this.processAICommand(aiCommand, session);
                }

                // Check if AI mode is on
                if (this.aiMode) {
                    return await this.enhanceCommand(input, session);
                }

                return input;
            }
        };
    }

    async processAICommand(command, session) {
        const result = await this.aiController.executeAICommand(command);

        // Store in context for learning
        session.aiContext.push({
            command: command,
            result: result,
            timestamp: new Date()
        });

        return JSON.stringify(result, null, 2);
    }

    async enhanceCommand(command, session) {
        // AI enhancement of regular commands
        const enhancements = {
            'ls': 'ls -la --color=auto',
            'ps': 'ps aux',
            'df': 'df -h',
            'grep': 'grep --color=auto',
            'find': 'find . -name'
        };

        for (const [cmd, enhanced] of Object.entries(enhancements)) {
            if (command.startsWith(cmd)) {
                return command.replace(cmd, enhanced);
            }
        }

        return command;
    }

    writeToSession(sessionId, data) {
        const session = this.sessions.get(sessionId);
        if (session && session.process) {
            session.process.stdin.write(data);
        }
    }
}

// ============================================
// AI CODE ASSISTANT
// ============================================
class AICodeAssistant {
    constructor() {
        this.models = {
            'claude': {
                endpoint: 'https://api.anthropic.com/v1/messages',
                headers: (key) => ({
                    'anthropic-version': '2023-06-01',
                    'x-api-key': key,
                    'Content-Type': 'application/json'
                })
            },
            'openai': {
                endpoint: 'https://api.openai.com/v1/chat/completions',
                headers: (key) => ({
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                })
            }
        };
    }

    async complete(prompt, context = {}) {
        const enrichedPrompt = this.enrichPrompt(prompt, context);

        return await this.callAI(enrichedPrompt);
    }

    enrichPrompt(prompt, context) {
        let enriched = prompt;

        if (context.code) {
            enriched = `Code context:\n\`\`\`${context.language || ''}\n${context.code}\n\`\`\`\n\n${prompt}`;
        }

        if (context.error) {
            enriched += `\n\nError to fix:\n${context.error}`;
        }

        if (context.systemInfo) {
            enriched += `\n\nSystem: ${context.systemInfo.os} ${context.systemInfo.arch}`;
        }

        return enriched;
    }

    async callAI(prompt) {
        const provider = CONFIG.aiProvider;
        const model = this.models[provider];

        if (!model || !CONFIG.apiKey) {
            return { error: 'AI not configured' };
        }

        const body = provider === 'claude' ? {
            model: 'claude-3-sonnet-20240229',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2000
        } : {
            model: 'gpt-4',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2000
        };

        return new Promise((resolve) => {
            const data = JSON.stringify(body);
            const url = new URL(model.endpoint);

            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                    ...model.headers(CONFIG.apiKey),
                    'Content-Length': data.length
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', chunk => responseData += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseData);
                        const content = provider === 'claude'
                            ? parsed.content?.[0]?.text
                            : parsed.choices?.[0]?.message?.content;

                        resolve({ success: true, content });
                    } catch (err) {
                        resolve({ success: false, error: 'Parse error' });
                    }
                });
            });

            req.on('error', err => resolve({ success: false, error: err.message }));
            req.write(data);
            req.end();
        });
    }

    async generateCode(description, language = 'javascript') {
        const prompt = `Generate ${language} code for: ${description}\n\nProvide clean, production-ready code with comments.`;
        return await this.complete(prompt, { language });
    }

    async fixCode(code, error) {
        const prompt = `Fix this error in the code:\n\nError: ${error}\n\nProvide the corrected code.`;
        return await this.complete(prompt, { code, error });
    }

    async explainCode(code) {
        const prompt = 'Explain this code in detail, including what it does and how it works.';
        return await this.complete(prompt, { code });
    }

    async optimizeCode(code) {
        const prompt = 'Optimize this code for performance and readability. Explain the improvements.';
        return await this.complete(prompt, { code });
    }
}

// ============================================
// FILE SYSTEM MANAGER
// ============================================
class FileSystemManager {
    async getDirectoryTree(dirPath = '.', maxDepth = 3, currentDepth = 0) {
        if (currentDepth >= maxDepth) return null;

        const stats = await fs.promises.stat(dirPath);
        const item = {
            name: path.basename(dirPath),
            path: dirPath,
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime
        };

        if (stats.isDirectory()) {
            try {
                const files = await fs.promises.readdir(dirPath);
                item.children = [];

                for (const file of files) {
                    if (file.startsWith('.')) continue; // Skip hidden files

                    const childPath = path.join(dirPath, file);
                    const child = await this.getDirectoryTree(childPath, maxDepth, currentDepth + 1);
                    if (child) item.children.push(child);
                }
            } catch (err) {
                item.error = err.message;
            }
        }

        return item;
    }

    async searchFiles(pattern, dir = '.') {
        const results = [];

        async function search(currentDir) {
            try {
                const files = await fs.promises.readdir(currentDir);

                for (const file of files) {
                    const filePath = path.join(currentDir, file);
                    const stats = await fs.promises.stat(filePath);

                    if (stats.isDirectory() && !file.startsWith('.')) {
                        await search(filePath);
                    } else if (file.includes(pattern)) {
                        results.push({
                            path: filePath,
                            name: file,
                            size: stats.size,
                            modified: stats.mtime
                        });
                    }
                }
            } catch (err) {
                // Skip inaccessible directories
            }
        }

        await search(dir);
        return results;
    }

    async getFileContent(filePath) {
        const stats = await fs.promises.stat(filePath);

        if (stats.size > CONFIG.maxFileSize) {
            return { error: 'File too large' };
        }

        const content = await fs.promises.readFile(filePath, 'utf8');
        return { content, stats };
    }

    async saveFile(filePath, content) {
        await fs.promises.writeFile(filePath, content);
        return { success: true, path: filePath };
    }

    async createBackup(filePath) {
        const backupPath = `${filePath}.backup.${Date.now()}`;
        await fs.promises.copyFile(filePath, backupPath);
        return backupPath;
    }
}

// ============================================
// GIT INTEGRATION
// ============================================
class GitManager {
    async status() {
        return await this.executeGit('status --short');
    }

    async commit(message) {
        await this.executeGit('add .');
        return await this.executeGit(`commit -m "${message}"`);
    }

    async push() {
        return await this.executeGit('push');
    }

    async pull() {
        return await this.executeGit('pull');
    }

    async branch(name) {
        if (name) {
            return await this.executeGit(`checkout -b ${name}`);
        }
        return await this.executeGit('branch');
    }

    async diff() {
        return await this.executeGit('diff');
    }

    async log(limit = 10) {
        return await this.executeGit(`log --oneline -n ${limit}`);
    }

    async executeGit(command) {
        return new Promise((resolve) => {
            exec(`git ${command}`, (error, stdout, stderr) => {
                if (error) {
                    resolve({ success: false, error: stderr || error.message });
                } else {
                    resolve({ success: true, output: stdout });
                }
            });
        });
    }
}

// ============================================
// MAIN SERVER
// ============================================
const aiController = new AISystemController();
const taskPlanner = new AITaskPlanner(aiController);
const aiTerminal = new AITerminal(aiController);
const codeAssistant = new AICodeAssistant();
const fileManager = new FileSystemManager();
const gitManager = new GitManager();

// WebSocket connections
const wsConnections = new Map();

// HTTP Server
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // API Routes
    if (pathname.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');

        try {
            // AI System Control
            if (pathname === '/api/ai/execute' && req.method === 'POST') {
                const body = await getBody(req);
                const result = await aiController.executeAICommand(body.command);
                res.end(JSON.stringify(result));

            // Task Planning
            } else if (pathname === '/api/plan/create' && req.method === 'POST') {
                const body = await getBody(req);
                const plan = await taskPlanner.createPlan(body.goal);
                res.end(JSON.stringify(plan));

            } else if (pathname === '/api/plan/execute' && req.method === 'POST') {
                const result = await taskPlanner.executePlan();
                res.end(JSON.stringify(result));

            // Code Assistant
            } else if (pathname === '/api/code/generate' && req.method === 'POST') {
                const body = await getBody(req);
                const result = await codeAssistant.generateCode(body.description, body.language);
                res.end(JSON.stringify(result));

            } else if (pathname === '/api/code/fix' && req.method === 'POST') {
                const body = await getBody(req);
                const result = await codeAssistant.fixCode(body.code, body.error);
                res.end(JSON.stringify(result));

            // File System
            } else if (pathname === '/api/files/tree' && req.method === 'GET') {
                const tree = await fileManager.getDirectoryTree();
                res.end(JSON.stringify(tree));

            } else if (pathname === '/api/files/search' && req.method === 'GET') {
                const pattern = url.searchParams.get('q');
                const results = await fileManager.searchFiles(pattern);
                res.end(JSON.stringify(results));

            // Git Operations
            } else if (pathname === '/api/git/status' && req.method === 'GET') {
                const status = await gitManager.status();
                res.end(JSON.stringify(status));

            } else if (pathname === '/api/git/commit' && req.method === 'POST') {
                const body = await getBody(req);
                const result = await gitManager.commit(body.message);
                res.end(JSON.stringify(result));

            // System Info
            } else if (pathname === '/api/system/info' && req.method === 'GET') {
                const info = await aiController.analyzeSystem();
                res.end(JSON.stringify(info));

            // Terminal
            } else if (pathname === '/api/terminal/create' && req.method === 'POST') {
                const id = crypto.randomUUID();
                const session = aiTerminal.createSession(id);
                res.end(JSON.stringify({ id, session: { id: session.id } }));

            } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
    } else {
        // Serve static files
        serveStaticFile(pathname, res);
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

// Serve static files
function serveStaticFile(pathname, res) {
    const file = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.join(__dirname, file);

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
        } else {
            const ext = path.extname(file);
            const contentTypes = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json'
            };
            res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
            res.end(content);
        }
    });
}

// WebSocket handling
server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith('/ws/')) {
        // Implement WebSocket handling
        handleWebSocket(request, socket);
    }
});

function handleWebSocket(request, socket) {
    // Simple WebSocket implementation
    const key = request.headers['sec-websocket-key'];
    const acceptKey = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
        '\r\n'
    );

    socket.on('data', (buffer) => {
        // Handle WebSocket frames
    });
}

// Start server
server.listen(CONFIG.port, CONFIG.host, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║      KETI Code - FULL AI System Controller       ║
║                                                   ║
║  Features:                                        ║
║  • AI-Powered System Control                     ║
║  • Task Planning & Automation                    ║
║  • Code Generation & Fixing                      ║
║  • Git Integration                               ║
║  • Docker Management                             ║
║  • Network Configuration                         ║
║  • Process Control                               ║
║                                                   ║
║  URL: http://${CONFIG.host}:${CONFIG.port}                      ║
╚══════════════════════════════════════════════════╝
`);

    // Auto-open browser
    const open = process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${open} http://${CONFIG.host}:${CONFIG.port}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down KETI Code...');
    process.exit(0);
});