#!/bin/bash

# Zero Code Build Script
# Creates standalone executables with embedded Node.js

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$PROJECT_DIR/src"
BIN_DIR="$PROJECT_DIR/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${YELLOW}⚡ Zero Code Builder${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"

# Detect architecture
ARCH=$(uname -m)
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

case "$ARCH" in
    x86_64) ARCH="x64" ;;
    aarch64) ARCH="arm64" ;;
    armv7l) ARCH="arm" ;;
esac

echo -e "${BLUE}Building for: ${OS}-${ARCH}${NC}"

# Node.js versions for download
NODE_VERSION="v16.20.2"  # LTS version that supports older systems

# Function to download Node.js binary
download_node() {
    local platform=$1
    local arch=$2
    local output_dir=$3

    echo -e "${YELLOW}Downloading Node.js ${NODE_VERSION} for ${platform}-${arch}...${NC}"

    local node_url="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${platform}-${arch}.tar.gz"
    local temp_file="/tmp/node-${platform}-${arch}.tar.gz"

    if [ -f "$temp_file" ]; then
        echo "Using cached Node.js binary"
    else
        curl -L "$node_url" -o "$temp_file" || wget "$node_url" -O "$temp_file"
    fi

    echo "Extracting Node.js..."
    tar -xzf "$temp_file" -C /tmp/

    local node_dir="/tmp/node-${NODE_VERSION}-${platform}-${arch}"
    if [ -f "$node_dir/bin/node" ]; then
        cp "$node_dir/bin/node" "$output_dir/node"
        chmod +x "$output_dir/node"
        echo -e "${GREEN}✓ Node.js binary ready${NC}"
    else
        echo -e "${RED}Failed to extract Node.js${NC}"
        return 1
    fi
}

# Build for current platform
build_current() {
    local target_dir="$BIN_DIR/${OS}-${ARCH}"
    mkdir -p "$target_dir"

    echo -e "${BLUE}Building Zero Code for ${OS}-${ARCH}...${NC}"

    # Copy main application
    cp "$SRC_DIR/main.js" "$target_dir/zero-code.js"

    # Create launcher script
    cat > "$target_dir/zero-code" << 'EOF'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if embedded Node.js exists
if [ -f "$SCRIPT_DIR/node" ]; then
    exec "$SCRIPT_DIR/node" "$SCRIPT_DIR/zero-code.js" "$@"
else
    # Fallback to system Node.js
    if command -v node &> /dev/null; then
        exec node "$SCRIPT_DIR/zero-code.js" "$@"
    elif command -v nodejs &> /dev/null; then
        exec nodejs "$SCRIPT_DIR/zero-code.js" "$@"
    else
        echo "Error: Node.js not found"
        echo "Please install Node.js or use the bundled version"
        exit 1
    fi
fi
EOF

    chmod +x "$target_dir/zero-code"

    # Option to bundle Node.js
    read -p "Bundle Node.js binary? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        download_node "$OS" "$ARCH" "$target_dir"
    fi

    echo -e "${GREEN}✓ Build complete: $target_dir/zero-code${NC}"
}

# Create portable package
create_portable() {
    local target_dir="$BIN_DIR/portable"
    mkdir -p "$target_dir"

    echo -e "${BLUE}Creating portable package...${NC}"

    # Copy all source files
    cp "$SRC_DIR/main.js" "$target_dir/"

    # Create universal launcher
    cat > "$target_dir/zero-code.sh" << 'EOF'
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
EOF

    chmod +x "$target_dir/zero-code.sh"

    # Create batch file for Windows
    cat > "$target_dir/zero-code.bat" << 'EOF'
@echo off
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

node "%~dp0\main.js" %*
EOF

    echo -e "${GREEN}✓ Portable package created: $target_dir/${NC}"
}

# Main menu
echo ""
echo "Select build option:"
echo "1) Build for current platform (${OS}-${ARCH})"
echo "2) Create portable package (requires Node.js)"
echo "3) Build all architectures"
echo ""
read -p "Choice: " choice

case $choice in
    1)
        build_current
        ;;
    2)
        create_portable
        ;;
    3)
        echo "Running build-all.sh..."
        exec "$SCRIPT_DIR/build-all.sh"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${GREEN}Build complete!${NC}"
echo ""
echo "To run Zero Code:"
echo "  Portable: ./bin/portable/zero-code.sh"
echo "  Native: ./bin/${OS}-${ARCH}/zero-code"
echo ""
echo "To setup AI providers:"
echo "  zero-code setup"
echo -e "${CYAN}════════════════════════════════════════${NC}"