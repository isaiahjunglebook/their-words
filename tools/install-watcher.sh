#!/bin/bash
# Installs the Their Words auto-ingest watcher as a macOS LaunchAgent.
# After this, ingest runs automatically: whenever the upstream audio processor
# writes into its output folder (and every 10 minutes as a fallback), new
# fully-processed calls matching your ingest tags are extracted, anonymized,
# committed, and pushed — candidates appear in the dashboard review queue
# with no manual step.
#
# Usage:   bash tools/install-watcher.sh
# Remove:  launchctl unload ~/Library/LaunchAgents/com.theirwords.ingest.plist && \
#          rm ~/Library/LaunchAgents/com.theirwords.ingest.plist
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
LABEL="com.theirwords.ingest"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/their-words-ingest.log"

# Watch the same folder the upstream processor writes to (from config.yaml).
WATCH_DIR="$($NODE_BIN -e "
import('js-yaml').then(async ({ default: yaml }) => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const cfg = yaml.load(fs.readFileSync('$REPO_DIR/config.yaml', 'utf8'));
  console.log(cfg.upstream_output_dir.replace(/^~(?=$|\/)/, os.homedir()));
});
" )"

if [ ! -d "$WATCH_DIR" ]; then
  echo "WARNING: upstream output dir does not exist yet: $WATCH_DIR"
  echo "The watcher will still install; it activates once that folder exists."
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$REPO_DIR/tools/ingest.mjs</string>
    <string>--auto</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO_DIR</string>
  <key>WatchPaths</key>
  <array>
    <string>$WATCH_DIR</string>
  </array>
  <key>StartInterval</key><integer>600</integer>
  <key>RunAtLoad</key><true/>
  <key>ThrottleInterval</key><integer>120</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "Installed and loaded: $LABEL"
echo "  Watching:  $WATCH_DIR (plus a 10-minute timer fallback)"
echo "  Logs:      $LOG"
echo ""
echo "Notes:"
echo "  - ANTHROPIC_API_KEY is read from $REPO_DIR/.env"
echo "  - New participants get auto-suggested initials in auto mode; check"
echo "    roster.yaml occasionally and adjust before their first approval."
echo "  - git push must work non-interactively (keychain or SSH key)."
