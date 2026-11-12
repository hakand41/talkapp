@echo off
title TalkApp - Oyuncu Ses ve Goruntu Sunucusu
cls

echo ========================================================
echo   [TalkApp] Hafif Sesli ve Goruntulu Iletisim Platformu
echo ========================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [HATA] Node.js sisteminizde kurulu degil!
    echo Lutfen https://nodejs.org adresinden Node.js yukleyin.
    pause
    exit /b 1
)

:: Install node modules if missing
if not exist "node_modules\" (
    echo [BILGI] Ilk calistirma tespit edildi, paketler yukleniyor...
    call npm install --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo [HATA] Paketler yuklenirken bir sorun olustu.
        pause
        exit /b 1
    )
)

echo [BILGI] Sunucu baslatiliyor...
echo [IPUCU] Tarayicinizda acin: http://localhost:3000
echo.

node server.js
pause
