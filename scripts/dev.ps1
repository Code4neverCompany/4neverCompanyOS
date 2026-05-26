# scripts/dev.ps1
# Launches the desktop shell in dev mode after loading the VS Developer environment.
# Run from the repo root: pwsh ./scripts/dev.ps1

$ErrorActionPreference = "Stop"

$vsDevShell = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Launch-VsDevShell.ps1"
if (-not (Test-Path $vsDevShell)) {
    $vsDevShell = "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\Launch-VsDevShell.ps1"
}

if (-not (Test-Path $vsDevShell)) {
    Write-Error "VS Developer PowerShell launcher not found. Install Visual Studio 2022 Build Tools or Community with the Windows 11 SDK component."
    exit 1
}

Write-Host "Loading VS Developer environment from $vsDevShell..."
& $vsDevShell -Arch amd64 -HostArch amd64 -SkipAutomaticLocation 2>&1 | Out-Null

Set-Location $PSScriptRoot\..

Write-Host "Launching desktop in dev mode..."
pnpm dev:desktop
