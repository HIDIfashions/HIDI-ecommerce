@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22.12 or newer, then run this file again.
  pause
  exit /b 1
)
node -e "const [major,minor]=process.versions.node.split('.').map(Number); process.exit(major>22 || (major===22 && minor>=12) ? 0 : 1)"
if errorlevel 1 (
  echo This project requires Node.js 22.12 or newer.
  pause
  exit /b 1
)
if not exist "node_modules\vite\package.json" (
  echo Installing the React development dependencies...
  call npm install
  if errorlevel 1 (
    echo Installation failed. Please check your internet connection and npm settings.
    echo You can still use PREVIEW-HIDI.bat to see the included React snapshot.
    pause
    exit /b 1
  )
)
call npm run dev -- --open
pause
