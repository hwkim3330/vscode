# KETI Code - Zero Dependency AI Code Editor

A lightweight, standalone AI-powered code editor that works on **Ubuntu 18.04+** without ANY dependencies!

## 🚀 Features

- **Zero Dependencies**: No npm, no packages, nothing required
- **AI Integration**: Built-in support for Claude, OpenAI, Codex
- **Full Terminal**: Integrated terminal with sudo support
- **Multi-Architecture**: Works on x86_64, ARM64, ARMv7
- **Ubuntu 18.04+**: Compatible with older Linux systems
- **Standalone Binary**: Single file executable

## 📦 Download

Download the pre-built binary for your architecture:

- [Linux x64](https://github.com/hwkim3330/keti-code/releases/download/v1.0/keti-code-linux-x64)
- [Linux ARM64](https://github.com/hwkim3330/keti-code/releases/download/v1.0/keti-code-linux-arm64)
- [Linux ARMv7](https://github.com/hwkim3330/keti-code/releases/download/v1.0/keti-code-linux-armv7)

## 🔧 Installation

```bash
# Download for your architecture
curl -L https://github.com/hwkim3330/keti-code/releases/download/v1.0/keti-code-linux-x64 -o keti-code
chmod +x keti-code

# Run
./keti-code
```

## 🏗️ Build from Source

```bash
git clone https://github.com/hwkim3330/keti-code.git
cd keti-code

# Build portable version (recommended)
./build-static.sh

# Run
./dist/linux-x86_64/keti-code-portable
```

## 🎯 Usage

### Basic Usage

```bash
# Start the editor
./keti-code

# With custom port
KETI_PORT=8080 ./keti-code

# With AI API key
KETI_API_KEY="your-api-key" ./keti-code
```

### AI Configuration

```bash
# Claude (Anthropic)
export KETI_AI_PROVIDER=claude
export KETI_API_KEY="sk-ant-..."

# OpenAI
export KETI_AI_PROVIDER=openai
export KETI_API_KEY="sk-..."
```

## 🏛️ Architecture

```
keti-code
├── Zero npm dependencies
├── Pure Node.js built-in modules
├── Embedded portable Node.js runtime
└── Works without root privileges
```

## 🔥 Key Features

### 1. Terminal Integration
- Full terminal access in browser
- Execute any command
- Sudo support
- Real-time output

### 2. AI Assistant
- Code completion
- Code explanation
- Bug fixing
- Refactoring suggestions

### 3. File Management
- Browse files
- Edit multiple files
- Syntax highlighting
- Auto-save

## 📋 System Requirements

- **OS**: Ubuntu 18.04+ / Debian 10+ / CentOS 7+
- **Architecture**: x86_64, ARM64, ARMv7
- **RAM**: 512MB minimum
- **Disk**: 50MB for application

## 🤝 Comparison

| Feature | KETI Code | VSCode | Cursor | Claude Code |
|---------|-----------|---------|---------|------------|
| Zero Dependencies | ✅ | ❌ | ❌ | ❌ |
| Ubuntu 18.04 Support | ✅ | ❌ | ❌ | ❌ |
| Standalone Binary | ✅ | ❌ | ❌ | ❌ |
| Terminal Integration | ✅ | ✅ | ✅ | ✅ |
| AI Integration | ✅ | ❌ | ✅ | ✅ |
| File Size | 36KB | 350MB | 400MB | 300MB |

## 🛠️ Development

```bash
# Run in development mode
node keti-code.js

# Build all architectures
./build-static.sh --all

# Create portable version only
./build-static.sh --portable
```

## 📄 License

MIT License - Free for personal and commercial use

## 🙏 Credits

Inspired by:
- Microsoft VSCode
- Cursor Editor
- Anthropic Claude Code
- OpenAI Codex

---

**Made with ❤️ for developers who need a lightweight AI code editor**