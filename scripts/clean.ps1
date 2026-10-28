# clean.ps1 - remove regenerable build output, caches and ad-hoc artifacts.
# Never touches sources, .env files, venvs, node_modules, server/uploads,
# server/tasks.db or server/backups.
#
#   .\scripts\clean.ps1            # delete
#   .\scripts\clean.ps1 -WhatIf    # dry run: only list what would be deleted

[CmdletBinding(SupportsShouldProcess)]
param()

$repo = Split-Path -Parent $PSScriptRoot   # scripts/ -> repo root
Set-Location $repo

$targets = @(
    # Android / Gradle build output
    'app\build', 'build', '.gradle',
    # Portal build output
    'portal\dist',
    # Test / lint caches and coverage
    '.pytest_cache', '.ruff_cache', 'portal\.pytest_cache',
    'server\.pytest_cache', 'server\.ruff_cache', 'server\.coverage',
    # Browser-automation screenshots and logs
    '.playwright-mcp', '.playwright-cli', 'output',
    # Temp DBs left by portal e2e runs
    'server\portal-*-temp.db',
    # Ad-hoc screenshots and logs at the root / dev servers
    '*.png', 'portal\.vite-*.log', 'server\*_out.txt'
)

$items = @(foreach ($t in $targets) { Get-Item -Path $t -Force -ErrorAction SilentlyContinue })
$items += Get-ChildItem -Path server, bot, scripts -Recurse -Directory -Filter __pycache__ -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\venv\\' }

if (-not $items) { Write-Host 'Nothing to clean.'; exit 0 }

foreach ($i in $items) {
    if ($PSCmdlet.ShouldProcess($i.FullName.Substring($repo.Length + 1), 'Remove')) {
        Remove-Item -LiteralPath $i.FullName -Recurse -Force
    }
}
