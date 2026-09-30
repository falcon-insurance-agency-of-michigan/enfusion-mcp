@echo off
setlocal enabledelayedexpansion
title Enfusion Engine SDK MCP - Multi-IDE Installer
cd /d "%~dp0"

echo ========================================================================
echo              Enfusion Engine SDK MCP - Multi-IDE Installer
echo ========================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required to install and run Enfusion MCP.
    echo Please install Node.js v22 or higher from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Ensure dist\server.cjs exists
if not exist "dist\server.cjs" (
    echo [INFO] dist\server.cjs not found. Building Enfusion MCP server...
    call npm run build
    if %errorlevel% neq 0 (
        echo [ERROR] Build failed. Please check build errors above.
        pause
        exit /b 1
    )
    echo.
)

:: Run the interactive installer
node scripts\installer.mjs %*

echo.
pause
