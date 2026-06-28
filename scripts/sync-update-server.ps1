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
    [switch]$Force = $false,

    # Unconditionally rebuild every Docker image and force-recreate every
    # container, regardless of which files changed. Use for a clean "rebuild
    # everything from scratch" deploy (see scripts/recreate-containers.ps1).
    [switch]$ForceRebuild = $false,

    # Fresh-server bootstrap: install Docker, generate missing secrets, upload env
    # files and (optionally) bring up Caddy with automatic SSL. Safe to run against
    # an already-provisioned server too - every step is idempotent.
    [switch]$Provision = $false,
    [string]$Domain = $null,
    [switch]$SkipDockerInstall = $false,
    [switch]$SkipCaddy = $false,
    [switch]$SkipFirewall = $false,

    # Compose stack used on the server. Defaults to the PostgreSQL stack
    # (docker-compose.postgres.yml: db + redis + server + worker + telegram-bot),
    # which is the production database. Pass docker-compose.yml for the legacy
    # SQLite stack. $ApiService/$ApiContainer must match the chosen file's API
    # service/container names (server/fieldworker_server for PG, api/fieldworker-api
    # for SQLite).
    [string]$ComposeFile = "docker-compose.postgres.yml",
    [string]$ApiService = "server",
    [string]$ApiContainer = "fieldworker_server",

    # Bring up the monitoring stack (Prometheus + Grafana + node-exporter) on top
    # of the main stack via docker-compose.monitoring.yml. Ports 9090/3000 are NOT
    # opened in the firewall - reach them over an SSH tunnel or put them behind
    # Caddy with auth. Safe to re-run (idempotent).
    [switch]$Monitoring = $false,
    [string]$MonitoringFile = "docker-compose.monitoring.yml",

    # Open Grafana (3000) and Prometheus (9090) in ufw for direct/test access.
    # Off by default - production should reach Grafana over Caddy with auth, not a
    # raw open port with the default admin password.
    [switch]$OpenMonitoringPorts = $false,

    # Layer the on-demand WireGuard overlay (docker-compose.wireguard.postgres.yml)
    # on top of the main stack so the API container can reach the intercom panel
    # subnet. Threaded into every compose invocation so it survives redeploys.
    # Requires deploy/wireguard/wg-intercom.conf to exist (see deploy/wireguard/README.md).
    [switch]$WireGuard = $false,
    [string]$WireGuardFile = "docker-compose.wireguard.postgres.yml"
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

if ($Provision) {
    # A fresh server has no env files yet, so they always have to be uploaded.
    $IncludeServiceEnvFiles = $true
}

$colors = @{
    Info = "Cyan"
    Success = "Green"
    Warning = "Yellow"
    Error = "Red"
}

# Keep-alive so a flaky network drops the connection in ~1 min instead of
# hanging ssh.exe forever on a half-open socket (Windows OpenSSH has no
# connection multiplexing to fall back on).
$script:SSHKeepAlive = @("-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=4")
$script:RsyncKeepAlive = "-o ServerAliveInterval=15 -o ServerAliveCountMax=4"

$script:SSHArgs = @("-p", "$SSHPort") + $script:SSHKeepAlive
$script:SCPArgs = @("-P", "$SSHPort") + $script:SSHKeepAlive
$script:RsyncShellCommand = "ssh -p $SSHPort $script:RsyncKeepAlive"
$script:ControlPath = $null
$script:UseConnectionSharing = $false

# Compose file args threaded into every remote compose invocation. With
# -WireGuard the on-demand WG overlay is layered on so it survives redeploys
# (the deploy syncs both the overlay and the peer conf to the server).
$script:ComposeFileArgs = "-f $ComposeFile"
if ($WireGuard) {
    $wgConf = Join-Path $LocalPath "deploy/wireguard/wg-intercom.conf"
    if (-not (Test-Path $wgConf)) {
        throw "WireGuard requested but $wgConf is missing. Create it (see deploy/wireguard/README.md) before deploying with -WireGuard."
    }
    $script:ComposeFileArgs += " -f $WireGuardFile"
}

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
    # Windows OpenSSH does not support ControlMaster/ControlPath multiplexing;
    # enabling it only produces a "multiplexing is not supported" warning and a
    # fallback on every command. With key auth there is no password to amortise,
    # so just skip connection sharing on Windows entirely.
    $isWindows = ($PSVersionTable.PSVersion.Major -lt 6) -or $IsWindows
    if ($isWindows) {
        return
    }

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
    $script:SSHArgs = @("-p", "$SSHPort") + $script:SSHKeepAlive
    $script:SCPArgs = @("-P", "$SSHPort") + $script:SSHKeepAlive
    $script:RsyncShellCommand = "ssh -p $SSHPort $script:RsyncKeepAlive"

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
        $outputText = ($result.Output | Out-String).Trim()
        if ([string]::IsNullOrWhiteSpace($outputText)) {
            throw "Remote command failed: $Command"
        }

        throw "Remote command failed: $Command`n$outputText"
    }

    return $result.Output
}

function Test-RemoteFileExists {
    param([string]$Path)

    $result = Invoke-SSH -Command "test -f '$Path'"
    return $result.ExitCode -eq 0
}

function Copy-ServiceEnvFiles {
    # Uploads service env files only when they actually differ from the remote copy
    # (compared by SHA-256) and returns the list of services whose env changed, so
    # the restart step can recreate just those containers instead of rebuilding.
    $envFiles = @(
        @{ Local = (Join-Path $LocalPath "server/.env"); Remote = "$RemotePath/server/.env"; Name = "server/.env"; Service = "server" }
        @{ Local = (Join-Path $LocalPath "bot/.env"); Remote = "$RemotePath/bot/.env"; Name = "bot/.env"; Service = "bot" }
    )

    $changedServices = @()

    foreach ($envFile in $envFiles) {
        if (-not (Test-Path $envFile.Local)) {
            throw "Local env file not found: $($envFile.Local)"
        }

        $localHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $envFile.Local).Hash.ToLower()
        $remoteResult = Invoke-SSH -Command "sha256sum '$($envFile.Remote)' 2>/dev/null | cut -d' ' -f1"
        $remoteHash = ($remoteResult.Output | Out-String).Trim().ToLower()

        if ($localHash -eq $remoteHash) {
            Write-Log "$($envFile.Name) unchanged, skipping upload" "Info"
            continue
        }

        Invoke-Checked -Script {
            scp @script:SCPArgs $envFile.Local "$Server`:$($envFile.Remote)"
        } -ErrorMessage "Failed to upload $($envFile.Name)"

        Write-Log "Uploaded $($envFile.Name)" "Info"
        $changedServices += $envFile.Service
    }

    return $changedServices
}

function Start-PortalBuildJob {
    param([string]$ProjectPath)

    # Validate prerequisites in the foreground so a misconfiguration fails fast,
    # before we background the build and move on to the file sync.
    if (-not (Test-Path $ProjectPath)) {
        throw "Portal project path not found: $ProjectPath"
    }
    if (-not (Test-Path (Join-Path $ProjectPath "package.json"))) {
        throw "portal package.json not found: $ProjectPath"
    }
    if (-not (Test-CommandAvailable "npm")) {
        throw "npm command is not available, cannot build portal"
    }

    Write-Log "Building portal in background (overlapping with file sync)" "Info"

    return Start-Job -ScriptBlock {
        param($p)
        Set-Location $p
        $out = & npm run build 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            throw "Portal build failed:`n$out"
        }
        $out
    } -ArgumentList $ProjectPath
}

function Complete-PortalBuildJob {
    param($Job)

    Write-Log "Waiting for portal build to finish" "Info"
    try {
        Receive-Job -Job $Job -Wait -ErrorAction Stop | Out-Null
    }
    catch {
        Remove-Job -Job $Job -Force -ErrorAction SilentlyContinue
        throw "Portal build failed: $_"
    }
    Remove-Job -Job $Job -Force -ErrorAction SilentlyContinue
    Write-Log "Portal build completed" "Success"
}

function Format-ComposeCommand {
    param([string]$ComposeArgs)

    # Build a compose invocation that works whether the server has the v2 plugin
    # (docker compose) or the legacy v1 binary (docker-compose). Deliberately uses
    # NO embedded double quotes: a 'DC="docker compose"' style shell variable does
    # not survive the Windows ssh.exe -> remote bash quoting round-trip (the quotes
    # get mangled and the variable ends up empty).
    return "if docker compose version >/dev/null 2>&1; then docker compose $script:ComposeFileArgs $ComposeArgs; else docker-compose $script:ComposeFileArgs $ComposeArgs; fi"
}

function Wait-ContainerHealthy {
    param(
        [string]$Container,
        [int]$TimeoutSeconds = 120
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $inspect = "docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $Container 2>/dev/null"

    while ((Get-Date) -lt $deadline) {
        $result = Invoke-SSH -Command $inspect
        $status = ($result.Output | Out-String).Trim()

        switch ($status) {
            "healthy"   { return $true }
            "unhealthy" { return $false }
            "none"      { return $true }  # container has no healthcheck - nothing to gate on
        }

        Start-Sleep -Seconds 3
    }

    return $false
}

function Sync-WithRsync {
    param([string[]]$ExcludeArgs)

    # --out-format='%n' makes rsync print one changed path per line (repo-relative,
    # e.g. server/main.py) so the caller can decide whether a Docker image rebuild
    # is actually required. Directory-only entries (trailing /) are filtered out.
    $output = rsync -az --delete --out-format='%n' @ExcludeArgs -e $script:RsyncShellCommand "$LocalPath/" "$Server`:$RemotePath/"
    if ($LASTEXITCODE -ne 0) {
        throw "rsync failed"
    }

    return @($output | Where-Object { $_ -and ($_ -notmatch '/$') })
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
        Write-Log "Creating deployment archive" "Info"

        Invoke-Checked -Script {
            tar @tarArgs
        } -ErrorMessage "Failed to create deployment archive"

        $archiveSize = (Get-Item $archivePath).Length
        $archiveSizeMB = [math]::Round($archiveSize / 1MB, 1)
        Write-Log "Archive size: ${archiveSizeMB} MB" "Info"

        Write-Log "Uploading archive to server" "Info"
        Invoke-Checked -Script {
            scp @script:SCPArgs $archivePath "$Server`:$remoteArchivePath"
        } -ErrorMessage "Failed to upload deployment archive"

        Write-Log "Cleaning old files on remote" "Info"
        $cleanCommand = "cd $RemotePath 2>/dev/null && find . -maxdepth 1 -mindepth 1 ! -name server ! -name bot ! -name .env -exec rm -rf {} + 2>/dev/null; find server -maxdepth 1 -mindepth 1 ! -name .env ! -name uploads ! -name backups ! -name logs ! -name '*.db' ! -name '*.db-journal' ! -name '*.db-wal' ! -name '*.db-shm' -exec rm -rf {} + 2>/dev/null; find bot -maxdepth 1 -mindepth 1 ! -name .env -exec rm -rf {} + 2>/dev/null; true"
        Invoke-RemoteCommand $cleanCommand | Out-Null

        Write-Log "Extracting on remote" "Info"
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
        Write-Log "Creating portal archive" "Info"

        Invoke-Checked -Script {
            tar -czf $archivePath -C $SourcePath .
        } -ErrorMessage "Failed to create portal deployment archive"

        $archiveSize = (Get-Item $archivePath).Length
        $archiveSizeMB = [math]::Round($archiveSize / 1MB, 1)
        Write-Log "Portal archive size: ${archiveSizeMB} MB" "Info"

        Write-Log "Uploading portal archive" "Info"
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

function Initialize-LocalEnvFiles {
    # Provisioning needs server/.env and bot/.env to exist locally, because the deploy
    # uploads them to the fresh server. The local copy is the single source of truth -
    # it is re-uploaded on every deploy - so the SECRET_KEY is generated INTO it here
    # rather than on the remote (a later env re-upload would otherwise clobber a
    # remote-only key and invalidate every issued JWT).
    $serverEnv = Join-Path $LocalPath "server/.env"
    $serverExample = Join-Path $LocalPath "server/.env.example"
    $botEnv = Join-Path $LocalPath "bot/.env"

    if (-not (Test-Path $serverEnv)) {
        if (Test-Path $serverExample) {
            Copy-Item $serverExample $serverEnv
            Write-Log "Created server/.env from server/.env.example" "Info"
        } else {
            New-Item -ItemType File -Path $serverEnv -Force | Out-Null
            Write-Log "Created empty server/.env" "Warning"
        }
    }

    # Generate a strong SECRET_KEY when the file has none or still carries a known
    # placeholder. Default keys only warn (not fail) but must not reach production.
    $placeholders = @(
        "fieldworker-super-secret-key-change-in-production"
        "your-super-secret-key-change-in-production"
        "your-super-secret-key-here"
    )
    $envLines = @(Get-Content -LiteralPath $serverEnv -ErrorAction SilentlyContinue)
    $secretLine = $envLines | Where-Object { $_ -match '^\s*SECRET_KEY\s*=' } | Select-Object -First 1
    $currentSecret = $null
    if ($secretLine) {
        $currentSecret = ($secretLine -replace '^\s*SECRET_KEY\s*=', '').Trim().Trim('"').Trim("'")
    }

    if (-not $currentSecret -or ($placeholders -contains $currentSecret)) {
        $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
        try {
            $bytes = New-Object byte[] 32
            $rng.GetBytes($bytes)
        } finally {
            $rng.Dispose()
        }
        $hex = -join ($bytes | ForEach-Object { $_.ToString('x2') })

        $kept = $envLines | Where-Object { $_ -notmatch '^\s*SECRET_KEY\s*=' }
        $newContent = @($kept) + "SECRET_KEY=$hex"
        Set-Content -LiteralPath $serverEnv -Value $newContent -Encoding UTF8
        Write-Log "Generated a new SECRET_KEY and saved it to server/.env" "Success"
    } else {
        Write-Log "server/.env already has a custom SECRET_KEY" "Info"
    }

    # За Caddy (домен задан) приложение видит IP клиента только через
    # X-Forwarded-For, поэтому включаем доверие к прокси-заголовкам, иначе бан
    # по IP и rate limit будут считать всех за один адрес.
    if ($Domain) {
        $serverLines = @(Get-Content -LiteralPath $serverEnv -ErrorAction SilentlyContinue)
        $hasTrust = $serverLines | Where-Object { $_ -match '^\s*TRUST_PROXY_HEADERS\s*=' }
        if (-not $hasTrust) {
            $serverLines += "TRUST_PROXY_HEADERS=true"
            Set-Content -LiteralPath $serverEnv -Value $serverLines -Encoding UTF8
            Write-Log "Enabled TRUST_PROXY_HEADERS=true in server/.env (behind Caddy)" "Info"
        }
    }

    if (-not (Test-Path $botEnv)) {
        $botExample = Join-Path $LocalPath "bot/.env.example"
        if (Test-Path $botExample) {
            Copy-Item $botExample $botEnv
            Write-Log "Created bot/.env from bot/.env.example - fill in TELEGRAM_BOT_TOKEN before the bot can run" "Warning"
        } else {
            New-Item -ItemType File -Path $botEnv -Force | Out-Null
            Write-Log "Created empty bot/.env - fill in TELEGRAM_BOT_TOKEN before the bot can run" "Warning"
        }
    }
}

function Install-RemoteDocker {
    Write-Log "Checking Docker on the server" "Info"
    $check = Invoke-SSH -Command "command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && echo installed"
    if (($check.Output | Out-String).Trim() -eq "installed") {
        Write-Log "Docker and Compose plugin already present" "Info"
        return
    }

    Write-Log "Installing Docker via get.docker.com (this can take a few minutes)" "Info"
    # The official convenience script installs the engine and the compose v2 plugin
    # on Debian/Ubuntu (and most other distros) in one shot.
    $install = "curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sh /tmp/get-docker.sh && rm -f /tmp/get-docker.sh && systemctl enable --now docker"
    Invoke-RemoteCommand $install | Out-Null

    $verify = Invoke-SSH -Command "docker compose version >/dev/null 2>&1 && echo ok"
    if (($verify.Output | Out-String).Trim() -ne "ok") {
        throw "Docker was installed but 'docker compose' is still unavailable. Check the server manually."
    }
    Write-Log "Docker installed" "Success"
}

function Set-RemoteFirewall {
    Write-Log "Configuring firewall (ufw): allowing SSH/$SSHPort, 80, 443" "Info"

    # The SSH port is allowed BEFORE 'enable' so we never lock ourselves out. The
    # whole sequence runs as one SSH command, so even if 'enable' drops existing
    # connections the allow rule is already active and the next call reconnects.
    #
    # NOTE: Docker publishes the API port (8001) straight into iptables and ufw does
    # NOT filter Docker-published ports. With the recommended Caddy setup that is fine
    # (8001 only needs to be reachable from localhost); to actually close it off, bind
    # the port to 127.0.0.1 in docker-compose.yml.
    $cmd = @(
        "command -v ufw >/dev/null 2>&1 || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw; }"
        "ufw allow $SSHPort/tcp"
        "ufw allow 80/tcp"
        "ufw allow 443/tcp"
        "ufw default deny incoming"
        "ufw default allow outgoing"
        "ufw --force enable"
    ) -join " && "

    Invoke-RemoteCommand $cmd | Out-Null
    Write-Log "Firewall enabled (open ports: $SSHPort, 80, 443)" "Success"
}

function Enable-CaddySSL {
    param([string]$DomainName)

    if (-not (Test-RemoteFileExists "$RemotePath/Caddyfile")) {
        throw "Caddyfile not found at $RemotePath/Caddyfile (the file sync step must run before Caddy setup)"
    }
    if (-not (Test-RemoteFileExists "$RemotePath/docker-compose.caddy.yml")) {
        throw "docker-compose.caddy.yml not found at $RemotePath"
    }

    # Caddy binds host ports 80/443; a distro nginx (or anything else on those ports)
    # would conflict. Stop a system nginx if one happens to be running.
    Invoke-SSH -Command "systemctl is-active --quiet nginx && systemctl disable --now nginx" | Out-Null

    # DOMAIN must be exported into the shell so both the compose plugin and the legacy
    # binary (and the Caddyfile's {`$DOMAIN} placeholder) pick it up.
    $composeUp = Format-ComposeCommand "-f docker-compose.caddy.yml up -d"
    $command = "cd $RemotePath && export DOMAIN='$DomainName' && $composeUp"
    Invoke-RemoteCommand $command | Out-Null
    Write-Log "Caddy started for $DomainName (Let's Encrypt issues the certificate on first request)" "Success"
}

function Enable-Monitoring {
    if (-not (Test-RemoteFileExists "$RemotePath/$MonitoringFile")) {
        throw "$MonitoringFile not found at $RemotePath (the file sync step must run before monitoring setup)"
    }

    # Merge the monitoring compose with the main stack so Prometheus shares its
    # network and can scrape the api service and node-exporter by name.
    # --force-recreate: the archive sync deletes and re-extracts monitoring/ on
    # every deploy, which leaves the running Grafana/Prometheus bind-mounts
    # pointing at the old (removed) directory. Recreating re-binds the fresh dir
    # so provisioned dashboards and prometheus.yml are always current.
    $composeUp = Format-ComposeCommand "-f $MonitoringFile up -d --force-recreate"
    Invoke-RemoteCommand "cd $RemotePath && $composeUp" | Out-Null
    Write-Log "Monitoring stack up (Prometheus :9090, Grafana :3000, node-exporter)" "Success"

    if ($OpenMonitoringPorts) {
        Invoke-RemoteCommand "command -v ufw >/dev/null 2>&1 && ufw allow 3000/tcp && ufw allow 9090/tcp || true" | Out-Null
        Write-Log "Opened ufw 3000 (Grafana) and 9090 (Prometheus) for direct access" "Warning"
        Write-Log "Grafana login is admin/admin by default - change GRAFANA_PASSWORD before exposing publicly" "Warning"
    } else {
        Write-Log "Ports 9090/3000 are NOT opened in ufw - reach Grafana via SSH tunnel: ssh -p $SSHPort -L 3000:localhost:3000 $Server" "Warning"
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

$deployStart = Get-Date

$script:ChangedFiles = @()
$script:ChangedEnvServices = @()
$portalBuildJob = $null

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
    if ($Provision) {
        Write-Log "Provision mode: fresh-server bootstrap enabled" "Warning"
        if ($Domain) {
            Write-Log "Caddy/SSL domain: $Domain" "Info"
        } elseif (-not $SkipCaddy) {
            Write-Log "No -Domain supplied; reverse proxy / SSL will be skipped" "Warning"
        }
        # Local env files are the source of truth for the upload; make sure they exist
        # and carry a real SECRET_KEY before anything is sent to the server.
        Initialize-LocalEnvFiles
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

    if ($Provision -and -not $SkipDockerInstall) {
        Install-RemoteDocker
    }

    if ($Provision -and -not $SkipFirewall) {
        Set-RemoteFirewall
    }

    $buildPortalInline = $false

    if (-not $SkipPortalSync -and -not $SkipPortalBuild) {
        if ($DryRun) {
            Write-Log "Skipping automatic portal build in dry run" "Warning"
        } elseif (-not $SkipSync) {
            # Overlap the portal build with the server file sync that runs below.
            # Safe because portal/dist is excluded from the main sync (it is
            # delivered separately by the portal sync step).
            $portalBuildJob = Start-PortalBuildJob -ProjectPath $script:PortalProjectPath
        } else {
            # No server file sync to overlap with - just build inline.
            $buildPortalInline = $true
        }
    } elseif ($SkipPortalBuild) {
        Write-Log "Skipping automatic portal build" "Warning"
    }

    if ($buildPortalInline) {
        Invoke-PortalBuild -ProjectPath $script:PortalProjectPath
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
            "server/uploads/apk/*"
            "server/uploads/avatars/*"
            "server/uploads/chat/*"
            "server/uploads/address_documents/*"
            "server/logs"
            "server/backups"
            ".DS_Store"
            "app/src"
            "portal/src"
            "portal/screenshots"
            "portal/dist"
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
                $script:ChangedFiles = @(Sync-WithRsync -ExcludeArgs $rsyncExcludeArgs)
                Write-Log "Files synchronized ($($script:ChangedFiles.Count) item(s) updated)" "Success"
            } else {
                Sync-WithArchive -ExcludePatterns $excludePatterns
                Write-Log "Files synchronized" "Success"
            }
        }
    } else {
        Write-Log "Skipping file sync" "Warning"
    }

    # The background portal build must finish before we read portal/dist below.
    if ($portalBuildJob) {
        Complete-PortalBuildJob -Job $portalBuildJob
        $portalBuildJob = $null
    }

    if (-not $SkipPortalSync) {
        if (-not (Test-Path $PortalLocalPath)) {
            throw "Portal build path not found: $PortalLocalPath. Build portal first (cd portal; npm run build) or use -SkipPortalSync."
        }

        # dist goes to two places: the standalone web root and the path the api
        # container bind-mounts (./portal/dist in docker-compose.yml).
        $portalDestinations = @($PortalRemotePath, "$RemotePath/portal/dist")

        if ($DryRun) {
            Write-Log "Portal sync step: $syncMode -> $($portalDestinations -join ', ')" "Info"
        } else {
            foreach ($portalDest in $portalDestinations) {
                Write-Log "Syncing portal files to $portalDest" "Info"

                if ($syncMode -eq "rsync") {
                    Sync-PortalWithRsync -SourcePath $PortalLocalPath -DestinationPath $portalDest
                } else {
                    Sync-PortalWithArchive -SourcePath $PortalLocalPath -DestinationPath $portalDest
                }
            }

            Write-Log "Portal files synchronized" "Success"
        }
    } else {
        Write-Log "Skipping portal sync" "Warning"
    }

    if ($IncludeServiceEnvFiles -and -not $DryRun) {
        Write-Log "Checking service env files" "Info"
        $script:ChangedEnvServices = @(Copy-ServiceEnvFiles)
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

        # Decide whether a Docker image rebuild is actually needed. The api service
        # bind-mounts ./server into the container (docker-compose.yml), so plain
        # Python code changes are picked up by recreating the container from the
        # existing image - no rebuild. A rebuild is only required when the image
        # contents change: server/requirements.txt, server/Dockerfile, or any bot/
        # file (the bot bakes its code into the image and has no bind mount).
        $rebuildRequired = $false
        $apiCodeChanged = $false

        if ($ForceRebuild) {
            # Explicit full rebuild requested - skip change detection entirely.
            $rebuildRequired = $true
        } elseif ($SkipSync -or $syncMode -ne "rsync") {
            # No reliable list of changed files - rebuild to stay safe.
            $rebuildRequired = $true
        } else {
            foreach ($changed in $script:ChangedFiles) {
                if ($changed -match '^server/requirements\.txt$' -or
                    $changed -match '^server/Dockerfile$' -or
                    $changed -match '^bot/') {
                    $rebuildRequired = $true
                } elseif ($changed -match '^server/') {
                    $apiCodeChanged = $true
                }
            }
        }

        $serverEnvChanged = $script:ChangedEnvServices -contains "server"
        $botEnvChanged = $script:ChangedEnvServices -contains "bot"

        # NOTE: no --remove-orphans here. Only docker-compose.yml (api, telegram-bot)
        # is loaded, but other services in this project (notably fieldworker-caddy,
        # defined in docker-compose.caddy.yml) run from separate compose files. With
        # --remove-orphans they would be treated as orphans and destroyed.
        if ($rebuildRequired) {
            # Build new images while the old containers keep running, then recreate.
            # With -ForceRebuild we additionally --force-recreate so EVERY container
            # is replaced even if its image/config did not change; otherwise compose
            # only recreates services whose image was actually rebuilt.
            if ($ForceRebuild) {
                Write-Log "Force rebuilding images and recreating all containers" "Info"
                Invoke-RemoteCommand "cd $RemotePath && $(Format-ComposeCommand 'up -d --build --force-recreate')" | Out-Null
            } else {
                Write-Log "Rebuilding and recreating containers" "Info"
                Invoke-RemoteCommand "cd $RemotePath && $(Format-ComposeCommand 'up -d --build')" | Out-Null
            }
        } else {
            # Fast path - no image rebuild. First ensure everything is up (this also
            # builds any missing image, e.g. on a first deploy), then force-recreate
            # only the services whose bind-mounted code or env file changed.
            $recreateApi = $apiCodeChanged -or $serverEnvChanged
            $recreateBot = $botEnvChanged

            $fastCommand = "cd $RemotePath && $(Format-ComposeCommand 'up -d')"
            if ($recreateApi) {
                $fastCommand += " && $(Format-ComposeCommand "up -d --force-recreate --no-build $ApiService")"
            }
            if ($recreateBot) {
                $fastCommand += " && $(Format-ComposeCommand 'up -d --force-recreate --no-build telegram-bot')"
            }

            if ($recreateApi -or $recreateBot) {
                Write-Log "Recreating changed services without rebuild" "Info"
            } else {
                Write-Log "No image rebuild needed; ensuring containers are up" "Info"
            }
            Invoke-RemoteCommand $fastCommand | Out-Null
        }

        # Gate the deploy on the API healthcheck so a broken start fails loudly
        # instead of reporting a green 'ps' over a dead container.
        Write-Log "Waiting for API healthcheck" "Info"
        if (Wait-ContainerHealthy -Container $ApiContainer -TimeoutSeconds 120) {
            Write-Log "API is healthy" "Success"
        } else {
            throw "API did not become healthy within 120s. Check logs: ssh -p $SSHPort $Server 'cd $RemotePath && docker compose -f $ComposeFile logs --tail=100 $ApiService'"
        }

        Write-Log "Container status" "Info"
        Invoke-RemoteCommand "cd $RemotePath && $(Format-ComposeCommand 'ps')"
    } elseif ($DryRun) {
        Write-Log "Skipping container update in dry run" "Warning"
    } else {
        Write-Log "Skipping container update" "Warning"
    }

    if ($Provision -and -not $SkipCaddy -and -not $DryRun) {
        if ($Domain) {
            Write-Log "Setting up Caddy reverse proxy with automatic SSL" "Info"
            Enable-CaddySSL -DomainName $Domain
        } else {
            Write-Log "Skipping Caddy/SSL setup (no -Domain supplied)" "Warning"
        }
    }

    if ($Monitoring -and -not $DryRun) {
        Write-Log "Setting up monitoring stack (Prometheus + Grafana + node-exporter)" "Info"
        Enable-Monitoring
    }

    $deployDuration = (Get-Date) - $deployStart
    $durationStr = "{0:mm\:ss}" -f $deployDuration
    Write-Log "Deployment completed in $durationStr" "Success"
    if ($Provision -and $Domain -and -not $SkipCaddy -and -not $DryRun) {
        Write-Log "Portal:  https://$Domain/portal/" "Success"
        Write-Log "Health:  https://$Domain/health" "Success"
    }
    Write-Log "Check status: ssh -p $SSHPort $Server 'cd $RemotePath && docker compose -f $ComposeFile ps'" "Info"
    Write-Log "View logs: ssh -p $SSHPort $Server 'cd $RemotePath && docker compose -f $ComposeFile logs -f'" "Info"
}
finally {
    if ($portalBuildJob) {
        Stop-Job -Job $portalBuildJob -ErrorAction SilentlyContinue
        Remove-Job -Job $portalBuildJob -Force -ErrorAction SilentlyContinue
    }
    Close-SSHTransport
}