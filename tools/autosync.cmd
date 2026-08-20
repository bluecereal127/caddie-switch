@echo off
title Caddie autosync
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autosync.ps1"
pause
