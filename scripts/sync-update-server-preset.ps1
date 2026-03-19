param(
    [ValidateSet("all", "portal", "server")]
    [string]$Mode = ""
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

$server = "root@185.121.232.130"
$remotePath = "/opt/fieldworker"
$sshPort = 22
$sshKeyPath = Join-Path $HOME ".ssh\fieldworker_deploy"

# --- Interactive mode selection ---
if (-not $Mode) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "        FieldWorker Deploy" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  [1] Все          сервер + портал + контейнеры" -ForegroundColor White
    Write-Host "  [2] Портал       сборка + загрузка portal/dist" -ForegroundColor Green
    Write-Host "  [3] Сервер       код + пересборка контейнеров" -ForegroundColor Yellow
    Write-Host ""
    $choice = Read-Host "Выбор (1/2/3)"
    switch ($choice) {
        "1" { $Mode = "all" }
        "2" { $Mode = "portal" }
        "3" { $Mode = "server" }
        "all" { $Mode = "all" }
        "portal" { $Mode = "portal" }
        "server" { $Mode = "server" }
        default {
            Write-Host "Неверный выбор. Допустимые: 1, 2, 3" -ForegroundColor Red
            exit 1
        }
    }
}

$modeLabels = @{
    "all"    = "Все (сервер + портал)"
    "portal" = "Только портал"
    "server" = "Только сервер"
}

Write-Host ""
Write-Host "Режим: $($modeLabels[$Mode])" -ForegroundColor Cyan
Write-Host "Сервер: $server" -ForegroundColor Cyan
Write-Host ""

# --- Build arguments for main deploy script ---
$syncArgs = @{
    Server = $server
    LocalPath = $rootDir
    RemotePath = $remotePath
    SSHPort = $sshPort
    SshKeyPath = $sshKeyPath
    Force = $true
}

switch ($Mode) {
    "all" {
        $syncArgs.IncludeServiceEnvFiles = $true
    }
    "portal" {
        $syncArgs.SkipSync = $true
        $syncArgs.SkipRestart = $true
    }
    "server" {
        $syncArgs.SkipPortalBuild = $true
        $syncArgs.SkipPortalSync = $true
        $syncArgs.IncludeServiceEnvFiles = $true
    }
}

$mainScript = Join-Path $scriptDir "sync-update-server.ps1"
& $mainScript @syncArgs
exit $LASTEXITCODE