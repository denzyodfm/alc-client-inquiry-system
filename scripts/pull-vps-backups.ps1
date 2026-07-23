param(
  [string]$VpsUser = "agusanlending",
  [string]$VpsHost = "172.16.0.113",
  [string]$RemoteBackupDir = "/home/agusanlending/alc-client-inquiry-system/backups",
  [string]$LocalBackupDir = "C:\Users\Dennis\Desktop\ALC-client-inquiry-system\backups"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $LocalBackupDir | Out-Null

$destination = Join-Path $LocalBackupDir ""
$remote = "${VpsUser}@${VpsHost}:${RemoteBackupDir}/*"

Write-Host "Copying VPS backups from $remote"
Write-Host "Saving to $LocalBackupDir"

scp -r $remote $destination

Write-Host "Backup copy complete."
