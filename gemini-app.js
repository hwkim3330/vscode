#!/usr/bin/env node

/**
 * Gemini AI Application
 * Google Gemini API integration for code assistance
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { authenticate, loadAuth, testGeminiAPI } = require('./google-gemini-auth');

/**
 * Gemini API configuration
 */
const GEMINI_CONFIG = {
    baseUrl: 'generativelanguage.googleapis.com',
    models: {
        'gemini-pro': 'models/gemini-pro',
        'gemini-pro-vision': 'models/gemini-pro-vision',
        'gemini-1.5-pro': 'models/gemini-1.5-pro-latest',
        'gemini-1.5-flash': 'models/gemini-1.5-flash-latest'
    },
    defaultModel: 'gemini-1.5-flash',
    maxTokens: 8192,
    temperature: 0.7
};

/**
 * Color codes for terminal output
 */
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

/**
 * Make API request to Gemini
 */
async function callGeminiAPI(prompt, options = {}) {
    const auth = loadAuth();
    if (!auth) {
        throw new Error('Not authenticated. Run: node google-gemini-auth.js login');
    }

    const model = options.model || GEMINI_CONFIG.defaultModel;
    const modelPath = GEMINI_CONFIG.models[model] || model;

    // Prepare request body
    const requestBody = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }],
        generationConfig: {
            temperature: options.temperature || GEMINI_CONFIG.temperature,
            maxOutputTokens: options.maxTokens || GEMINI_CONFIG.maxTokens,
            topP: options.topP || 0.95,
            topK: options.topK || 40
        }
    };

    // Add system instruction if provided
    if (options.systemInstruction) {
        requestBody.systemInstruction = {
            parts: [{
                text: options.systemInstruction
            }]
        };
    }

    return new Promise((resolve, reject) => {
        let apiPath;
        let headers = {
            'Content-Type': 'application/json'
        };

        if (auth.type === 'api_key') {
            apiPath = `/v1beta/${modelPath}:generateContent?key=${auth.apiKey}`;
        } else {
            apiPath = `/v1beta/${modelPath}:generateContent`;
            headers['Authorization'] = `Bearer ${auth.access_token}`;
        }

        const requestOptions = {
            hostname: GEMINI_CONFIG.baseUrl,
            path: apiPath,
            method: 'POST',
            headers: headers
        };

        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (res.statusCode === 200) {
                        resolve(response);
                    } else {
                        reject(new Error(response.error?.message || 'API request failed'));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify(requestBody));
        req.end();
    });
}

/**
 * Stream API response (for real-time output)
 */
async function streamGeminiAPI(prompt, options = {}, onChunk) {
    const auth = loadAuth();
    if (!auth) {
        throw new Error('Not authenticated. Run: node google-gemini-auth.js login');
    }

    const model = options.model || GEMINI_CONFIG.defaultModel;
    const modelPath = GEMINI_CONFIG.models[model] || model;

    const requestBody = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }],
        generationConfig: {
            temperature: options.temperature || GEMINI_CONFIG.temperature,
            maxOutputTokens: options.maxTokens || GEMINI_CONFIG.maxTokens
        }
    };

    return new Promise((resolve, reject) => {
        let apiPath;
        let headers = {
            'Content-Type': 'application/json'
        };

        if (auth.type === 'api_key') {
            apiPath = `/v1beta/${modelPath}:streamGenerateContent?key=${auth.apiKey}&alt=sse`;
        } else {
            apiPath = `/v1beta/${modelPath}:streamGenerateContent?alt=sse`;
            headers['Authorization'] = `Bearer ${auth.access_token}`;
        }

        const requestOptions = {
            hostname: GEMINI_CONFIG.baseUrl,
            path: apiPath,
            method: 'POST',
            headers: headers
        };

        const req = https.request(requestOptions, (res) => {
            let buffer = '';

            res.on('data', chunk => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                lines.forEach(line => {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                                onChunk(data.candidates[0].content.parts[0].text);
                            }
                        } catch (error) {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                });
            });

            res.on('end', () => {
                resolve();
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify(requestBody));
        req.end();
    });
}

/**
 * Code completion function
 */
async function completeCode(code, language = 'javascript') {
    const systemInstruction = `You are an expert ${language} developer.
    Provide code completions, suggestions, and improvements.
    Focus on clean, efficient, and maintainable code.`;

    const prompt = `Complete or improve the following ${language} code:\n\n${code}`;

    try {
        const response = await callGeminiAPI(prompt, {
            systemInstruction,
            temperature: 0.3,
            model: 'gemini-1.5-flash'
        });

        if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
            return response.candidates[0].content.parts[0].text;
        }
        throw new Error('No response from API');
    } catch (error) {
        throw error;
    }
}

/**
 * Code review function
 */
async function reviewCode(code, language = 'javascript') {
    const prompt = `Review the following ${language} code for:
    1. Potential bugs and issues
    2. Performance improvements
    3. Security concerns
    4. Best practices
    5. Code quality and maintainability

Code to review:
\`\`\`${language}
${code}
\`\`\`

Provide specific feedback and suggestions.`;

    try {
        const response = await callGeminiAPI(prompt, {
            temperature: 0.5,
            model: 'gemini-1.5-pro'
        });

        if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
            return response.candidates[0].content.parts[0].text;
        }
        throw new Error('No response from API');
    } catch (error) {
        throw error;
    }
}

/**
 * Interactive chat mode
 */
async function interactiveChat() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log(`${COLORS.bright}${COLORS.cyan}🤖 Gemini AI Assistant${COLORS.reset}`);
    console.log(`${COLORS.dim}Type 'exit' to quit, 'help' for commands${COLORS.reset}\n`);

    const askQuestion = () => {
        rl.question(`${COLORS.green}You: ${COLORS.reset}`, async (input) => {
            if (input.toLowerCase() === 'exit') {
                console.log(`${COLORS.yellow}Goodbye!${COLORS.reset}`);
                rl.close();
                return;
            }

            if (input.toLowerCase() === 'help') {
                console.log(`${COLORS.cyan}Commands:${COLORS.reset}`);
                console.log('  /model <name>  - Switch model (gemini-pro, gemini-1.5-pro, gemini-1.5-flash)');
                console.log('  /code         - Enter code completion mode');
                console.log('  /review       - Enter code review mode');
                console.log('  /clear        - Clear conversation');
                console.log('  exit          - Quit the application\n');
                askQuestion();
                return;
            }

            if (input.startsWith('/model ')) {
                const model = input.slice(7).trim();
                if (GEMINI_CONFIG.models[model]) {
                    GEMINI_CONFIG.defaultModel = model;
                    console.log(`${COLORS.yellow}Switched to model: ${model}${COLORS.reset}\n`);
                } else {
                    console.log(`${COLORS.red}Unknown model: ${model}${COLORS.reset}\n`);
                }
                askQuestion();
                return;
            }

            try {
                console.log(`${COLORS.blue}Gemini: ${COLORS.reset}`);

                await streamGeminiAPI(input, {}, (chunk) => {
                    process.stdout.write(chunk);
                });

                console.log('\n');
            } catch (error) {
                console.error(`${COLORS.red}Error: ${error.message}${COLORS.reset}\n`);
            }

            askQuestion();
        });
    };

    askQuestion();
}

/**
 * Main CLI
 */
async function main() {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    // Check authentication first
    const auth = loadAuth();
    if (!auth && command !== 'help') {
        console.error(`${COLORS.red}Not authenticated. Run: node google-gemini-auth.js login${COLORS.reset}`);
        process.exit(1);
    }

    switch (command) {
        case 'chat':
            await interactiveChat();
            break;

        case 'complete':
            if (args.length === 0) {
                console.error(`${COLORS.red}Usage: node gemini-app.js complete <file>${COLORS.reset}`);
                process.exit(1);
            }
            try {
                const code = fs.readFileSync(args[0], 'utf8');
                const ext = path.extname(args[0]).slice(1);
                const result = await completeCode(code, ext);
                console.log(result);
            } catch (error) {
                console.error(`${COLORS.red}Error: ${error.message}${COLORS.reset}`);
                process.exit(1);
            }
            break;

        case 'review':
            if (args.length === 0) {
                console.error(`${COLORS.red}Usage: node gemini-app.js review <file>${COLORS.reset}`);
                process.exit(1);
            }
            try {
                const code = fs.readFileSync(args[0], 'utf8');
                const ext = path.extname(args[0]).slice(1);
                const result = await reviewCode(code, ext);
                console.log(result);
            } catch (error) {
                console.error(`${COLORS.red}Error: ${error.message}${COLORS.reset}`);
                process.exit(1);
            }
            break;

        case 'ask':
            if (args.length === 0) {
                console.error(`${COLORS.red}Usage: node gemini-app.js ask "your question"${COLORS.reset}`);
                process.exit(1);
            }
            try {
                const response = await callGeminiAPI(args.join(' '));
                if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
                    console.log(response.candidates[0].content.parts[0].text);
                }
            } catch (error) {
                console.error(`${COLORS.red}Error: ${error.message}${COLORS.reset}`);
                process.exit(1);
            }
            break;

        case 'models':
            console.log(`${COLORS.cyan}Available models:${COLORS.reset}`);
            Object.keys(GEMINI_CONFIG.models).forEach(model => {
                const marker = model === GEMINI_CONFIG.defaultModel ? ' (default)' : '';
                console.log(`  - ${model}${marker}`);
            });
            break;

        case 'help':
        default:
            console.log(`${COLORS.bright}Gemini AI Application${COLORS.reset}\n`);
            console.log('Usage:');
            console.log('  node gemini-app.js chat              - Interactive chat mode');
            console.log('  node gemini-app.js complete <file>   - Complete/improve code');
            console.log('  node gemini-app.js review <file>     - Review code');
            console.log('  node gemini-app.js ask "question"    - Ask a single question');
            console.log('  node gemini-app.js models            - List available models');
            console.log('  node gemini-app.js help              - Show this help');
            console.log('\nAuthentication:');
            console.log('  node google-gemini-auth.js setup     - Setup instructions');
            console.log('  node google-gemini-auth.js login     - Authenticate');
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
    callGeminiAPI,
    streamGeminiAPI,
    completeCode,
    reviewCode
};