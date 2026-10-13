@echo off
chcp 65001 >nul
node "%~dp0scripts\launcher.mjs"
if errorlevel 1 pause
