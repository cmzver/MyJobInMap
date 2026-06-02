# local-review.ps1 - quick code review of the current git diff using a local
# LM Studio model (OpenAI-compatible API). Cheap "first opinion" pass; the small
# local model is advisory, not a replacement for the Claude code-reviewer subagent.
#
# Usage:
#   .\scripts\local-review.ps1                          # review working-tree diff
#   .\scripts\local-review.ps1 -Staged                  # review staged diff only
#   .\scripts\local-review.ps1 -Model "qwen/qwen3.6-35b-a3b"
#
param(
    [string]$Model    = "google/gemma-4-e4b",
    [string]$Endpoint = "http://127.0.0.1:1234/v1/chat/completions",
    [int]$MaxDiffChars = 12000,
    [switch]$Staged
)

# 'Continue' so native git stderr (e.g. LF/CRLF warnings) doesn't abort the script
# in Windows PowerShell 5.1. The HTTP call below has its own try/catch.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

# --- Collect the diff (code files only; skip lockfiles / generated noise)
# Discard git stderr (e.g. LF/CRLF warnings) so it doesn't trip ErrorActionPreference=Stop.
$diffArgs = @('diff', '--no-color')
if ($Staged) { $diffArgs += '--staged' }
$diffArgs += @('--', 'portal/src', 'server/app', 'server/*.py', 'bot', 'app/src')
$diff = (& git @diffArgs 2>$null) -join "`n"

if ([string]::IsNullOrWhiteSpace($diff)) {
    Write-Host "No code changes to review (working tree clean for tracked code paths)."
    exit 0
}

$truncated = $false
if ($diff.Length -gt $MaxDiffChars) {
    $diff = $diff.Substring(0, $MaxDiffChars)
    $truncated = $true
}

# --- Build the review request
$system = @"
You are a terse code reviewer. You are given a git diff. Report only concrete,
high-confidence issues introduced by the diff: bugs, null/None handling, logic
errors, security problems, obvious inefficiency. For each: one line, prefixed
with severity [HIGH]/[MED]/[LOW], naming the file. If the diff looks fine, reply
exactly: "No issues found." Do not restate the diff. Do not invent problems.
"@

$userMsg = "Review this diff:`n`n$diff"
if ($truncated) { $userMsg += "`n`n(NOTE: diff was truncated for length.)" }

$body = @{
    model       = $Model
    messages    = @(
        @{ role = "system"; content = $system },
        @{ role = "user";   content = $userMsg }
    )
    temperature = 0.1
    max_tokens  = 700
} | ConvertTo-Json -Depth 6

Write-Host "Local review via $Model ..." -ForegroundColor Cyan
try {
    $r = Invoke-RestMethod -Uri $Endpoint -Method Post -Body $body -ContentType "application/json" -TimeoutSec 120 -ErrorAction Stop
    $out = $r.choices[0].message.content.Trim()
    Write-Host ""
    Write-Host $out
} catch {
    Write-Host "Local model unreachable at $Endpoint - is LM Studio server running with a model loaded?" -ForegroundColor Yellow
    Write-Host "Error: $($_.Exception.Message)"
    exit 1
}
