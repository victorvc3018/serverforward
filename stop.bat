@echo off
echo Stopping Discord Bot (node index.js)...
taskkill /F /FI "WINDOWTITLE eq Discord Message Sync Bot*" >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
echo Done.
pause
