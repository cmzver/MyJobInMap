# auto-checks.ps1 - fast lint/typecheck on the changed subproject.
# Wired as a Stop hook in .claude/settings.json. Loop-safe: honors
# stop_hook_active so it never re-triggers itself. On failure it exits 2
# and prints findings to stderr (fed back to Claude); on success exits 0.
#
# Scope by design: only fast static checks (tsc, eslint, pylint E/F).
# Android (gradle) is intentionally skipped - too slow for a per-turn hook;
# run the build-linter / test-runner subagents for that.

$ErrorActionPreference = 'SilentlyContinue'

# --- Loop guard: read hook stdin JSON, bail if already in a stop-hook continuation.
# The hook harness pipes the JSON payload and closes stdin, so ReadToEnd returns at EOF.
# Guarded by IsInputRedirected so an interactive run (no pipe) skips the read entirely.
$payload = $null
if ([Console]::IsInputRedirected) {
    try {
        $raw = [Console]::In.ReadToEnd()
        if ($raw) { $payload = $raw | ConvertFrom-Json }
    } catch { }
}
if ($payload -and $payload.stop_hook_active) { exit 0 }

$repo = Split-Path -Parent $PSScriptRoot   # scripts/ -> repo root
Set-Location $repo

# --- Collect changed files (unstaged + staged + untracked), repo-relative, forward slashes
$changed = New-Object System.Collections.Generic.List[string]
foreach ($f in (& git diff --name-only)) { if ($f) { $changed.Add($f) } }
foreach ($f in (& git diff --name-only --staged)) { if ($f) { $changed.Add($f) } }
foreach ($f in (& git ls-files --others --exclude-standard)) { if ($f) { $changed.Add($f) } }
$changed = $changed | Sort-Object -Unique
if (-not $changed) { exit 0 }

$failures = New-Object System.Collections.Generic.List[string]

function Test-Cmd($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }

# ---------------- portal/ (Vite + React + TS) ----------------
$portalFiles = $changed | Where-Object { $_ -like 'portal/src/*' -and $_ -match '\.(ts|tsx)$' }
if ($portalFiles -and (Test-Cmd npx)) {
    Push-Location (Join-Path $repo 'portal')

    # Type-check (whole project - tsc needs the full graph)
    $tscOut = & npx --no-install tsc --noEmit 2>&1
    if ($LASTEXITCODE -ne 0) {
        $failures.Add("[portal] tsc --noEmit failed:`n" + (($tscOut | Select-Object -First 40) -join "`n"))
    }

    # Lint only the changed files (fast, focused)
    $rel = $portalFiles | ForEach-Object { $_ -replace '^portal/', '' }
    $eslintOut = & npx --no-install eslint @rel 2>&1
    if ($LASTEXITCODE -ne 0) {
        $failures.Add("[portal] eslint failed:`n" + (($eslintOut | Select-Object -First 40) -join "`n"))
    }

    Pop-Location
}

# ---------------- server/ (FastAPI, Python) ----------------
$serverFiles = $changed | Where-Object { $_ -like 'server/*' -and $_ -match '\.py$' }
if ($serverFiles -and (Test-Cmd python)) {
    Push-Location (Join-Path $repo 'server')
    $rel = $serverFiles | ForEach-Object { $_ -replace '^server/', '' }
    $pylintOut = & python -m pylint --disable=all --enable=E,F @rel 2>&1
    if ($LASTEXITCODE -ne 0) {
        $failures.Add("[server] pylint (errors only) failed:`n" + (($pylintOut | Select-Object -First 40) -join "`n"))
    }
    Pop-Location
}

# ---------------- bot/ (Python) ----------------
$botFiles = $changed | Where-Object { $_ -like 'bot/*' -and $_ -match '\.py$' }
if ($botFiles -and (Test-Cmd python)) {
    Push-Location (Join-Path $repo 'bot')
    $rel = $botFiles | ForEach-Object { $_ -replace '^bot/', '' }
    $pylintOut = & python -m pylint --disable=all --enable=E,F @rel 2>&1
    if ($LASTEXITCODE -ne 0) {
        $failures.Add("[bot] pylint (errors only) failed:`n" + (($pylintOut | Select-Object -First 40) -join "`n"))
    }
    Pop-Location
}

# ---------------- Android note (not auto-run) ----------------
$appFiles = $changed | Where-Object { $_ -like 'app/*' -and $_ -match '\.(kt|kts)$' }

if ($failures.Count -gt 0) {
    [Console]::Error.WriteLine("Auto-checks found issues in the changed code - fix these before finishing:`n")
    foreach ($f in $failures) { [Console]::Error.WriteLine($f + "`n") }
    if ($appFiles) {
        [Console]::Error.WriteLine("(Android files also changed - not auto-checked. Run the build-linter subagent for :app.)")
    }
    exit 2
}

exit 0
