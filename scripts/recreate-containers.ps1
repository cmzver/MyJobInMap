# Full rebuild + recreate of all containers on the server.
# =========================================================
# Тонкая обёртка над scripts/sync-update-server.ps1, которая выполняет ПОЛНУЮ
# пересборку с нуля:
#   1. собирает портал локально (npm run build) и заливает portal/dist;
#   2. синхронизирует код сервера и бота на сервер;
#   3. пересобирает ВСЕ Docker-образы и принудительно пересоздаёт ВСЕ контейнеры
#      (docker compose up -d --build --force-recreate).
#
# Тома (redis-data, tasks.db через bind-mount, uploads) при этом сохраняются —
# пересоздаются только контейнеры, не данные.
#
# Примеры:
#   ./scripts/recreate-containers.ps1                       # спросит сервер и подтверждение
#   ./scripts/recreate-containers.ps1 -Server root@1.2.3.4  # без вопроса про сервер
#   ./scripts/recreate-containers.ps1 -Force                # без подтверждения (для CI/автоматики)
#
# Все остальные параметры sync-update-server.ps1 (-SshKeyPath, -SkipPortalBuild,
# -RemotePath и т.д.) пробрасываются как есть через -ExtraArgs.

param(
    [string]$Server = $null,
    [int]$SSHPort = 22,
    [string]$SshKeyPath = $null,
    [switch]$Force = $false,

    # Любые дополнительные параметры для sync-update-server.ps1, например:
    #   -ExtraArgs @('-SkipPortalBuild')
    [string[]]$ExtraArgs = @()
)

$ErrorActionPreference = "Stop"

$deployScript = Join-Path $PSScriptRoot "sync-update-server.ps1"
if (-not (Test-Path $deployScript)) {
    throw "sync-update-server.ps1 not found next to this script: $deployScript"
}

$params = @{ ForceRebuild = $true }
if ($Server)     { $params.Server = $Server }
if ($SSHPort)    { $params.SSHPort = $SSHPort }
if ($SshKeyPath) { $params.SshKeyPath = $SshKeyPath }
if ($Force)      { $params.Force = $true }

& $deployScript @params @ExtraArgs
