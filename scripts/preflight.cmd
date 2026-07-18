@echo off
setlocal
cd /d "%~dp0\.."

if not exist AGENTS.md (
  echo ERROR: required file missing: AGENTS.md 1>&2
  exit /b 1
)
if not exist COMMANDS.md (
  echo ERROR: required file missing: COMMANDS.md 1>&2
  exit /b 1
)
if not exist ARCHITECTURE.md (
  echo ERROR: required file missing: ARCHITECTURE.md 1>&2
  exit /b 1
)
if not exist ROADMAP.md (
  echo ERROR: required file missing: ROADMAP.md 1>&2
  exit /b 1
)
if not exist .agent\PLANS.md (
  echo ERROR: required file missing: .agent\PLANS.md 1>&2
  exit /b 1
)
if not exist scripts (
  echo ERROR: scripts directory missing 1>&2
  exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: git is required. 1>&2
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 20+ is required for the default stack. 1>&2
  exit /b 1
)

if exist package.json (
  where pnpm >nul 2>nul
  if errorlevel 1 (
    echo ERROR: pnpm is required. Run: corepack enable ^&^& corepack prepare pnpm@latest --activate 1>&2
    exit /b 1
  )
)

echo preflight: ok
