#!/usr/bin/env powershell
# GitHub Push Script - публикация проекта на GitHub
# Использование: .\push-to-github.ps1 -Username "ваш_логин_гитхаб" -Repository "FieldWorker"

param(
    [string]$Username = "your-github-username",
    [string]$Repository = "FieldWorker",
    [string]$Token = ""
)

Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                  GitHub Push Script                          ║" -ForegroundColor Cyan
Write-Host "║           Публикация проекта FieldWorker на GitHub           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Проверяем, что мы в нужной директории
$projectPath = "C:\Users\VADIM\Documents\MyJobInMap"
if (-not (Test-Path "$projectPath\.git")) {
    Write-Host "❌ Ошибка: Git репозиторий не найден в $projectPath" -ForegroundColor Red
    exit 1
}

Set-Location $projectPath
Write-Host "✓ Проект найден в: $projectPath" -ForegroundColor Green

# Проверяем текущий статус
Write-Host ""
Write-Host "📋 Статус репозитория:" -ForegroundColor Yellow
git status --short | Select-Object -First 10
Write-Host ""

# Проверяем, есть ли удалённый репозиторий
$remotes = git remote -v
if ($remotes -like "*origin*") {
    Write-Host "✓ Удалённый репозиторий уже добавлен:" -ForegroundColor Green
    git remote -v | Where-Object { $_ -like "*origin*" }
} else {
    Write-Host "⚙️ Добавляем удалённый репозиторий..." -ForegroundColor Yellow
    
    # Используем HTTPS
    $remoteUrl = "https://github.com/$Username/$Repository.git"
    Write-Host "   URL: $remoteUrl" -ForegroundColor Cyan
    
    git remote add origin $remoteUrl
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Удалённый репозиторий добавлен" -ForegroundColor Green
    } else {
        Write-Host "❌ Ошибка при добавлении удалённого репозитория" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "📤 Отправляем код на GitHub..." -ForegroundColor Yellow

# Переименовываем ветку master → main (если нужно)
$branch = git rev-parse --abbrev-ref HEAD
Write-Host "   Текущая ветка: $branch" -ForegroundColor Cyan

if ($branch -eq "master") {
    Write-Host "   Переименовываем ветку: master → main" -ForegroundColor Yellow
    git branch -M main
}

# Отправляем на GitHub
Write-Host "   Выполняем: git push -u origin main" -ForegroundColor Cyan
Write-Host ""

if ($Token) {
    # Если передан токен
    $env:GIT_ASKPASS_OVERRIDE = $true
    git push -u origin main
} else {
    # Интерактивный режим (потребует ввода)
    git push -u origin main
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║                   ✓ УСПЕШНО ОПУБЛИКОВАНО!                   ║" -ForegroundColor Green
    Write-Host "║                                                              ║" -ForegroundColor Green
    Write-Host "║   Репозиторий: https://github.com/$Username/$Repository" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "📚 Документация:" -ForegroundColor Yellow
    Write-Host "   • README.md - основной гайд"
    Write-Host "   • GETTING_STARTED.md - быстрый старт"
    Write-Host "   • GITHUB_SETUP.md - подробная инструкция"
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ ОШИБКА при отправке на GitHub!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Рекомендации:" -ForegroundColor Yellow
    Write-Host "1. Убедитесь, что репозиторий создан на GitHub:"
    Write-Host "   https://github.com/new"
    Write-Host ""
    Write-Host "2. Если используете HTTPS, нужен Personal Access Token:"
    Write-Host "   https://github.com/settings/tokens"
    Write-Host ""
    Write-Host "3. Проверьте, что вы можно подключиться к GitHub:"
    Write-Host "   git ls-remote https://github.com/$Username/$Repository.git"
    Write-Host ""
    exit 1
}
