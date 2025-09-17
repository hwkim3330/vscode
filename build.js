#!/usr/bin/env node

/**
 * KETI Code - Multi-Architecture Build System
 * Creates standalone executables for all platforms
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Build configurations for different architectures
const TARGETS = [
    { platform: 'linux', arch: 'x64', node: 'node16-linux-x64', output: 'keti-code-linux-x64' },
    { platform: 'linux', arch: 'arm64', node: 'node16-linux-arm64', output: 'keti-code-linux-arm64' },
    { platform: 'linux', arch: 'armv7', node: 'node16-linux-armv7', output: 'keti-code-linux-armv7' },
    { platform: 'darwin', arch: 'x64', node: 'node16-macos-x64', output: 'keti-code-macos-x64' },
    { platform: 'darwin', arch: 'arm64', node: 'node16-macos-arm64', output: 'keti-code-macos-arm64' },
    { platform: 'win', arch: 'x64', node: 'node16-win-x64', output: 'keti-code-win-x64.exe' }
];

// Since we can't use pkg or nexe (npm dependencies),
// we'll create a self-extracting archive approach
function buildSelfExtractor(target) {
    console.log(`Building for ${target.platform}-${target.arch}...`);

    const outputDir = path.join(__dirname, 'dist', `${target.platform}-${target.arch}`);

    // Create output directory
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create launcher script
    const launcherContent = generateLauncher(target);
    const launcherPath = path.join(outputDir, target.output);

    fs.writeFileSync(launcherPath, launcherContent);
    fs.chmodSync(launcherPath, 0o755);

    console.log(`✅ Built: ${launcherPath}`);
}

function generateLauncher(target) {
    if (target.platform === 'win') {
        return generateWindowsLauncher();
    } else {
        return generateUnixLauncher(target);
    }
}

function generateUnixLauncher(target) {
    // Create a shell script that embeds the entire app
    const appCode = fs.readFileSync(path.join(__dirname, 'keti-code.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    const styleCss = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

    // Encode files as base64
    const files = {
        'keti-code.js': Buffer.from(appCode).toString('base64'),
        'index.html': Buffer.from(indexHtml).toString('base64'),
        'app.js': Buffer.from(appJs).toString('base64'),
        'style.css': Buffer.from(styleCss).toString('base64')
    };

    return `#!/bin/sh
# KETI Code - Standalone Executable
# Platform: ${target.platform}-${target.arch}

# Check if Node.js is available
if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js is required but not installed."
    echo "Installing Node.js..."

    # Try to install Node.js
    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [ -f /etc/redhat-release ]; then
        # RHEL/CentOS
        curl -fsSL https://rpm.nodesource.com/setup_16.x | sudo bash -
        sudo yum install -y nodejs
    elif [ "\$(uname)" = "Darwin" ]; then
        # macOS
        if command -v brew >/dev/null 2>&1; then
            brew install node
        else
            echo "Please install Homebrew first: https://brew.sh"
            exit 1
        fi
    else
        echo "Please install Node.js manually: https://nodejs.org"
        exit 1
    fi
fi

# Create temporary directory
TMPDIR=\$(mktemp -d -t keti-code-XXXXXX)
trap "rm -rf \$TMPDIR" EXIT

# Extract embedded files
cat << 'ENDOFAPP' | base64 -d > "\$TMPDIR/keti-code.js"
${files['keti-code.js']}
ENDOFAPP

cat << 'ENDOFHTML' | base64 -d > "\$TMPDIR/index.html"
${files['index.html']}
ENDOFHTML

cat << 'ENDOFJS' | base64 -d > "\$TMPDIR/app.js"
${files['app.js']}
ENDOFJS

cat << 'ENDOFCSS' | base64 -d > "\$TMPDIR/style.css"
${files['style.css']}
ENDOFCSS

# Run the application
cd "\$TMPDIR"
exec node keti-code.js "\$@"
`;
}

function generateWindowsLauncher() {
    // Windows batch file with embedded Node.js app
    const appCode = fs.readFileSync(path.join(__dirname, 'keti-code.js'), 'utf8');

    return `@echo off
:: KETI Code - Windows Launcher

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is not installed. Please install from https://nodejs.org
    pause
    exit /b 1
)

:: Create temp directory
set TMPDIR=%TEMP%\\keti-code-%RANDOM%
mkdir "%TMPDIR%"

:: Write application files
echo Creating application files...

:: Write main app (using PowerShell to handle multiline)
powershell -Command "Set-Content -Path '%TMPDIR%\\keti-code.js' -Value @'
${appCode.replace(/'/g, "''")}
'@"

:: Run the application
cd /d "%TMPDIR%"
node keti-code.js %*

:: Cleanup
cd /d "%TEMP%"
rmdir /s /q "%TMPDIR%" 2>nul
`;
}

// Create single-file portable version
function createPortableVersion() {
    console.log('\n📦 Creating portable single-file version...');

    const portableScript = `#!/usr/bin/env node
/**
 * KETI Code - Portable Single File Version
 * This file contains the entire application
 */

${fs.readFileSync(path.join(__dirname, 'keti-code.js'), 'utf8')}

// Embedded HTML/CSS/JS files
const EMBEDDED_FILES = {
    '/index.html': \`${fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').replace(/`/g, '\\`')}\`,
    '/app.js': \`${fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8').replace(/`/g, '\\`')}\`,
    '/style.css': \`${fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8').replace(/`/g, '\\`')}\`
};

// Override file serving to use embedded files
const originalServeStatic = serveStatic;
serveStatic = function(filePath, res) {
    const fileName = path.basename(filePath);
    const embeddedFile = EMBEDDED_FILES['/' + fileName];

    if (embeddedFile) {
        const ext = path.extname(fileName);
        const contentTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css'
        };

        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
        res.end(embeddedFile);
    } else {
        originalServeStatic(filePath, res);
    }
};
`;

    const portablePath = path.join(__dirname, 'dist', 'keti-code-portable.js');
    fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
    fs.writeFileSync(portablePath, portableScript);
    fs.chmodSync(portablePath, 0o755);

    console.log(`✅ Created portable version: ${portablePath}`);
}

// Build for current platform only (for testing)
function buildCurrent() {
    const platform = process.platform === 'win32' ? 'win' : process.platform;
    const arch = process.arch;

    const target = TARGETS.find(t =>
        t.platform === platform &&
        (t.arch === arch || (arch === 'x64' && t.arch === 'x64'))
    );

    if (target) {
        buildSelfExtractor(target);
    } else {
        console.log(`No build target for ${platform}-${arch}`);
    }
}

// Build all targets
function buildAll() {
    console.log('🔨 Building for all architectures...\n');

    TARGETS.forEach(target => {
        try {
            buildSelfExtractor(target);
        } catch (err) {
            console.error(`Failed to build ${target.platform}-${target.arch}:`, err.message);
        }
    });

    createPortableVersion();
}

// Main build process
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.includes('--all')) {
        buildAll();
    } else if (args.includes('--portable')) {
        createPortableVersion();
    } else {
        buildCurrent();
    }

    console.log('\n✨ Build complete!');
}

module.exports = { buildAll, buildCurrent, createPortableVersion };