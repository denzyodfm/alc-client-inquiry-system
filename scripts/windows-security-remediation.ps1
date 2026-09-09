$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $workspace "windows-security-remediation.log"
$kmsPath = "C:\ProgramData\Online_KMS_Activation"
$kmsTask = "Online_KMS_Activation_Script-Renewal"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw "Run this elevated. Without admin rights the firewall changes fail and the run reports success anyway."
}

Start-Transcript -LiteralPath $logPath -Force
try {
  Set-Service -Name "AnyDesk" -StartupType Automatic
  if ((Get-Service -Name "AnyDesk").Status -ne "Running") {
    Start-Service -Name "AnyDesk"
  }

  foreach ($serviceName in @("RustDesk", "TeamViewer")) {
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($service) {
      if ($service.Status -ne "Stopped") {
        Stop-Service -Name $serviceName -Force
      }
      Set-Service -Name $serviceName -StartupType Disabled
    }
  }

  Get-Process -Name "rustdesk", "TeamViewer", "TeamViewer_Service" -ErrorAction SilentlyContinue |
    Stop-Process -Force

  $commonStartup = [Environment]::GetFolderPath("CommonStartup")
  $rustDeskShortcut = Join-Path $commonStartup "RustDesk Tray.lnk"
  if (Test-Path -LiteralPath $rustDeskShortcut) {
    Rename-Item -LiteralPath $rustDeskShortcut -NewName "RustDesk Tray.lnk.disabled"
  }

  $task = Get-ScheduledTask -TaskName $kmsTask -ErrorAction SilentlyContinue
  if ($task) {
    Unregister-ScheduledTask -TaskName $kmsTask -Confirm:$false
  }

  if (Test-Path -LiteralPath $kmsPath) {
    $resolvedKmsPath = (Resolve-Path -LiteralPath $kmsPath).Path
    if ($resolvedKmsPath -ne $kmsPath) {
      throw "Refusing unexpected KMS path: $resolvedKmsPath"
    }
    Remove-Item -LiteralPath $resolvedKmsPath -Recurse -Force
  }

  # The block rule below is only worth anything if the firewall itself is switched on. All three
  # profiles were found disabled (EnableFirewall = 0) on 2026-09-09, which silently voided the
  # first run of this script.
  $disabledProfiles = Get-NetFirewallProfile -Profile Domain, Private, Public |
    Where-Object { -not $_.Enabled }
  if ($disabledProfiles) {
    Set-NetFirewallProfile -Profile $disabledProfiles.Name -Enabled True
  }

  $publicPorts = @("2399", "3001", "3010", "3020", "3306", "5003", "5173", "5432")
  $firewallRuleName = "ALC Security - Block exposed data and dev ports on Public networks"
  Remove-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $firewallRuleName -Group "ALC Security" -Direction Inbound `
    -Action Block -Enabled True -Profile Public -Protocol TCP -LocalPort $publicPorts | Out-Null

  $rule = Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue
  if (-not $rule) {
    throw "Firewall rule '$firewallRuleName' was not created."
  }

  Get-Service -Name "AnyDesk", "RustDesk", "TeamViewer" -ErrorAction SilentlyContinue |
    Select-Object Name, Status, StartType
  Write-Output "KMS task present: $([bool](Get-ScheduledTask -TaskName $kmsTask -ErrorAction SilentlyContinue))"
  Write-Output "KMS directory present: $(Test-Path -LiteralPath $kmsPath)"
  Get-NetFirewallProfile -Profile Domain, Private, Public | Select-Object Name, Enabled
  $rule | Select-Object DisplayName, Enabled, Profile, Direction, Action
} finally {
  Stop-Transcript
}
