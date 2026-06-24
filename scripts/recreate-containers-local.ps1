# Full rebuild + recreate of all containers LOCALLY.
# ===================================================
# Локальный аналог scripts/recreate-containers.ps1 — БЕЗ SSH, против локального
# compose-файла в корне проекта. По умолчанию — полный Postgres-стек
# (docker-compose.postgres.yml: db + redis + server + worker), как в проде.
# Полная пересборка с нуля:
#   1. собирает портал локально (npm run build → portal/dist, его бмаунтит server);
#   2. пересобирает ВСЕ образы и принудительно пересоздаёт ВСЕ контейнеры
#      (docker compose up -d --build --force-recreate).
#
# Именованные тома (postgres_data, redis_data, server_uploads и т.д.) сохраняются —
# пересоздаются только контейнеры, не данные.
#
# Примеры:
#   ./scripts/recreate-containers-local.ps1                          # Postgres-стек, полный rebuild
#   ./scripts/recreate-containers-local.ps1 -ComposeFile docker-compose.yml  # SQLite-стек
#   ./scripts/recreate-containers-local.ps1 -SkipPortalBuild         # не пересобирать портал
#   ./scripts/recreate-containers-local.ps1 -Logs                    # после старта прицепить логи

param(
    [string]$ComposeFile = "docker-compose.postgres.yml",
    [switch]$SkipPortalBuild = $false,
    [switch]$Logs = $false
)

$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$RootPath = Split-Path -Parent $PSScriptRoot

$colors = @{ Info = "Cyan"; Success = "Green"; Warning = "Yellow"; Error = "Red" }

function Write-Log {
    param([string]$Message, [string]$Level = "Info")
    $color = $colors[$Level]; if ($null -eq $color) { $color = "White" }
    Write-Host "[$([DateTime]::Now.ToString('HH:mm:ss'))] " -NoNewline
    Write-Host $Message -ForegroundColor $color
}

function Test-CommandAvailable {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Checked {
    param([scriptblock]$Script, [string]$ErrorMessage)
    & $Script
    if ($LASTEXITCODE -ne 0) { throw $ErrorMessage }
}

# Compose v2 plugin ("docker compose") или legacy v1 binary ("docker-compose").
function Get-ComposeInvoker {
    docker compose version *> $null
    if ($LASTEXITCODE -eq 0) { return @("docker", "compose") }
    if (Test-CommandAvailable "docker-compose") { return @("docker-compose") }
    throw "Neither 'docker compose' nor 'docker-compose' is available"
}

if (-not (Test-CommandAvailable "docker")) {
    throw "docker command is not available - is Docker Desktop running?"
}

$composeFile = if ([System.IO.Path]::IsPathRooted($ComposeFile)) { $ComposeFile } else { Join-Path $RootPath $ComposeFile }
if (-not (Test-Path $composeFile)) {
    throw "Compose file not found: $composeFile"
}

# Требуем только те env-файлы, на которые реально ссылается выбранный compose-файл
# (через env_file: ./server/.env и т.п.) — иначе compose упадёт ещё до сборки.
# Postgres-стек, например, бота не содержит и bot/.env не требует.
$composeText = Get-Content -LiteralPath $composeFile -Raw
foreach ($envFile in @("server/.env", "bot/.env")) {
    if ($composeText -match [regex]::Escape("./$envFile") -and
        -not (Test-Path (Join-Path $RootPath $envFile))) {
        throw "$envFile not found (referenced by $ComposeFile). Create it from $envFile.example before running."
    }
}

$compose = Get-ComposeInvoker
$composeExe = $compose[0]
$composeBase = @($compose[1..($compose.Length - 1)]) + @("-f", $composeFile)

$startedAt = Get-Date

Push-Location $RootPath
try {
    if (-not $SkipPortalBuild) {
        $portalPath = Join-Path $RootPath "portal"
        if (-not (Test-Path (Join-Path $portalPath "package.json"))) {
            throw "portal/package.json not found at $portalPath"
        }
        if (-not (Test-CommandAvailable "npm")) {
            throw "npm is not available, cannot build portal (use -SkipPortalBuild to skip)"
        }

        Write-Log "Building portal (npm run build)" "Info"
        Push-Location $portalPath
        try {
            Invoke-Checked -Script { npm run build } -ErrorMessage "Portal build failed"
        }
        finally { Pop-Location }
        Write-Log "Portal build completed" "Success"
    }
    else {
        Write-Log "Skipping portal build" "Warning"
    }

    Write-Log "Rebuilding images and recreating all containers" "Info"
    Invoke-Checked -Script {
        & $composeExe @composeBase up -d --build --force-recreate
    } -ErrorMessage "docker compose up failed"

    Write-Log "Container status" "Info"
    & $composeExe @composeBase ps

    $duration = "{0:mm\:ss}" -f ((Get-Date) - $startedAt)
    Write-Log "Done in $duration. API: http://localhost:8001/health" "Success"

    if ($Logs) {
        Write-Log "Attaching to logs (Ctrl+C to detach)" "Info"
        & $composeExe @composeBase logs -f
    }
}
finally {
    Pop-Location
}
