#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/Users/sandeep/Documents/Codex/2026-05-12/canvas-tutor"
LABEL="com.sandeep.canvas-tutor-agent"
PLIST_SOURCE="$PROJECT_DIR/launchd/$LABEL.plist"
PLIST_TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$PROJECT_DIR/logs"

if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)" "$PLIST_TARGET" >/dev/null 2>&1 || true
fi

cp "$PLIST_SOURCE" "$PLIST_TARGET"
launchctl bootstrap "gui/$(id -u)" "$PLIST_TARGET"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "Canvas Tutor background mail agent installed."
echo "It runs at http://127.0.0.1:4200 and keeps the daily email scheduler alive while your Mac is awake."
