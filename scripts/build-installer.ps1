# scripts/build-installer.ps1
# Builds the Windows .exe installer via Tauri's NSIS bundler.
# Run from the repo root: pwsh ./scripts/build-installer.ps1

$ErrorActionPreference = "Stop"

$vsDevShell = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Launch-VsDevShell.ps1"
if (-not (Test-Path $vsDevShell)) {
    $vsDevShell = "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\Launch-VsDevShell.ps1"
}

if (-not (Test-Path $vsDevShell)) {
    Write-Error "VS Developer PowerShell launcher not found."
    exit 1
}

Write-Host "Loading VS Developer environment..."
& $vsDevShell -Arch amd64 -HostArch amd64 -SkipAutomaticLocation 2>&1 | Out-Null

Set-Location $PSScriptRoot\..

Write-Host "Building desktop installer..."
pnpm build:desktop

Write-Host "Build complete. Installer output: apps/desktop/src-tauri/target/release/bundle/"
