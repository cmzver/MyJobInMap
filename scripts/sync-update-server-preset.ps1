param(
    [ValidateSet("all", "portal", "server", "provision")]
    [string]$Mode = "",

    # Provision-mode overrides (asked interactively when omitted).
    [string]$ProvisionServer = "",
    [string]$ProvisionDomain = ""
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
    Write-Host "  [4] Новый сервер развернуть с нуля (Docker + env + SSL)" -ForegroundColor Magenta
    Write-Host ""
    $choice = Read-Host "Выбор (1/2/3/4)"
    switch ($choice) {
        "1" { $Mode = "all" }
        "2" { $Mode = "portal" }
        "3" { $Mode = "server" }
        "4" { $Mode = "provision" }
        "all" { $Mode = "all" }
        "portal" { $Mode = "portal" }
        "server" { $Mode = "server" }
        "provision" { $Mode = "provision" }
        default {
            Write-Host "Неверный выбор. Допустимые: 1, 2, 3, 4" -ForegroundColor Red
            exit 1
        }
    }
}

$modeLabels = @{
    "all"    = "Все (сервер + портал)"
    "portal" = "Только портал"
    "server" = "Только сервер"
    "provision" = "Новый сервер (с нуля)"
}

# --- Provision mode targets a brand-new server, so it overrides the hardcoded host ---
if ($Mode -eq "provision") {
    if (-not $ProvisionServer) {
        $ProvisionServer = Read-Host "SSH адрес нового сервера (например root@203.0.113.10)"
        if (-not $ProvisionServer) {
            Write-Host "Адрес сервера обязателен" -ForegroundColor Red
            exit 1
        }
    }
    $server = $ProvisionServer

    if (-not $ProvisionDomain) {
        $ProvisionDomain = Read-Host "Домен для HTTPS (Enter — пропустить SSL/Caddy)"
    }
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
    "provision" {
        # Full bootstrap: install Docker, generate/upload env, build + sync
        # everything, bring up containers and (if a domain was given) Caddy SSL.
        $syncArgs.Provision = $true
        $syncArgs.IncludeServiceEnvFiles = $true
        if ($ProvisionDomain) {
            $syncArgs.Domain = $ProvisionDomain
        }
    }
}

$mainScript = Join-Path $scriptDir "sync-update-server.ps1"
& $mainScript @syncArgs
exit $LASTEXITCODE