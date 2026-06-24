@echo off
setlocal
cd /d "%~dp0\.."

call scripts\preflight.cmd || exit /b %errorlevel%
call pnpm run lint || exit /b %errorlevel%
call pnpm run format:check || exit /b %errorlevel%
call pnpm run typecheck || exit /b %errorlevel%
call pnpm run test:unit || exit /b %errorlevel%
call pnpm run test:integration || exit /b %errorlevel%
call pnpm run test:e2e || exit /b %errorlevel%
call pnpm run build || exit /b %errorlevel%
call pnpm run security:check || exit /b %errorlevel%
call pnpm run audit || exit /b %errorlevel%
call pnpm run build:release || exit /b %errorlevel%
call pnpm run smoke || exit /b %errorlevel%

echo verify: ok
