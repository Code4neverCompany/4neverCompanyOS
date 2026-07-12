@echo off
cd /d "%~dp0"
echo [%date% %time%] workflow push > git-push.log
git add .github/workflows/build.yml push-git.bat push-workflow.bat git-init.log
git commit -m "CI: Windows-Build + Release via GitHub Actions (tauri-action)" >> git-push.log 2>&1
git push >> git-push.log 2>&1
echo exitcode: %errorlevel% >> git-push.log
echo [%date% %time%] done >> git-push.log
