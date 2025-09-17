#!/usr/bin/env node

/**
 * KETI Copilot - Complete Code Completion System
 * Implements Codex-style and GitHub Copilot-style completions
 * Zero dependencies - Works on Ubuntu 18.04+
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

/**
 * AI Code Completion Engine
 * Supports OpenAI Codex, GitHub Copilot, and Claude
 */
class CodeCompletionEngine {
    constructor(authConfig) {
        this.authConfig = authConfig;
        this.cache = new Map();
        this.sessionId = crypto.randomBytes(16).toString('hex');

        // Provider-specific configurations
        this.providers = {
            openai: {
                name: 'OpenAI Codex',
                apiHost: 'api.openai.com',
                completionPath: '/v1/completions',
                model: 'code-davinci-002',
                maxTokens: 256,
                temperature: 0.2,
                stopSequences: ['\n\n', '```', '// End']
            },
            github: {
                name: 'GitHub Copilot',
                apiHost: 'copilot-proxy.githubusercontent.com',
                completionPath: '/v1/engines/copilot-codex/completions',
                model: 'cushman-ml',
                maxTokens: 200,
                temperature: 0.1,
                stopSequences: ['\n\n', '\r\n\r\n']
            },
            anthropic: {
                name: 'Claude',
                apiHost: 'api.anthropic.com',
                completionPath: '/v1/complete',
                model: 'claude-instant-1.2',
                maxTokens: 512,
                temperature: 0.3
            }
        };
    }

    /**
     * Get code completions (Codex-style)
     */
    async getCompletion(prompt, options = {}) {
        const provider = this.authConfig?.provider || 'openai';
        const config = this.providers[provider];

        if (!config) {
            throw new Error(`Unknown provider: ${provider}`);
        }

        // Check cache first
        const cacheKey = `${provider}:${crypto.createHash('md5').update(prompt).digest('hex')}`;
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 60000) { // 1 minute cache
                return cached.data;
            }
        }

        // Prepare request based on provider
        const requestBody = this.buildRequestBody(provider, prompt, options);

        // Make API request
        const response = await this.makeAPIRequest(config, requestBody);

        // Cache the response
        this.cache.set(cacheKey, {
            data: response,
            timestamp: Date.now()
        });

        return response;
    }

    /**
     * Build request body based on provider
     */
    buildRequestBody(provider, prompt, options) {
        const config = this.providers[provider];

        switch (provider) {
            case 'openai':
                return {
                    model: options.model || config.model,
                    prompt: prompt,
                    max_tokens: options.maxTokens || config.maxTokens,
                    temperature: options.temperature || config.temperature,
                    top_p: options.topP || 1,
                    n: options.n || 1,
                    stop: options.stop || config.stopSequences,
                    stream: options.stream || false,
                    suffix: options.suffix,
                    echo: false,
                    presence_penalty: 0,
                    frequency_penalty: 0,
                    logprobs: options.logprobs || null
                };

            case 'github':
                return {
                    prompt: prompt,
                    suffix: options.suffix || '',
                    max_tokens: options.maxTokens || config.maxTokens,
                    temperature: options.temperature || config.temperature,
                    top_p: options.topP || 1,
                    n: options.n || 1,
                    stop: options.stop || config.stopSequences,
                    stream: options.stream || false,
                    nwo: options.repo || 'unknown/unknown',
                    language: options.language || this.detectLanguage(prompt)
                };

            case 'anthropic':
                return {
                    prompt: `\n\nHuman: Complete this code:\n${prompt}\n\nAssistant: Here's the completion:`,
                    model: options.model || config.model,
                    max_tokens_to_sample: options.maxTokens || config.maxTokens,
                    temperature: options.temperature || config.temperature,
                    stop_sequences: ['\n\nHuman:', '\n\nAssistant:']
                };

            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }

    /**
     * Make API request to provider
     */
    makeAPIRequest(config, requestBody) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: config.apiHost,
                port: 443,
                path: config.completionPath,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authConfig.access_token}`,
                    'User-Agent': 'KETI-Copilot/1.0',
                    'X-Request-Id': crypto.randomBytes(16).toString('hex')
                }
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);

                        if (res.statusCode === 200) {
                            resolve(this.parseResponse(response, config));
                        } else {
                            reject(new Error(`API error: ${response.error?.message || data}`));
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${e.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(JSON.stringify(requestBody));
            req.end();
        });
    }

    /**
     * Parse API response based on provider
     */
    parseResponse(response, config) {
        const provider = Object.keys(this.providers).find(
            p => this.providers[p].apiHost === config.apiHost
        );

        switch (provider) {
            case 'openai':
            case 'github':
                return {
                    completions: response.choices?.map(c => ({
                        text: c.text,
                        index: c.index,
                        logprobs: c.logprobs,
                        finish_reason: c.finish_reason
                    })) || [],
                    usage: response.usage,
                    id: response.id,
                    model: response.model
                };

            case 'anthropic':
                return {
                    completions: [{
                        text: response.completion,
                        index: 0,
                        finish_reason: response.stop_reason
                    }],
                    usage: {
                        prompt_tokens: response.usage?.input_tokens,
                        completion_tokens: response.usage?.output_tokens,
                        total_tokens: response.usage?.total_tokens
                    },
                    id: response.log_id,
                    model: response.model
                };

            default:
                return response;
        }
    }

    /**
     * Detect programming language from code
     */
    detectLanguage(code) {
        const patterns = {
            javascript: /\b(const|let|var|function|=>|async|await)\b/,
            python: /\b(def|import|from|class|if __name__|print)\b/,
            java: /\b(public|private|class|interface|extends|implements)\b/,
            typescript: /\b(interface|type|enum|namespace|declare)\b/,
            cpp: /\b(#include|using namespace|int main|std::)\b/,
            go: /\b(package|func|import|defer|go |chan)\b/,
            rust: /\b(fn |impl |trait |pub |mut |let |match)\b/,
            ruby: /\b(def |class |module |require |end)\b/,
            php: /\b(<\?php|\$[a-zA-Z_]|function |echo |require_once)\b/,
            swift: /\b(func |var |let |struct |class |import |protocol)\b/
        };

        for (const [lang, pattern] of Object.entries(patterns)) {
            if (pattern.test(code)) {
                return lang;
            }
        }

        return 'text';
    }

    /**
     * Get inline suggestions (Copilot-style)
     */
    async getInlineSuggestion(context) {
        const { prefix, suffix, filename, language } = context;

        const prompt = this.buildContextPrompt(prefix, suffix, filename, language);

        const options = {
            maxTokens: 150,
            temperature: 0.0,
            stop: ['\n', '\r\n'],
            suffix: suffix,
            language: language
        };

        const response = await this.getCompletion(prompt, options);

        return response.completions.map(c => ({
            text: c.text.trim(),
            confidence: this.calculateConfidence(c),
            displayText: this.formatSuggestion(c.text)
        }));
    }

    /**
     * Build context-aware prompt
     */
    buildContextPrompt(prefix, suffix, filename, language) {
        let prompt = '';

        // Add file context
        if (filename) {
            prompt += `// File: ${filename}\n`;
        }

        // Add language hint
        if (language) {
            prompt += `// Language: ${language}\n`;
        }

        // Add the actual code context
        prompt += prefix;

        // Add cursor position marker
        prompt += '/* <CURSOR> */';

        // Add suffix context if available
        if (suffix) {
            prompt += '\n' + suffix.split('\n').slice(0, 5).join('\n');
        }

        return prompt;
    }

    /**
     * Calculate confidence score
     */
    calculateConfidence(completion) {
        if (!completion.logprobs) return 0.5;

        const tokens = completion.logprobs.tokens || [];
        const probs = completion.logprobs.token_logprobs || [];

        if (tokens.length === 0) return 0.5;

        // Calculate average probability
        const avgLogProb = probs.reduce((a, b) => a + b, 0) / probs.length;
        const confidence = Math.exp(avgLogProb);

        return Math.min(Math.max(confidence, 0), 1);
    }

    /**
     * Format suggestion for display
     */
    formatSuggestion(text) {
        // Trim and format the suggestion
        text = text.trim();

        // Add proper indentation if needed
        if (text.includes('\n')) {
            const lines = text.split('\n');
            return lines.map((line, i) => i === 0 ? line : '  ' + line).join('\n');
        }

        return text;
    }

    /**
     * Stream completions (real-time)
     */
    async* streamCompletion(prompt, options = {}) {
        options.stream = true;

        const provider = this.authConfig?.provider || 'openai';
        const config = this.providers[provider];
        const requestBody = this.buildRequestBody(provider, prompt, options);

        // Create streaming request
        yield* this.streamAPIRequest(config, requestBody);
    }

    /**
     * Stream API request
     */
    async* streamAPIRequest(config, requestBody) {
        // Implementation would use actual streaming API
        // For demo, simulate streaming
        const fullResponse = await this.makeAPIRequest(config, requestBody);
        const text = fullResponse.completions[0]?.text || '';

        // Simulate streaming by yielding characters
        for (let i = 0; i < text.length; i++) {
            yield text[i];
            await new Promise(r => setTimeout(r, 10)); // Simulate delay
        }
    }
}

/**
 * Interactive REPL for testing completions
 */
class CompletionREPL {
    constructor(engine) {
        this.engine = engine;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'code> '
        });

        this.history = [];
        this.context = {
            prefix: '',
            suffix: '',
            language: 'javascript',
            filename: 'test.js'
        };
    }

    /**
     * Start the REPL
     */
    start() {
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║     KETI Copilot - Code Completion     ║');
        console.log('║         Codex & Copilot Style          ║');
        console.log('╚════════════════════════════════════════╝\n');
        console.log('Commands:');
        console.log('  /complete <code>  - Get completion');
        console.log('  /inline          - Get inline suggestion');
        console.log('  /stream <code>   - Stream completion');
        console.log('  /lang <language> - Set language');
        console.log('  /file <filename> - Set filename');
        console.log('  /help           - Show help');
        console.log('  /exit           - Exit\n');

        this.rl.prompt();

        this.rl.on('line', async (line) => {
            await this.handleCommand(line);
            this.rl.prompt();
        });

        this.rl.on('close', () => {
            console.log('\nGoodbye!');
            process.exit(0);
        });
    }

    /**
     * Handle REPL commands
     */
    async handleCommand(line) {
        try {
            if (line.startsWith('/')) {
                const [cmd, ...args] = line.split(' ');
                const arg = args.join(' ');

                switch (cmd) {
                    case '/complete':
                        await this.complete(arg);
                        break;

                    case '/inline':
                        await this.inline();
                        break;

                    case '/stream':
                        await this.stream(arg);
                        break;

                    case '/lang':
                        this.context.language = arg || 'javascript';
                        console.log(`Language set to: ${this.context.language}`);
                        break;

                    case '/file':
                        this.context.filename = arg || 'test.js';
                        console.log(`Filename set to: ${this.context.filename}`);
                        break;

                    case '/help':
                        this.showHelp();
                        break;

                    case '/exit':
                        this.rl.close();
                        break;

                    default:
                        console.log(`Unknown command: ${cmd}`);
                }
            } else {
                // Add to context
                this.context.prefix += line + '\n';
                this.history.push(line);
                console.log('Added to context. Use /complete or /inline to get suggestions.');
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
        }
    }

    /**
     * Get completion
     */
    async complete(prompt) {
        if (!prompt && !this.context.prefix) {
            console.log('No code provided');
            return;
        }

        const code = prompt || this.context.prefix;
        console.log('\nGetting completion...\n');

        const response = await this.engine.getCompletion(code);

        response.completions.forEach((c, i) => {
            console.log(`--- Suggestion ${i + 1} ---`);
            console.log(c.text);
            console.log(`Confidence: ${this.engine.calculateConfidence(c).toFixed(2)}`);
            console.log();
        });
    }

    /**
     * Get inline suggestion
     */
    async inline() {
        console.log('\nGetting inline suggestion...\n');

        const suggestions = await this.engine.getInlineSuggestion(this.context);

        suggestions.forEach((s, i) => {
            console.log(`--- Suggestion ${i + 1} ---`);
            console.log(s.displayText);
            console.log(`Confidence: ${s.confidence.toFixed(2)}`);
            console.log();
        });
    }

    /**
     * Stream completion
     */
    async stream(prompt) {
        if (!prompt && !this.context.prefix) {
            console.log('No code provided');
            return;
        }

        const code = prompt || this.context.prefix;
        console.log('\nStreaming completion...\n');

        process.stdout.write('> ');
        for await (const char of this.engine.streamCompletion(code)) {
            process.stdout.write(char);
        }
        console.log('\n');
    }

    /**
     * Show help
     */
    showHelp() {
        console.log('\n=== KETI Copilot Help ===\n');
        console.log('This is a Codex/Copilot-style code completion system.');
        console.log('It provides intelligent code suggestions based on context.\n');
        console.log('Features:');
        console.log('- Multi-provider support (OpenAI, GitHub, Claude)');
        console.log('- Context-aware completions');
        console.log('- Inline suggestions');
        console.log('- Streaming completions');
        console.log('- Language detection');
        console.log('- Confidence scoring\n');
        console.log('Type code line by line to build context,');
        console.log('then use /complete or /inline to get suggestions.\n');
    }
}

/**
 * Main function
 */
async function main() {
    // Load auth config
    const authFile = path.join(os.homedir(), '.keti', 'auth.json');
    let authConfig;

    try {
        if (fs.existsSync(authFile)) {
            authConfig = JSON.parse(fs.readFileSync(authFile, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load auth config:', e.message);
    }

    if (!authConfig) {
        console.log('❌ Not authenticated');
        console.log('Run "keti-codex login" to authenticate first');
        process.exit(1);
    }

    // Create completion engine
    const engine = new CodeCompletionEngine(authConfig);

    // Check for command line usage
    const command = process.argv[2];

    if (command === 'complete') {
        // Direct completion
        const code = process.argv.slice(3).join(' ');
        if (!code) {
            console.log('Usage: keti-copilot complete <code>');
            process.exit(1);
        }

        const response = await engine.getCompletion(code);
        response.completions.forEach(c => {
            console.log(c.text);
        });
    } else if (command === 'repl') {
        // Start REPL
        const repl = new CompletionREPL(engine);
        repl.start();
    } else {
        // Default to REPL
        const repl = new CompletionREPL(engine);
        repl.start();
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { CodeCompletionEngine, CompletionREPL };