@echo off
REM Double-click to play Cinderdeep on Windows (needs Node.js 18+ from https://nodejs.org)
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, this happens only once...
  set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
  call npm install
)
call npm run play
pause
