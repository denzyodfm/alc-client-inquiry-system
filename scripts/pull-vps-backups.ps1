param(
  [string]$VpsUser = "agusanlending",
  [string]$VpsHost = "172.16.0.250",
  [string]$RemoteBackupDir = "/home/agusanlending/alc-client-inquiry-system/backups",
  [string]$LocalBackupDir = "C:\Users\Dennis\Desktop\ALC-client-inquiry-system\backups"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $LocalBackupDir | Out-Null

$remoteHost = "${VpsUser}@${VpsHost}"
Write-Host "Checking VPS backups at ${remoteHost}:${RemoteBackupDir}"

$remoteFolders = @(& ssh $remoteHost "find '$RemoteBackupDir' -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort")
if ($LASTEXITCODE -ne 0) {
  throw "Unable to list VPS backups; SSH exited with code $LASTEXITCODE."
}

$copied = 0
foreach ($folder in $remoteFolders) {
  $folder = $folder.Trim()
  if ($folder -notmatch '^\d{8}-\d{6}$') { continue }
  $localFolder = Join-Path $LocalBackupDir $folder
  if (Test-Path -LiteralPath $localFolder) { continue }

  Write-Host "Copying missing backup: $folder"
  & scp -r "${remoteHost}:${RemoteBackupDir}/$folder" $LocalBackupDir
  if ($LASTEXITCODE -ne 0) {
    throw "SCP failed for $folder with exit code $LASTEXITCODE."
  }
  $copied++
}

& scp "${remoteHost}:${RemoteBackupDir}/backup.log" (Join-Path $LocalBackupDir "backup.log")
if ($LASTEXITCODE -ne 0) {
  throw "SCP failed for backup.log with exit code $LASTEXITCODE."
}

Write-Host "Backup copy complete. New folders copied: $copied"
