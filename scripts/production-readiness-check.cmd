@echo off
setlocal
cd /d "%~dp0\.."
call pnpm run production:readiness
if errorlevel 1 exit /b %errorlevel%
echo production readiness: ok
