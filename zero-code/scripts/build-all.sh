#!/bin/bash

# Build Zero Code for all platforms
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$PROJECT_DIR/src"
BIN_DIR="$PROJECT_DIR/bin"
RELEASE_DIR="$PROJECT_DIR/releases"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${YELLOW}⚡ Zero Code Multi-Platform Builder${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"

# Node.js version to bundle
NODE_VERSION="v16.20.2"

# Platforms to build
PLATFORMS=(
    "linux-x64"
    "linux-arm64"
    "linux-arm"
    "darwin-x64"
    "darwin-arm64"
    "win32-x64"
)

# Function to download Node.js for each platform
download_node_binary() {
    local platform=$1
    local output_dir=$2

    # Convert platform names
    local node_platform=$(echo $platform | cut -d'-' -f1)
    local node_arch=$(echo $platform | cut -d'-' -f2)

    # Special cases
    if [ "$node_platform" = "darwin" ]; then
        local file_ext="tar.gz"
    elif [ "$node_platform" = "win32" ]; then
        local file_ext="zip"
        node_platform="win"
    else
        local file_ext="tar.gz"
    fi

    echo -e "${BLUE}Downloading Node.js for ${platform}...${NC}"

    local node_file="node-${NODE_VERSION}-${node_platform}-${node_arch}.${file_ext}"
    local node_url="https://nodejs.org/dist/${NODE_VERSION}/${node_file}"
    local temp_file="/tmp/${node_file}"

    # Download if not cached
    if [ ! -f "$temp_file" ]; then
        echo "Downloading from: $node_url"
        curl -L "$node_url" -o "$temp_file" 2>/dev/null || \
        wget "$node_url" -O "$temp_file" 2>/dev/null || {
            echo -e "${YELLOW}Warning: Could not download Node.js for ${platform}${NC}"
            return 1
        }
    else
        echo "Using cached Node.js"
    fi

    # Extract
    mkdir -p "/tmp/node-extract-${platform}"

    if [ "$file_ext" = "zip" ]; then
        unzip -q "$temp_file" -d "/tmp/node-extract-${platform}"
        local node_exe="/tmp/node-extract-${platform}/node-${NODE_VERSION}-${node_platform}-${node_arch}/node.exe"
        if [ -f "$node_exe" ]; then
            cp "$node_exe" "$output_dir/node.exe"
        fi
    else
        tar -xzf "$temp_file" -C "/tmp/node-extract-${platform}"
        local node_bin="/tmp/node-extract-${platform}/node-${NODE_VERSION}-${node_platform}-${node_arch}/bin/node"
        if [ -f "$node_bin" ]; then
            cp "$node_bin" "$output_dir/node"
            chmod +x "$output_dir/node"
        fi
    fi

    rm -rf "/tmp/node-extract-${platform}"
    echo -e "${GREEN}✓ Node.js ready for ${platform}${NC}"
}

# Build for each platform
for platform in "${PLATFORMS[@]}"; do
    echo ""
    echo -e "${CYAN}Building for ${platform}...${NC}"

    target_dir="$BIN_DIR/${platform}"
    mkdir -p "$target_dir"

    # Copy main application
    cp "$SRC_DIR/main.js" "$target_dir/zero-code.js"

    # Platform-specific launcher
    if [[ $platform == win* ]]; then
        # Windows batch file
        cat > "$target_dir/zero-code.bat" << 'EOF'
@echo off
setlocal
set SCRIPT_DIR=%~dp0

if exist "%SCRIPT_DIR%node.exe" (
    "%SCRIPT_DIR%node.exe" "%SCRIPT_DIR%zero-code.js" %*
) else (
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo Error: Node.js not found
        echo Please install Node.js from https://nodejs.org
        pause
        exit /b 1
    )
    node "%SCRIPT_DIR%zero-code.js" %*
)
EOF
        # Windows PowerShell script
        cat > "$target_dir/zero-code.ps1" << 'EOF'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeExe = Join-Path $scriptDir "node.exe"
$mainJs = Join-Path $scriptDir "zero-code.js"

if (Test-Path $nodeExe) {
    & $nodeExe $mainJs $args
} else {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        & node $mainJs $args
    } else {
        Write-Host "Error: Node.js not found" -ForegroundColor Red
        Write-Host "Please install Node.js from https://nodejs.org"
        exit 1
    }
}
EOF
    else
        # Unix-like launcher
        cat > "$target_dir/zero-code" << 'EOF'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Use bundled Node.js if available
if [ -f "$SCRIPT_DIR/node" ]; then
    exec "$SCRIPT_DIR/node" "$SCRIPT_DIR/zero-code.js" "$@"
else
    # Fallback to system Node.js
    for cmd in node nodejs; do
        if command -v $cmd &> /dev/null; then
            exec $cmd "$SCRIPT_DIR/zero-code.js" "$@"
        fi
    done
    echo "Error: Node.js not found"
    exit 1
fi
EOF
        chmod +x "$target_dir/zero-code"
    fi

    # Try to download Node.js binary for this platform
    download_node_binary "$platform" "$target_dir" || true

    echo -e "${GREEN}✓ Built ${platform}${NC}"
done

# Create release packages
echo ""
echo -e "${CYAN}Creating release packages...${NC}"

mkdir -p "$RELEASE_DIR"
VERSION=$(grep '"version"' "$PROJECT_DIR/package.json" | cut -d'"' -f4)

for platform in "${PLATFORMS[@]}"; do
    if [ -d "$BIN_DIR/$platform" ]; then
        archive_name="zero-code-${VERSION}-${platform}"

        if [[ $platform == win* ]]; then
            # Create ZIP for Windows
            (cd "$BIN_DIR" && zip -q -r "$RELEASE_DIR/${archive_name}.zip" "${platform}/")
            echo -e "${GREEN}✓ Created ${archive_name}.zip${NC}"
        else
            # Create tar.gz for Unix-like
            (cd "$BIN_DIR" && tar -czf "$RELEASE_DIR/${archive_name}.tar.gz" "${platform}/")
            echo -e "${GREEN}✓ Created ${archive_name}.tar.gz${NC}"
        fi
    fi
done

# Create portable package
echo -e "${CYAN}Creating portable package...${NC}"

portable_dir="$BIN_DIR/portable"
mkdir -p "$portable_dir"

cp "$SRC_DIR/main.js" "$portable_dir/"
cp "$PROJECT_DIR/package.json" "$portable_dir/"

# Universal launcher script
cat > "$portable_dir/run.sh" << 'EOF'
#!/bin/bash
for cmd in node nodejs; do
    if command -v $cmd &> /dev/null; then
        exec $cmd "$(dirname "$0")/main.js" "$@"
    fi
done
echo "Node.js not found. Please install Node.js 8.0+"
exit 1
EOF
chmod +x "$portable_dir/run.sh"

# Create portable archive
(cd "$BIN_DIR" && tar -czf "$RELEASE_DIR/zero-code-${VERSION}-portable.tar.gz" "portable/")
echo -e "${GREEN}✓ Created portable package${NC}"

echo ""
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Build complete!${NC}"
echo ""
echo "Binaries created in: $BIN_DIR/"
echo "Releases created in: $RELEASE_DIR/"
echo ""
echo "Platform packages:"
ls -lh "$RELEASE_DIR"/*.{tar.gz,zip} 2>/dev/null || true
echo -e "${CYAN}════════════════════════════════════════${NC}"