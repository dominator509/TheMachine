@echo off
setlocal
cd /d "%~dp0\.."
call pnpm run smoke
if errorlevel 1 exit /b %errorlevel%
echo smoke test: ok
