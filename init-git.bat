@echo off
cd /d "%~dp0"
echo [%date% %time%] git init > git-init.log
git --version >> git-init.log 2>&1
if errorlevel 1 (
  echo ERROR: git not found >> git-init.log
  exit /b 1
)
git init -b main >> git-init.log 2>&1
git config user.name "Maurice"
git config user.email "mauricedimi56@gmail.com"
git add -A >> git-init.log 2>&1
git commit -m "4neverCompanyOS v0.2: Tauri-App (Rust-Backend), C4-Hybrid-Branding, Brand-Template-Pack" >> git-init.log 2>&1
git log --oneline >> git-init.log 2>&1
git status --short >> git-init.log 2>&1
echo [%date% %time%] done >> git-init.log
