@echo off
chcp 65001 >nul
cd /d "%~dp0"
python crawler.py %*
echo.
echo 采集结束，结果在 results 文件夹，详情见 logs\crawler.log
pause
