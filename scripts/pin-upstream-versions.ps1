# scripts/pin-upstream-versions.ps1
# Quarterly upstream rebase helper (per OQ-J).
# Queries each pinned upstream repo for its current latest stable tag
# and emits a diff against the pins in docs/pinned-versions.md.
#
# Does NOT automatically rebase — produces a report the Architect uses
# during the quarterly rebase window. Manual review is required because
# any pin bump may have breaking changes that need integration work.

$ErrorActionPreference = "Stop"

$upstreams = @(
    @{ Name = "Paperclip";     Repo = "paperclipai/paperclip" },
    @{ Name = "Hermes Agent";  Repo = "NousResearch/hermes-agent" },
    @{ Name = "Zellij";        Repo = "zellij-org/zellij" },
    @{ Name = "Tauri";         Repo = "tauri-apps/tauri" }
)

Write-Host "Querying upstream releases..."
Write-Host ""

foreach ($u in $upstreams) {
    $info = gh release view --repo $u.Repo --json tagName, name, publishedAt, isPrerelease 2>&1 | ConvertFrom-Json
    if ($info) {
        $prerelease = if ($info.isPrerelease) { " [PRE-RELEASE]" } else { "" }
        Write-Host ("  {0,-15} {1,-25} {2}{3}" -f $u.Name, $info.tagName, $info.publishedAt, $prerelease)
    } else {
        Write-Host ("  {0,-15} ERROR" -f $u.Name)
    }
}

Write-Host ""
Write-Host "Compare against docs/pinned-versions.md → if any tag has moved, open a rebase ticket."
Write-Host "Per OQ-J: reserve ~10% of the current milestone's capacity for the rebase."
