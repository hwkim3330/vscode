#!/bin/bash

# Zero Code Portable Launcher
# Works with any Node.js installation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Try different Node.js commands
if command -v node &> /dev/null; then
    NODE_CMD="node"
elif command -v nodejs &> /dev/null; then
    NODE_CMD="nodejs"
else
    echo "Error: Node.js is not installed"
    echo "Please install Node.js 8.0+ to run Zero Code"
    echo ""
    echo "Ubuntu/Debian: sudo apt install nodejs"
    echo "CentOS/RHEL: sudo yum install nodejs"
    echo "macOS: brew install node"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$($NODE_CMD -v 2>/dev/null)
echo "Using Node.js $NODE_VERSION"

# Run Zero Code
exec $NODE_CMD "$SCRIPT_DIR/main.js" "$@"
