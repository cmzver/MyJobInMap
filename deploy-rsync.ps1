# Deploy to Remote Ubuntu Server via rsync and SSH
# Использование: .\deploy-rsync.ps1 -Server "username@192.168.1.100" -LocalPath "C:\Users\VADIM\Documents\MyJobInMap"

param(
    [string]$Server = $null,
    [string]$LocalPath = $null,
    [int]$SSHPort = 22,
    [switch]$NoRestart = $false,
    [switch]$DryRun = $false
)

# Цвета вывода
$colors = @{
    Success = "Green"
    Warning = "Yellow"
    Error = "Red"
    Info = "Cyan"
}

function Write-Log {
    param([string]$Message, [string]$Level = "Info")
    $color = $colors[$Level]
    if ($null -eq $color) { $color = "White" }
    Write-Host "[$([DateTime]::Now.ToString('HH:mm:ss'))] " -NoNewline
    Write-Host "$Message" -ForegroundColor $color
}

function Test-RsyncInstalled {
    if (-not (Get-Command rsync -ErrorAction SilentlyContinue)) {
        Write-Log "rsync не установлен" Error
        Write-Log "Пожалуйста установите Git for Windows с опцией 'Use Windows default console window'" Warning
        Write-Log "Или установите rsync отдельно" Warning
        return $false
    }
    return $true
}

function Test-SSHConnection {
    param([string]$Server, [int]$Port)
    Write-Log "Проверка SSH соединения с $Server..." Info
    $result = ssh -p $Port $Server "echo 'SSH OK'" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Log "✅ SSH соединение успешно" Success
        return $true
    } else {
        Write-Log "❌ SSH соединение не удалось" Error
        Write-Log "Убедитесь что:" Info
        Write-Log "  - Сервер доступен ($Server)" Info
        Write-Log "  - SSH ключ настроен" Info
        Write-Log "  - Порт $Port открыт" Info
        return $false
    }
}

# Интерактивный ввод если параметры не переданы
if (-not $Server) {
    Write-Log "=== 🚀 Deploy FieldWorker to Ubuntu Server ===" Info
    Write-Host ""
    
    $Server = Read-Host "IP/hostname и пользователь (например: ubuntu@192.168.1.100)"
    if (-not $Server) {
        Write-Log "Сервер не указан" Error
        exit 1
    }
}

if (-not $LocalPath) {
    $LocalPath = Read-Host "Локальная директория проекта (Enter для текущей: $PSScriptRoot)"
    if (-not $LocalPath) {
        $LocalPath = $PSScriptRoot
    }
}

# Проверка локальной директории
if (-not (Test-Path $LocalPath)) {
    Write-Log "Директория не найдена: $LocalPath" Error
    exit 1
}

if (-not (Test-Path "$LocalPath/.git")) {
    Write-Log "Git репозиторий не найден в: $LocalPath" Warning
}

# Проверки
Write-Host ""
if (-not (Test-RsyncInstalled)) { exit 1 }
if (-not (Test-SSHConnection $Server $SSHPort)) { exit 1 }

Write-Host ""
Write-Log "=" Info
Write-Log "Параметры деплоя:" Info
Write-Log "  Server: $Server" Info
Write-Log "  Local: $LocalPath" Info
Write-Log "  SSH Port: $SSHPort" Info
Write-Log "  Restart: $(if ($NoRestart) { 'No' } else { 'Yes' })" Info
Write-Log "  Dry Run: $(if ($DryRun) { 'Yes' } else { 'No' })" Info
Write-Log "=" Info

$continue = Read-Host "`nПродолжить? (yes/no)"
if ($continue -ne "yes") {
    Write-Log "Отменено" Warning
    exit 0
}

Write-Host ""
Write-Log "🚀 Начало синхронизации..." Info

# rsync параметры
$rsyncArgs = @(
    "-avz"
    "--delete"
    "--exclude=.git"
    "--exclude=.env"
    "--exclude=venv"
    "--exclude=node_modules"
    "--exclude=__pycache__"
    "--exclude=.pytest_cache"
    "--exclude=*.pyc"
    "--exclude=.idea"
    "--exclude=.gradle"
    "--exclude=build"
    "--exclude=app/build"
    "--exclude=*.db"
    "--exclude=.wwebjs_auth"
    "--exclude=.wwebjs_cache"
    "--exclude=uploads/photos/*"
    "--exclude=logs"
    "--exclude=*.apk"
    "--exclude=.DS_Store"
)

if ($DryRun) {
    $rsyncArgs += "--dry-run"
    Write-Log "⚠️  DRY RUN - никакие файлы не будут изменены" Warning
}

# Выполнить rsync
$remoteUser = $Server.Split("@")[0]
$remoteHost = $Server.Split("@")[1]
$remotePath = "/opt/fieldworker"

Write-Log "Синхронизация файлов с сервером..." Info
rsync @rsyncArgs -e "ssh -p $SSHPort" "$LocalPath/" "$Server:$remotePath/"

if ($LASTEXITCODE -ne 0) {
    Write-Log "❌ rsync завершился с ошибкой" Error
    exit 1
}

Write-Log "✅ Синхронизация завершена успешно" Success

# Перезагрузка контейнеров если не указан флаг --NoRestart
if (-not $NoRestart -and -not $DryRun) {
    Write-Host ""
    Write-Log "🔄 Перезагрузка Docker контейнеров..." Info

    # Используем docker compose (v2) с fallback на docker-compose (v1)
    $restartCmd = "cd $remotePath && (docker compose up -d --build 2>/dev/null || docker-compose up -d --build)"
    $remoteResult = ssh -p $SSHPort $Server $restartCmd 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Log "✅ Контейнеры успешно перезагружены" Success
        Write-Host ""
        Write-Log "Проверить статус:" Info
        ssh -p $SSHPort $Server "cd $remotePath && (docker compose ps 2>/dev/null || docker-compose ps)"
    } else {
        Write-Log "⚠️  Ошибка при перезагрузке контейнеров" Warning
        Write-Log "Детали: $remoteResult" Warning
        Write-Log "Проверьте вручную: ssh $Server 'cd $remotePath && docker compose ps'" Info
        exit 1
    }
} else {
    if ($DryRun) {
        Write-Log "⚠️  DRY RUN: контейнеры не перезагружались" Warning
    }
    else {
        Write-Log "ℹ️  Флаг --NoRestart включен, контейнеры не перезагружались" Info
        Write-Log "Перезагрузите вручную: ssh $Server 'cd $remotePath && docker compose restart'" Info
    }
}

Write-Host ""
Write-Log "=" Info
Write-Log "✅ Деплой завершён успешно!" Success
Write-Log "=" Info
Write-Host ""
Write-Log "Полезные команды:" Info
Write-Log "  ssh $Server 'cd $remotePath && docker compose logs -f'" Info
Write-Log "  ssh $Server 'cd $remotePath && docker compose ps'" Info
Write-Log "  ssh $Server 'cd $remotePath && docker stats'" Info
