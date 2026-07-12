@echo off
cd /d "%~dp0"
echo [%date% %time%] push start > git-push.log
git remote remove origin >nul 2>&1
git remote add origin https://github.com/Code4neverCompany/4neverCompanyOS.git
git remote -v >> git-push.log 2>&1
git push -u origin main:cowork-rebuild >> git-push.log 2>&1
echo exitcode: %errorlevel% >> git-push.log
echo [%date% %time%] done >> git-push.log
