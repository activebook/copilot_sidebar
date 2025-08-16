#!/bin/bash

# Continuous Delivery/Deployment Script for Chrome Extension
# This script builds and releases a CRX file to GitHub

# If anything fails, exit
# Remember that subshell commands will fail and also exit the script
set -euo pipefail

# Configuration
EXTENSION_NAME="copilot_sidebar"
GITHUB_REPO="${GITHUB_REPO:-$(git config --get remote.origin.url | sed -E 's/.*github\.com[:/]([^/]+\/[^/]+)(\.git)?$/\1/' | sed 's/\.git$//')}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" >&2
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" >&2
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" >&2
    exit 1
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if we're in a git repository
    if ! git rev-parse --is-inside-work-tree &>/dev/null; then
        error "Not in a git repository"
    fi
    
    # Check for required tools
    local required_tools=("git" "zip" "curl" "jq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &>/dev/null; then
            error "Required tool not found: $tool"
        fi
    done
    
    # Check for GitHub CLI or GitHub token
    if ! command -v gh &>/dev/null && [[ -z "${GITHUB_TOKEN:-}" ]]; then
        error "GitHub CLI (gh) or GITHUB_TOKEN environment variable required"
    fi
    
    # Validate token format (supports both classic and fine-grained tokens)
    if [[ -n "${GITHUB_TOKEN:-}" ]] && [[ ! "$GITHUB_TOKEN" =~ ^(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]+)$ ]]; then
        error "Invalid GitHub token format. Token should be either: classic (ghp/gho/ghu/ghs/ghr_...) or fine-grained (github_pat_...)"
    fi
    
    log "Prerequisites check passed"
}

# Get version from manifest.json
get_version() {
    local manifest_path="$PROJECT_ROOT/manifest.json"
    if [[ ! -f "$manifest_path" ]]; then
        error "manifest.json not found at $manifest_path"
    fi
    
    jq -r '.version' "$manifest_path"
}

# Build the extension
build_extension() {
    local version="$1"
    local output_file="$2" 
    local build_dir="$BUILD_ROOT"
    local zip_file="$build_dir/${EXTENSION_NAME}-${version}.zip"
    local crx_file="$build_dir/${EXTENSION_NAME}-${version}.crx"
    
    log "Building extension version $version..."
    
    # Create build directory
    mkdir -p "$build_dir"
    
    # Clean previous builds
    rm -f "$build_dir"/*.{zip,crx}
    
    # Create zip file
    log "Creating zip archive..."
    (cd "$PROJECT_ROOT" && zip -r "$zip_file" .         -x ".git/*" ".gitignore" ".qodo/*" "cd/*" "build/*" "*.md" ".github/*" "howto/*") >/dev/null
    
    # Verify zip file was created
    if [[ ! -f "$zip_file" ]]; then
        error "Failed to create zip file: $zip_file"
    fi
    
    log "Zip file created successfully: $zip_file"

    # Check if we have a private key for CRX signing
    local private_key="$BUILD_ROOT/private.pem"
    if [[ -f "$private_key" ]]; then
        log "Signing CRX with private key..."
        
        # Find Chrome/Chromium binary
        local chrome_bin=""
        if command -v google-chrome &>/dev/null; then
            chrome_bin="google-chrome"
        elif command -v chromium &>/dev/null; then
            chrome_bin="chromium"
        elif command -v chrome &>/dev/null; then
            chrome_bin="chrome"
        elif [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
            chrome_bin="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        elif [[ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]]; then
            chrome_bin="/Applications/Chromium.app/Contents/MacOS/Chromium"
        else
            warn "Chrome/Chromium not found, skipping CRX creation"
            crx_file=""
        fi

        log "Chrome is at: $chrome_bin"
        
        if [[ -n "$chrome_bin" ]]; then
            # Create a temporary directory for the extension files
            local temp_ext_dir="$build_dir/temp_extension"
            mkdir -p "$temp_ext_dir"
            
            # Copy all extension files to the temporary directory
            (cd "$PROJECT_ROOT" && tar cf - . \
                --exclude=".git" \
                --exclude=".gitignore" \
                --exclude=".qodo" \
                --exclude="cd" \
                --exclude="build" \
                --exclude="*.md" \
                --exclude=".github" \
                --exclude="howto" \
                | (cd "$temp_ext_dir" && tar xf -)) >/dev/null 2>&1
            
            # Use Chrome to pack the extension
            "$chrome_bin" \
                --pack-extension="$temp_ext_dir" \
                --pack-extension-key="$private_key" \
                --no-message-box 2>/dev/null || true
            
            # Move the generated CRX file to our desired location
            local generated_crx="$temp_ext_dir.crx"
            if [[ -f "$generated_crx" ]]; then
                mv "$generated_crx" "$crx_file"
                log "CRX file created: $crx_file"
            else
                warn "Failed to create CRX file using Chrome"
                crx_file=""
            fi
            
            # Clean up temporary directory
            rm -rf "$temp_ext_dir"
        fi
    else
        warn "No private key found at $private_key - CRX file will not be signed"
        crx_file=""
    fi
    
    # Return both file paths (without any logging interference)
    echo "$zip_file" > "$output_file"
    echo "$crx_file" >> "$output_file"
}

# Create GitHub release
create_release() {
    local version="$1"
    local zip_file="$2"
    local crx_file="$3"
    
    log "Creating GitHub release for version $version..."
    
    # Get commit messages since last tag
    local last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
    local changelog=""
    
    if [[ -n "$last_tag" ]]; then
        changelog=$(git log --pretty=format:"- %s" "$last_tag"..HEAD)
    else
        changelog=$(git log --pretty=format:"- %s" --max-count=10)
    fi
    
    # Create release notes
    local release_notes="## Release $version

### Changes
$changelog

### Installation
1. Download the appropriate file below
2. For Chrome: Use the .crx file (if signed) or load unpacked extension from .zip
3. For manual installation: Extract the .zip file and load as unpacked extension
"
    
    # Create release using GitHub CLI or API
    if command -v gh &>/dev/null; then
        log "Using GitHub CLI to create release..."
        
        local release_args=(
            "create" "v$version"
            "--title" "Release v$version"
            "--notes" "$release_notes"
        )
        
        # Add CRX file if it exists
        if [[ -n "$crx_file" && -f "$crx_file" ]]; then
            release_args+=("$crx_file")
            log "Adding CRX file to release: $crx_file"
        else
            log "No CRX file to add to release"
        fi
        
        # Always add zip file
        if [[ -n "$zip_file" && -f "$zip_file" ]]; then
            release_args+=("$zip_file")
            log "Adding ZIP file to release: $zip_file"
        else
            log "Warning: ZIP file not found at $zip_file"
        fi
        
        gh release "${release_args[@]}"
    else
        log "Using GitHub API to create release..."
        
        local api_url="https://api.github.com/repos/$GITHUB_REPO/releases"
        log "API URL: $api_url"
        local release_data=$(jq -n \
            --arg tag_name "v$version" \
            --arg name "Release v$version" \
            --arg body "$release_notes" \
            '{tag_name: $tag_name, name: $name, body: $body, draft: false, prerelease: false}')
        
        local release_response=$(curl -s -X POST \
            --location \
            --proto '=https' \
            -H "Authorization: token $GITHUB_TOKEN" \
            -H "Content-Type: application/json" \
            -H "Accept: application/vnd.github.v3+json" \
            -d "$release_data" \
            "$api_url")
        
        # Check if release was created successfully
        local release_id=$(echo "$release_response" | jq -r '.id')
        if [[ "$release_id" == "null" ]] || [[ "$release_id" == "" ]]; then
            error "Failed to create release: $(echo "$release_response" | jq -r '.message // "Unknown error"')"
        fi
        
        local upload_url=$(echo "$release_response" | jq -r '.upload_url' | sed 's/{.*}//')
        
        # Upload assets
        # Process files in order: CRX first, then ZIP
        local files_to_upload=("$crx_file" "$zip_file")
        for file in "${files_to_upload[@]}"; do
            if [[ -n "$file" && -f "$file" ]]; then
                local filename=$(basename "$file")
                log "Uploading asset: $filename"
                curl -s -X POST \
                    --location \
                    --proto '=https' \
                    -H "Authorization: token $GITHUB_TOKEN" \
                    -H "Content-Type: application/octet-stream" \
                    -H "Accept: application/vnd.github.v3+json" \
                    --data-binary "@$file" \
                    "$upload_url?name=$filename"
            elif [[ -n "$file" ]]; then
                log "File specified but not found: $file"
            fi
        done
    fi
    
    log "Release created successfully!"
}

# Load environment variables
load_env() {
    local env_file="$BUILD_ROOT/env"
    if [[ -f "$env_file" ]]; then
        log "Loading environment variables from $env_file"
        # shellcheck source=/dev/null
        source "$env_file"
    fi
    
    # Detect GITHUB_REPO from git remote if not set
    if [[ -z "${GITHUB_REPO:-}" ]]; then
        local git_remote=$(git config --get remote.origin.url 2>/dev/null)
        if [[ -n "$git_remote" ]]; then
            # Extract owner/repo from git remote URL
            GITHUB_REPO=$(echo "$git_remote" | sed -E 's/.*github\.com[:/]([^/]+\/[^/]+)(\.git)?$/\1/' | sed 's/\.git$//')
            log "Detected GitHub repository: $GITHUB_REPO"
        else
            error "GITHUB_REPO not set and could not detect from git remote"
        fi
    fi
}

# Main execution
main() {
    log "Starting Continuous Delivery/Deployment process..."
    
    PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../" && pwd)"
    PROJECT_ROOT="${PROJECT_ROOT}/${EXTENSION_NAME}"
    BUILD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/" && pwd)"
    log "Project root: $PROJECT_ROOT"
    log "Build root: $BUILD_ROOT"

    load_env
    check_prerequisites
    
    local version=$(get_version)
    log "Extension version: $version"
    
    # Check if tag already exists
    if git rev-parse "v$version" >/dev/null 2>&1; then
        log "Tag v$version already exists. Skipping tag creation."
    else
        # Create git tag
        log "Creating git tag v$version..."
        git tag -a "v$version" -m "Release version $version"
        git push origin "v$version"
    fi
    
    # This part must be really careful
    # Because it use build_extension returns as parameters
    # So if we output log inside build_extension, it will be in the final output
    # Build extension
:<<"bug for log and echo mixed"
    local build_files=$(build_extension "$version")
    local zip_file=$(echo "$build_files" | head -n1)
    local crx_file=$(echo "$build_files" | tail -n1)
bug for log and echo mixed

    local tmp_file=$(mktemp)
    #log "Tmp file for building: $tmp_file"
    
    # Pass to build_extension, must use $() to pass the parameters
    # If build_extension "$version" "$tmp_file", doesn't work
    # Because set -euo pipefail
    # That would make build_extension return, if any subshell command fails, such as chrome command
    # When use $(build_extension ) to get return, 
    # the function runs in a subshell, and even if it fails, the parent shell doesn't exit because set -e only applies within that subshell.

    # only commend out set -euo pipefail to use the command below
    #build_extension "$version" "$tmp_file"

    local result=$(build_extension "$version" "$tmp_file")
    local zip_file=$(head -n1 "$tmp_file")
    local crx_file=$(tail -n1 "$tmp_file")
    #rm "$tmp_file"

    # Debug output to see what files were created
    log "Build files output:"
    log "  ZIP file: $zip_file (exists: $(test -f "$zip_file" && echo "yes" || echo "no"))"
    log "  CRX file: $crx_file (exists: $(test -f "$crx_file" && echo "yes" || echo "no"))"

    # Create GitHub release
    create_release "$version" "$zip_file" "$crx_file"
    
    log "CD/CI process completed successfully!"
    log "Release URL: https://github.com/$GITHUB_REPO/releases/tag/v$version"
}

# Handle command line arguments
case "${1:-}" in
    "--help"|"-h")        
        echo "Usage: $0 [--help]"
        echo ""
        echo "Continuous Delivery/Deployment script for Chrome Extension"
        echo "Builds and releases CRX file to GitHub"
        echo ""
        echo "Configuration:"
        echo "  Create env file in project root with:"
        echo "    GITHUB_TOKEN=your_github_token_here"
        echo "    GITHUB_REPO=owner/repository-name (optional, auto-detected)"
        echo ""
        echo "Environment variables:"
        echo "  GITHUB_TOKEN - GitHub personal access token (required if gh CLI not installed)"
        echo "                 Supports both classic (ghp_...) and fine-grained (github_pat_...)"
        echo "  GITHUB_REPO  - GitHub repository in format 'owner/repo' (auto-detected from git remote)"
        echo ""
        echo "Setup:"
        echo "  1. Copy env.example to env"
        echo "  2. Update GITHUB_TOKEN in env"
        echo "  3. Ensure private.pem exists for CRX signing (optional)"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac