# scripts/download-zellij.ps1
# Downloads Zellij v0.44.3 Windows binary for bundling in the NSIS installer.
# Run during CI build before `pnpm tauri build`.
# Target: apps/desktop/src-tauri/binaries/zellij.exe

$ErrorActionPreference = "Stop"

$Version = "v0.44.3"
$OutDir = Join-Path $PSScriptRoot "..\apps\desktop\src-tauri\binaries"
$OutFile = Join-Path $OutDir "zellij.exe"

if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

# Zellij Windows binary URL (x86_64)
$Url = "https://github.com/zellij-org/zellij/releases/download/$Version/zellij-x86_64-pc-windows-msvc.zip"

Write-Host "Downloading Zellij $Version from $Url..."
try {
    Invoke-WebRequest -Uri $Url -OutFile "$OutFile.zip" -UserAgent "4neverCompany-OS/1.0"
} catch {
    Write-Error "Failed to download Zellij: $_"
    exit 1
}

Write-Host "Extracting..."
Expand-Archive -Path "$OutFile.zip" -DestinationPath $OutDir -Force
Remove-Item "$OutFile.zip" -Force

# The zip contains zellij.exe - verify it
if (-not (Test-Path $OutFile)) {
    Write-Error "Extracted zellij.exe not found at $OutFile"
    exit 1
}

$actualVersion = & $OutFile --version 2>&1
Write-Host "Zellij installed: $actualVersion"
Write-Host "Zellij binary: $OutFile"
