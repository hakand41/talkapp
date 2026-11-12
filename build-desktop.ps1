# TalkApp Masaustu Istemcisi Derleme Betigi
param(
    [switch]$Tauri = $false
)

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  [TalkApp] Masaustu Istemcisi (.exe) Olusturucu" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$iconPath = Join-Path $PSScriptRoot "src-tauri\icons\icon.ico"
$outputExe = Join-Path $PSScriptRoot "TalkApp.exe"
$sourceFile = Join-Path $PSScriptRoot "tools\TalkAppLauncher.cs"

# 1. Hizli ve Yerel TalkApp.exe Derlemesi (Ekstra arac gerektirmez, 1 saniyede hazir)
Write-Host "`n[1/2] Bagimsiz TalkApp.exe derleniyor..." -ForegroundColor Yellow
if (Test-Path $cscPath) {
    & $cscPath /target:winexe /win32icon:$iconPath /out:$outputExe $sourceFile | Out-Null
    if (Test-Path $outputExe) {
        Copy-Item (Join-Path $PSScriptRoot "public\downloads\talkapp-companion.exe") (Join-Path $PSScriptRoot "talkapp-companion.exe") -Force -ErrorAction SilentlyContinue
        Write-Host "[BASARILI] TalkApp.exe olusturuldu!" -ForegroundColor Green
        Write-Host "-> $outputExe" -ForegroundColor Cyan
        Write-Host "Bu .exe dosyasini cift tiklayarak bagimsiz masaustu uygulamasi olarak hemen kullanabilirsiniz." -ForegroundColor White
    }
}

# 2. Tauri / Rust MSI Installer Derlemesi
if ($Tauri) {
    Write-Host "`n[2/2] Tauri Rust MSI yukleyicisi derleniyor..." -ForegroundColor Yellow
    $env:PATH = "$env:USERPROFILE\.cargo\bin;" + $env:PATH
    npx @tauri-apps/cli build
} else {
    Write-Host "`n[BILGI] Tauri MSI yukleyicisi uretmek icin su komutu calistirabilirsiniz:" -ForegroundColor Yellow
    Write-Host "  .\build-desktop.ps1 -Tauri" -ForegroundColor Cyan
}

Write-Host "`nIslem tamamlandi." -ForegroundColor Green
