#!/bin/sh
# Double-click (macOS) or run ./play.command (Linux) to play Cinderdeep. Needs Node.js 18+.
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "Installing dependencies, this happens only once..."
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
fi
npm run play
