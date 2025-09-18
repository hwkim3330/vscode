#!/usr/bin/env node

/**
 * Test Gemini API functionality
 */

const { callGeminiAPI, completeCode, reviewCode } = require('./gemini-app');
const { loadAuth, testGeminiAPI } = require('./google-gemini-auth');

const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m'
};

async function testAuth() {
    console.log(`${COLORS.cyan}Testing authentication...${COLORS.reset}`);

    const auth = loadAuth();
    if (!auth) {
        console.log(`${COLORS.red}✗ Not authenticated${COLORS.reset}`);
        console.log(`${COLORS.yellow}Run: npm run login${COLORS.reset}`);
        return false;
    }

    if (auth.type === 'api_key') {
        try {
            const models = await testGeminiAPI(auth.apiKey);
            console.log(`${COLORS.green}✓ API Key authentication working${COLORS.reset}`);
            console.log(`${COLORS.cyan}Available models:${COLORS.reset}`);
            models.models?.forEach(model => {
                console.log(`  - ${model.name}`);
            });
            return true;
        } catch (error) {
            console.log(`${COLORS.red}✗ API Key authentication failed: ${error.message}${COLORS.reset}`);
            return false;
        }
    }

    console.log(`${COLORS.green}✓ OAuth2 authentication configured${COLORS.reset}`);
    return true;
}

async function testSimplePrompt() {
    console.log(`\n${COLORS.cyan}Testing simple prompt...${COLORS.reset}`);

    try {
        const response = await callGeminiAPI('Write a simple hello world function in JavaScript');
        if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
            console.log(`${COLORS.green}✓ Simple prompt test passed${COLORS.reset}`);
            console.log(`${COLORS.cyan}Response preview:${COLORS.reset}`);
            const preview = response.candidates[0].content.parts[0].text.substring(0, 200);
            console.log(preview + '...\n');
            return true;
        }
    } catch (error) {
        console.log(`${COLORS.red}✗ Simple prompt test failed: ${error.message}${COLORS.reset}`);
        return false;
    }
}

async function testCodeCompletion() {
    console.log(`${COLORS.cyan}Testing code completion...${COLORS.reset}`);

    const testCode = `
function fibonacci(n) {
    // TODO: implement fibonacci sequence
}`;

    try {
        const result = await completeCode(testCode);
        console.log(`${COLORS.green}✓ Code completion test passed${COLORS.reset}`);
        console.log(`${COLORS.cyan}Completion preview:${COLORS.reset}`);
        const preview = result.substring(0, 200);
        console.log(preview + '...\n');
        return true;
    } catch (error) {
        console.log(`${COLORS.red}✗ Code completion test failed: ${error.message}${COLORS.reset}`);
        return false;
    }
}

async function testCodeReview() {
    console.log(`${COLORS.cyan}Testing code review...${COLORS.reset}`);

    const testCode = `
function addNumbers(a, b) {
    return a + b;
}

const result = addNumbers("5", 10);
console.log(result);`;

    try {
        const result = await reviewCode(testCode);
        console.log(`${COLORS.green}✓ Code review test passed${COLORS.reset}`);
        console.log(`${COLORS.cyan}Review preview:${COLORS.reset}`);
        const preview = result.substring(0, 200);
        console.log(preview + '...\n');
        return true;
    } catch (error) {
        console.log(`${COLORS.red}✗ Code review test failed: ${error.message}${COLORS.reset}`);
        return false;
    }
}

async function runAllTests() {
    console.log(`${COLORS.cyan}=== Gemini API Test Suite ===${COLORS.reset}\n`);

    const tests = [
        { name: 'Authentication', fn: testAuth },
        { name: 'Simple Prompt', fn: testSimplePrompt },
        { name: 'Code Completion', fn: testCodeCompletion },
        { name: 'Code Review', fn: testCodeReview }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        const authPassed = await testAuth();
        if (!authPassed && test.name !== 'Authentication') {
            console.log(`${COLORS.yellow}Skipping ${test.name} - authentication required${COLORS.reset}`);
            continue;
        }

        if (test.name !== 'Authentication') {
            const result = await test.fn();
            if (result) passed++;
            else failed++;
        } else {
            if (authPassed) passed++;
            else failed++;
        }
    }

    console.log(`${COLORS.cyan}=== Test Results ===${COLORS.reset}`);
    console.log(`${COLORS.green}Passed: ${passed}${COLORS.reset}`);
    console.log(`${COLORS.red}Failed: ${failed}${COLORS.reset}`);

    if (failed === 0 && passed > 0) {
        console.log(`\n${COLORS.green}✓ All tests passed!${COLORS.reset}`);
    } else if (passed === 0) {
        console.log(`\n${COLORS.red}✗ No tests passed. Please check your authentication.${COLORS.reset}`);
        console.log(`${COLORS.yellow}Setup instructions: npm run setup${COLORS.reset}`);
    }
}

// Run tests
if (require.main === module) {
    runAllTests().catch(error => {
        console.error(`${COLORS.red}Test suite error: ${error.message}${COLORS.reset}`);
        process.exit(1);
    });
}