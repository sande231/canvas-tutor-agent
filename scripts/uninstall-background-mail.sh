#!/usr/bin/env bash
set -euo pipefail

LABEL="com.sandeep.canvas-tutor-agent"
PLIST_TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"

if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)" "$PLIST_TARGET" >/dev/null 2>&1 || true
fi

rm -f "$PLIST_TARGET"
echo "Canvas Tutor background mail agent uninstalled."
