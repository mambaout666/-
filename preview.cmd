@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -Command "$reports = @(Get-ChildItem -LiteralPath 'results' -Filter '*.html' -File -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending); if ($reports.Count -eq 0) { Write-Host '尚无展示页，请先运行采集器，或打开扩展导出的 HTML。'; exit 1 }; Invoke-Item -LiteralPath $reports[0].FullName"
if errorlevel 1 pause
