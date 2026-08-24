@echo off
setlocal
cd /d "%~dp0\.."

call scripts\preflight.cmd || exit /b 1
call pnpm run lint || exit /b 1
call pnpm run format:check || exit /b 1
call pnpm run typecheck || exit /b 1
call pnpm run build || exit /b 1
call pnpm run test:unit || exit /b 1
call pnpm run test:integration || exit /b 1
call pnpm run test:e2e || exit /b 1
call pnpm run security:check || exit /b 1
call pnpm run audit || exit /b 1
call pnpm run build:release || exit /b 1
call pnpm run smoke || exit /b 1

echo verify: ok
