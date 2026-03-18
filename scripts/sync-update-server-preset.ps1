$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

$server = "root@185.121.232.130"
$remotePath = "/opt/fieldworker"
$sshPort = 22
$sshKeyPath = Join-Path $HOME ".ssh\fieldworker_deploy"

powershell -ExecutionPolicy Bypass -File "$scriptDir/sync-update-server.ps1" `
    -Server $server `
    -LocalPath $rootDir `
    -RemotePath $remotePath `
    -SSHPort $sshPort `
    -SshKeyPath $sshKeyPath `
    -IncludeServiceEnvFiles `
    -Force