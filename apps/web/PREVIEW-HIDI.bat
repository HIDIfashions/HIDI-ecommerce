@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js first.
  pause
  exit /b 1
)
echo Opening the included React snapshot. No npm packages need to be installed.
echo Open the ACTUAL address printed by the server below.
echo If a port is occupied, the next free port is chosen automatically.
echo For editing JSX, use START-HIDI-REACT.bat instead.
node scripts/preview.mjs
pause
