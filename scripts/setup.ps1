# IA Usage — build (if needed), install, enable Windows autostart, launch now.
# Usage:  powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$InstallDir = Join-Path $env:LOCALAPPDATA "IA-Usage"
$InstallExe = Join-Path $InstallDir "ia-usage.exe"
$ReleaseExe = Join-Path $Root "src-tauri\target\release\clawd-usage.exe"

Write-Host "=== IA Usage setup ===" -ForegroundColor Cyan
Set-Location $Root

# Always use `tauri build` (not bare `cargo build`) so the frontend is embedded.
# Bare cargo release keeps http://localhost:1420 and the dashboard fails offline.
Write-Host "Build release (tauri build, peut prendre quelques minutes)..." -ForegroundColor Yellow
if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  npm install
}
npx tauri build --no-bundle
if (-not (Test-Path $ReleaseExe)) {
  throw "Build OK attendu mais exe introuvable: $ReleaseExe"
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

# Launch now (kill ALL previous instances — duplicates make the widget flicker)
Get-Process -Name "ia-usage","clawd-usage" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 600
Start-Process -FilePath $InstallExe
Start-Sleep -Milliseconds 800
$alive = @(Get-Process -Name "ia-usage","clawd-usage" -ErrorAction SilentlyContinue)
if ($alive.Count -ne 1) {
  Write-Host "Attention: $($alive.Count) process IA Usage (attendu: 1)." -ForegroundColor Yellow
} else {
  Write-Host "Lance (1 process). Le logo Clawd se colle en bas a droite de Cursor / Claude." -ForegroundColor Green
}
