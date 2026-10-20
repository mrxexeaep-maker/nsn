#!/bin/bash
set -euo pipefail

bun install
bun run build:packages
(cd packages/mcp && npm link --offline --ignore-scripts --package-lock=false)

# Keep this build separate so cleanup does not touch other Cargo builds.
export CARGO_TARGET_DIR="$(mktemp -d "${TMPDIR:-/tmp}/open-pencil-install.XXXXXX")"
APPLE_SIGNING_IDENTITY=- bun run tauri build --bundles app \
  --config '{"bundle":{"createUpdaterArtifacts":false}}'

ditto "$CARGO_TARGET_DIR/release/bundle/macos/OpenPencil.app" /Applications/OpenPencil.app

# Clean only after installation succeeds; preserve package dist outputs for MCP.
cargo clean --manifest-path desktop/Cargo.toml --target-dir "$CARGO_TARGET_DIR"
rmdir "$CARGO_TARGET_DIR"
