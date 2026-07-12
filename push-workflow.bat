@echo off
cd /d "%~dp0"
echo [%date% %time%] workflow push > git-push.log
git add -A >> git-push.log 2>&1
git commit -m "CI: Windows-Build + Release via GitHub Actions (tauri-action)" >> git-push.log 2>&1
git push origin HEAD:cowork-rebuild >> git-push.log 2>&1
echo exitcode: %errorlevel% >> git-push.log
echo [%date% %time%] done >> git-push.log
