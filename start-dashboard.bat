@echo off
setlocal
cd /d "%~dp0"
title Governance Dashboard - Local Presentation
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js was not found on this computer.
  echo Open Command Prompt in this folder and verify Node.js is installed.
  echo.
  pause
  exit /b 1
)
echo Starting Governance Dashboard on http://127.0.0.1:8080
echo This does not use or stop localhost:3000.
echo.
node server.js
if errorlevel 1 pause
