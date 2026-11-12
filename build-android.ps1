# TalkApp Android Build & Sync Script
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  [TalkApp] Android Mobil Paketleme & Senkronizasyon" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

Write-Host "`n[1/3] Web varliklari ve Capacitor ayarlari senkronize ediliyor..." -ForegroundColor Yellow
npx cap sync android

if ($LASTEXITCODE -ne 0) {
    Write-Host "[HATA] Capacitor senkronizasyonu basarisiz oldu!" -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/3] Android projesi basariyla guncellendi." -ForegroundColor Green

# Android Studio veya Gradle ile derleme kontrolu
$gradlewPath = Join-Path $PSScriptRoot "android\gradlew.bat"
if (Get-Command java -ErrorAction SilentlyContinue) {
    Write-Host "`n[3/3] Java JDK bulundu, APK derleniyor (assembleDebug)..." -ForegroundColor Yellow
    Push-Location (Join-Path $PSScriptRoot "android")
    .\gradlew.bat assembleDebug
    Pop-Location
    
    $apkPath = Join-Path $PSScriptRoot "android\app\build\outputs\apk\debug\app-debug.apk"
    if (Test-Path $apkPath) {
        Write-Host "`n[BASARILI] Android APK uretildi:" -ForegroundColor Green
        Write-Host "-> $apkPath" -ForegroundColor Cyan
    }
} else {
    Write-Host "`n[BILGI] Java / Android SDK bulunamadi. Projeyi Android Studio ile acmak icin:" -ForegroundColor Yellow
    Write-Host "  npx cap open android" -ForegroundColor Cyan
    Write-Host "veya Android Studio icinden 'c:\talkapp\android' klasorunu acip 'Build > Build APK' diyebilirsiniz." -ForegroundColor White
}

Write-Host "`nIslem tamamlandi." -ForegroundColor Green
