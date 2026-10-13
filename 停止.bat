@echo off
chcp 65001 >nul
node "%~dp0scripts\launcher.mjs" --stop
if errorlevel 1 pause
