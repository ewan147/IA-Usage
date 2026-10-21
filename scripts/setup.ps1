# IA Usage — build (if needed), install, enable Windows autostart, launch now.
# Usage:  powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$InstallDir = Join-Path $env:LOCALAPPDATA "IA-Usage"
$InstallExe = Join-Path $InstallDir "ia-usage.exe"
$ReleaseExe = Join-Path $Root "src-tauri\target\release\clawd-usage.exe"

Write-Host "=== IA Usage setup ===" -ForegroundColor Cyan
Set-Location $Root

if (-not (Test-Path $ReleaseExe)) {
  Write-Host "Build release (premiere fois, quelques minutes)..." -ForegroundColor Yellow
  if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    npm install
  }
  npm run tauri build
  if (-not (Test-Path $ReleaseExe)) {
    throw "Build OK attendu mais exe introuvable: $ReleaseExe"
  }
} else {
  Write-Host "Exe release deja present." -ForegroundColor DarkGray
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Force $ReleaseExe $InstallExe
Write-Host "Installe: $InstallExe"

# Autostart (current user)
$RunPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
New-ItemProperty -Path $RunPath -Name "IA Usage" -Value "`"$InstallExe`"" -PropertyType String -Force | Out-Null
Write-Host "Autostart Windows: OK"

# Desktop shortcut
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "IA Usage.lnk"
$Wsh = New-Object -ComObject WScript.Shell
$Sc = $Wsh.CreateShortcut($ShortcutPath)
$Sc.TargetPath = $InstallExe
$Sc.WorkingDirectory = $InstallDir
$Sc.Description = "IA Usage - Claude + Cursor tokens"
$Sc.Save()
Write-Host "Raccourci bureau: $ShortcutPath"

# Launch now (kill previous instance if any)
Get-Process -Name "ia-usage","clawd-usage" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 400
Start-Process -FilePath $InstallExe
Write-Host "Lance. Le logo Clawd se colle en bas a droite de Cursor / Claude." -ForegroundColor Green
