#!/bin/bash

# Zero Code Portable Launcher
# Works on any Linux system with Node.js (even very old versions)

# Colors
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}⚡ Zero Code - Portable AI Code Editor${NC}"
echo "========================================"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js not found!${NC}"
    echo "Trying nodejs command..."

    if command -v nodejs &> /dev/null; then
        # Ubuntu 18.04 compatibility
        alias node=nodejs
    else
        echo -e "${RED}Please install Node.js first:${NC}"
        echo "  Ubuntu/Debian: sudo apt install nodejs"
        echo "  CentOS/RHEL: sudo yum install nodejs"
        exit 1
    fi
fi

# Get Node.js version
NODE_VERSION=$(node -v 2>/dev/null || nodejs -v 2>/dev/null)
echo -e "${GREEN}✓ Node.js ${NODE_VERSION} detected${NC}"

# Set environment variables
export ZERO_PORT=${ZERO_PORT:-3456}
export ZERO_HOST=${ZERO_HOST:-127.0.0.1}

# Launch Zero Code
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_FILE="$SCRIPT_DIR/zero-code.js"

if [ ! -f "$APP_FILE" ]; then
    echo -e "${RED}Error: zero-code.js not found in $SCRIPT_DIR${NC}"
    exit 1
fi

echo -e "${BLUE}Starting Zero Code on http://$ZERO_HOST:$ZERO_PORT${NC}"
echo ""

# Run with nodejs or node command
if command -v node &> /dev/null; then
    exec node "$APP_FILE" "$@"
else
    exec nodejs "$APP_FILE" "$@"
fi