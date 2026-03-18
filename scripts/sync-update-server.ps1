param(
    [string]$Server = $null,

    [string]$LocalPath = $null,
    [string]$RemotePath = "/opt/fieldworker",
    [string]$PortalLocalPath = $null,
    [string]$PortalRemotePath = "/var/www/fw",
    [int]$SSHPort = 22,
    [string]$SshKeyPath = $null,
    [switch]$SkipSync = $false,
    [switch]$SkipPortalBuild = $false,
    [switch]$SkipPortalSync = $false,
    [switch]$SkipRestart = $false,
    [switch]$IncludeServiceEnvFiles = $false,
    [switch]$DryRun = $false,
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $false
}

if (-not $LocalPath) {
    $LocalPath = Split-Path -Parent $PSScriptRoot
}

if (-not $PortalLocalPath) {
    $PortalLocalPath = Join-Path $LocalPath "portal/dist"
}

$script:PortalProjectPath = Split-Path -Parent $PortalLocalPath

if (-not $SshKeyPath) {
    $defaultKeyPath = Join-Path $HOME ".ssh\fieldworker_deploy"
    if (Test-Path $defaultKeyPath) {
        $SshKeyPath = $defaultKeyPath
    }
}

if (-not $Server) {
    $Server = Read-Host "SSH server (for example root@185.121.232.130)"
    if (-not $Server) {
        throw "Server is required"
    }
}

$colors = @{
    Info = "Cyan"
    Success = "Green"
    Warning = "Yellow"
    Error = "Red"
}

$script:SSHArgs = @("-p", "$SSHPort")
$script:SCPArgs = @("-P", "$SSHPort")
$script:RsyncShellCommand = "ssh -p $SSHPort"
$script:ControlPath = $null
$script:UseConnectionSharing = $false

if ($SshKeyPath) {
    if (-not (Test-Path $SshKeyPath)) {
        throw "SSH key file not found: $SshKeyPath"
    }

    $script:SSHArgs += @("-i", $SshKeyPath)
    $script:SCPArgs += @("-i", $SshKeyPath)
    $script:RsyncShellCommand += " -i $($SshKeyPath -replace '\\', '/')"
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "Info"
    )

    $color = $colors[$Level]
    if ($null -eq $color) {
        $color = "White"
    }

    Write-Host "[$([DateTime]::Now.ToString('HH:mm:ss'))] " -NoNewline
    Write-Host $Message -ForegroundColor $color
}

function Test-CommandAvailable {
    param([string]$Name)

    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-PortalBuild {
    param([string]$ProjectPath)

    if (-not (Test-Path $ProjectPath)) {
        throw "Portal project path not found: $ProjectPath"
    }

    if (-not (Test-Path (Join-Path $ProjectPath "package.json"))) {
        throw "portal package.json not found: $ProjectPath"
    }

    if (-not (Test-CommandAvailable "npm")) {
        throw "npm command is not available, cannot build portal"
    }

    Write-Log "Building portal locally" "Info"

    Push-Location $ProjectPath
    try {
        Invoke-Checked -Script {
            npm run build
        } -ErrorMessage "Portal build failed"
    }
    finally {
        Pop-Location
    }

    Write-Log "Portal build completed" "Success"
}

function Initialize-SSHTransport {
    $safeServer = $Server -replace "[^a-zA-Z0-9._-]", "_"
    $script:ControlPath = Join-Path $env:TEMP "fieldworker-ssh-$safeServer-$SSHPort.sock"
    $connectionSharingArgs = @(
        "-o", "ControlMaster=auto",
        "-o", "ControlPersist=600",
        "-o", "ControlPath=$script:ControlPath"
    )

    $script:SSHArgs += $connectionSharingArgs
    $script:SCPArgs += $connectionSharingArgs
    $script:RsyncShellCommand += " -o ControlMaster=auto -o ControlPersist=600 -o ControlPath=$($script:ControlPath -replace '\\', '/')"
    $script:UseConnectionSharing = $true
}

function Disable-SSHConnectionSharing {
    $script:SSHArgs = @("-p", "$SSHPort")
    $script:SCPArgs = @("-P", "$SSHPort")
    $script:RsyncShellCommand = "ssh -p $SSHPort"

    if ($SshKeyPath) {
        $script:SSHArgs += @("-i", $SshKeyPath)
        $script:SCPArgs += @("-i", $SshKeyPath)
        $script:RsyncShellCommand += " -i $($SshKeyPath -replace '\\', '/')"
    }

    $script:ControlPath = $null
    $script:UseConnectionSharing = $false
}

function Close-SSHTransport {
    if (-not $script:UseConnectionSharing) {
        return
    }

    try {
        & ssh @script:SSHArgs -O exit $Server 2>$null | Out-Null
    }
    catch {
    }
}

function Get-SyncMode {
    if (Test-CommandAvailable "rsync") {
        return "rsync"
    }

    if ((Test-CommandAvailable "scp") -and (Test-CommandAvailable "tar")) {
        return "archive"
    }

    return $null
}

function Invoke-Checked {
    param(
        [scriptblock]$Script,
        [string]$ErrorMessage
    )

    & $Script
    if ($LASTEXITCODE -ne 0) {
        throw $ErrorMessage
    }
}

function Invoke-SSH {
    param(
        [string]$Command,
        [switch]$AllowFallback
    )

    try {
        $output = & ssh @script:SSHArgs $Server $Command 2>&1
        $exitCode = $LASTEXITCODE
    }
    catch {
        if (-not $AllowFallback -or -not $script:UseConnectionSharing) {
            throw
        }

        Write-Log "SSH multiplexing is not supported here, using standard SSH" "Warning"
        Disable-SSHConnectionSharing
        $output = & ssh @script:SSHArgs $Server $Command 2>&1
        $exitCode = $LASTEXITCODE
    }

    if ($exitCode -ne 0 -and $AllowFallback -and $script:UseConnectionSharing) {
        Write-Log "SSH multiplexing failed, retrying with standard SSH" "Warning"
        Disable-SSHConnectionSharing
        $output = & ssh @script:SSHArgs $Server $Command 2>&1
        $exitCode = $LASTEXITCODE
    }

    if ($exitCode -ne 0 -and $AllowFallback) {
        $outputText = $output | Out-String
        if ($outputText -match "Bad configuration option|unknown option|unsupported option|getsockname failed|ControlPath") {
            $output = & ssh @script:SSHArgs $Server $Command 2>&1
            $exitCode = $LASTEXITCODE
        }
    }

    return @{
        ExitCode = $exitCode
        Output = $output
    }
}

function Invoke-RemoteCommand {
    param([string]$Command)

    $result = Invoke-SSH -Command "($Command) 2>&1"
    if ($result.ExitCode -ne 0) {
        throw "Remote command failed: $Command"
    }

    return $result.Output
}

function Test-RemoteFileExists {
    param([string]$Path)

    $result = Invoke-SSH -Command "test -f '$Path'"
    return $result.ExitCode -eq 0
}

function Copy-ServiceEnvFiles {
    $envFiles = @(
        @{ Local = (Join-Path $LocalPath "server/.env"); Remote = "$RemotePath/server/.env"; Name = "server/.env" }
        @{ Local = (Join-Path $LocalPath "bot/.env"); Remote = "$RemotePath/bot/.env"; Name = "bot/.env" }
    )

    foreach ($envFile in $envFiles) {
        if (-not (Test-Path $envFile.Local)) {
            throw "Local env file not found: $($envFile.Local)"
        }

        Invoke-Checked -Script {
            scp @script:SCPArgs $envFile.Local "$Server`:$($envFile.Remote)"
        } -ErrorMessage "Failed to upload $($envFile.Name)"
    }
}

function Sync-WithRsync {
    param([string[]]$ExcludeArgs)

    Invoke-Checked -Script {
        rsync -avz --delete @ExcludeArgs -e $script:RsyncShellCommand "$LocalPath/" "$Server`:$RemotePath/"
    } -ErrorMessage "rsync failed"
}

function Sync-WithArchive {
    param([string[]]$ExcludePatterns)

    $timestamp = Get-Date -Format "yyyyMMddHHmmss"
    $archivePath = Join-Path $env:TEMP "fieldworker-deploy-$timestamp.tar.gz"
    $remoteArchivePath = "/tmp/fieldworker-deploy-$timestamp.tar.gz"
    $tarArgs = @("-czf", $archivePath)

    foreach ($pattern in $ExcludePatterns) {
        $tarArgs += "--exclude=$pattern"
    }

    $tarArgs += @("-C", $LocalPath, ".")

    try {
        Write-Log "rsync not found, using tar+scp fallback" "Warning"

        Invoke-Checked -Script {
            tar @tarArgs
        } -ErrorMessage "Failed to create deployment archive"

        Invoke-Checked -Script {
            scp @script:SCPArgs $archivePath "$Server`:$remoteArchivePath"
        } -ErrorMessage "Failed to upload deployment archive"

        $extractCommand = "mkdir -p $RemotePath && tar -xzf $remoteArchivePath -C $RemotePath && rm -f $remoteArchivePath"
        Invoke-RemoteCommand $extractCommand | Out-Null
    }
    finally {
        if (Test-Path $archivePath) {
            Remove-Item $archivePath -Force -ErrorAction SilentlyContinue
        }
    }
}

function Sync-PortalWithRsync {
    param(
        [string]$SourcePath,
        [string]$DestinationPath
    )

    $resolvedSourcePath = (Resolve-Path $SourcePath).Path -replace '\\', '/'

    Invoke-RemoteCommand "mkdir -p $DestinationPath" | Out-Null

    Invoke-Checked -Script {
        rsync -avz --delete -e $script:RsyncShellCommand "$resolvedSourcePath/./" "$Server`:$DestinationPath/"
    } -ErrorMessage "portal rsync failed"
}

function Sync-PortalWithArchive {
    param(
        [string]$SourcePath,
        [string]$DestinationPath
    )

    $timestamp = Get-Date -Format "yyyyMMddHHmmss"
    $archivePath = Join-Path $env:TEMP "fieldworker-portal-$timestamp.tar.gz"
    $remoteArchivePath = "/tmp/fieldworker-portal-$timestamp.tar.gz"

    try {
        Write-Log "rsync not found, using tar+scp fallback for portal dist" "Warning"

        Invoke-Checked -Script {
            tar -czf $archivePath -C $SourcePath .
        } -ErrorMessage "Failed to create portal deployment archive"

        Invoke-Checked -Script {
            scp @script:SCPArgs $archivePath "$Server`:$remoteArchivePath"
        } -ErrorMessage "Failed to upload portal deployment archive"

        $extractCommand = "mkdir -p $DestinationPath && find $DestinationPath -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -xzf $remoteArchivePath -C $DestinationPath && rm -f $remoteArchivePath"
        Invoke-RemoteCommand $extractCommand | Out-Null
    }
    finally {
        if (Test-Path $archivePath) {
            Remove-Item $archivePath -Force -ErrorAction SilentlyContinue
        }
    }
}

if (-not (Test-Path $LocalPath)) {
    throw "Local path not found: $LocalPath"
}

if (-not (Test-CommandAvailable "ssh")) {
    throw "ssh command is not available"
}

Initialize-SSHTransport

$syncMode = $null
if (-not $SkipSync -or -not $SkipPortalSync) {
    $syncMode = Get-SyncMode
    if ($null -eq $syncMode) {
        throw "Neither rsync nor the scp+tar fallback is available"
    }
}

try {
    Write-Log "Connecting to $Server" "Info"
    $connection = Invoke-SSH -Command "echo connected" -AllowFallback
    if ($connection.ExitCode -ne 0) {
        throw "SSH connection failed"
    }

    Write-Log "Target: $RemotePath" "Info"
    if (-not $SkipPortalSync) {
        Write-Log "Portal target: $PortalRemotePath" "Info"
    }
    if ($DryRun) {
        Write-Log "Dry run mode enabled" "Warning"
    }

    Write-Log "Preparing remote directory" "Info"
    Invoke-RemoteCommand "mkdir -p $RemotePath" | Out-Null
    if (-not $SkipPortalSync) {
        Invoke-RemoteCommand "mkdir -p $PortalRemotePath" | Out-Null
    }

    if (-not $Force) {
        $answer = Read-Host "Continue deployment? Type yes"
        if ($answer -ne "yes") {
            Write-Log "Deployment cancelled" "Warning"
            return
        }
    }

    if (-not $SkipPortalSync -and -not $SkipPortalBuild) {
        if ($DryRun) {
            Write-Log "Skipping automatic portal build in dry run" "Warning"
        } else {
            Invoke-PortalBuild -ProjectPath $script:PortalProjectPath
        }
    } elseif ($SkipPortalBuild) {
        Write-Log "Skipping automatic portal build" "Warning"
    }

    if (-not $SkipSync) {
        $excludePatterns = @(
            ".git"
            ".env"
            "venv"
            "node_modules"
            "__pycache__"
            ".pytest_cache"
            "*.pyc"
            ".idea"
            ".gradle"
            "build"
            "app/build"
            "*.db"
            ".wwebjs_auth"
            ".wwebjs_cache"
            "server/uploads/photos/*"
            "server/logs"
            "*.apk"
            ".DS_Store"
        )

        $rsyncExcludeArgs = foreach ($pattern in $excludePatterns) {
            "--exclude=$pattern"
        }

        if ($DryRun) {
            Write-Log "Sync step: $syncMode" "Info"
            if ($syncMode -eq "archive") {
                Write-Log "Archive fallback does not remove deleted remote files" "Warning"
            }
        } else {
            Write-Log "Syncing files via $syncMode" "Info"

            if ($syncMode -eq "rsync") {
                Sync-WithRsync -ExcludeArgs $rsyncExcludeArgs
            } else {
                Sync-WithArchive -ExcludePatterns $excludePatterns
            }

            Write-Log "Files synchronized" "Success"
        }
    } else {
        Write-Log "Skipping file sync" "Warning"
    }

    if (-not $SkipPortalSync) {
        if (-not (Test-Path $PortalLocalPath)) {
            throw "Portal build path not found: $PortalLocalPath. Build portal first (cd portal; npm run build) or use -SkipPortalSync."
        }

        if ($DryRun) {
            Write-Log "Portal sync step: $syncMode" "Info"
        } else {
            Write-Log "Syncing portal files to $PortalRemotePath" "Info"

            if ($syncMode -eq "rsync") {
                Sync-PortalWithRsync -SourcePath $PortalLocalPath -DestinationPath $PortalRemotePath
            } else {
                Sync-PortalWithArchive -SourcePath $PortalLocalPath -DestinationPath $PortalRemotePath
            }

            Write-Log "Portal files synchronized" "Success"
        }
    } else {
        Write-Log "Skipping portal sync" "Warning"
    }

    if ($IncludeServiceEnvFiles -and -not $DryRun) {
        Write-Log "Uploading service env files" "Info"
        Copy-ServiceEnvFiles
    } elseif ($IncludeServiceEnvFiles) {
        Write-Log "Skipping service env upload in dry run" "Warning"
    }

    if (-not $SkipRestart -and -not $DryRun) {
        $requiredRemoteFiles = @(
            "$RemotePath/server/.env"
            "$RemotePath/bot/.env"
        )
        $missingRemoteFiles = @()

        foreach ($requiredRemoteFile in $requiredRemoteFiles) {
            if (-not (Test-RemoteFileExists $requiredRemoteFile)) {
                $missingRemoteFiles += $requiredRemoteFile
            }
        }

        if ($missingRemoteFiles.Count -gt 0) {
            throw "Missing remote env files: $($missingRemoteFiles -join ', '). Use -IncludeServiceEnvFiles or create them manually on the server."
        }

        $downCommand = "cd $RemotePath && (docker compose down || docker-compose down)"
        $cleanupCommand = "docker rm -f fieldworker-api fieldworker-telegram 2>/dev/null || true"
        $composeCommand = "cd $RemotePath && (docker compose up -d --build || docker-compose up -d --build)"
        $statusCommand = "cd $RemotePath && (docker compose ps || docker-compose ps)"

        Write-Log "Stopping existing containers" "Info"
        Invoke-RemoteCommand $downCommand | Out-Null

        Write-Log "Cleaning stale named containers" "Info"
        Invoke-RemoteCommand $cleanupCommand | Out-Null

        Write-Log "Updating containers" "Info"
        Invoke-RemoteCommand $composeCommand | Out-Null

        Write-Log "Container status" "Info"
        Invoke-RemoteCommand $statusCommand
    } elseif ($DryRun) {
        Write-Log "Skipping container update in dry run" "Warning"
    } else {
        Write-Log "Skipping container update" "Warning"
    }

    Write-Log "Deployment completed" "Success"
    Write-Log "Check status: ssh -p $SSHPort $Server 'cd $RemotePath && docker compose ps'" "Info"
    Write-Log "View logs: ssh -p $SSHPort $Server 'cd $RemotePath && docker compose logs -f'" "Info"
}
finally {
    Close-SSHTransport
}