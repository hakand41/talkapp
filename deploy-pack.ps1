# TalkApp - VDS Deployment Packager
$targetZip = "talkapp-deploy.zip"
$targetTar = "talkapp-deploy.tar.gz"

if (Test-Path $targetZip) { Remove-Item $targetZip -Force }
if (Test-Path $targetTar) { Remove-Item $targetTar -Force }

Write-Host "TalkApp VDS paketleri olusturuluyor..." -ForegroundColor Cyan

# 1. tar.gz paketi (Linux VDS icin onerilen)
tar --exclude=node_modules --exclude=data --exclude=ssl --exclude=.git --exclude=android --exclude=src-tauri --exclude="talkapp-deploy.*" -czvf $targetTar *
$tarSize = [math]::Round((Get-Item $targetTar).Length / 1KB, 1)
Write-Host "Tar.gz paketi hazir: $targetTar ($tarSize KB)" -ForegroundColor Green

# 2. zip paketi (Windows & genel kullanim icin)
$excludePatterns = @("node_modules", "talkapp-deploy", ".git", "ssl", "data", "android", "src-tauri")
$filesToZip = Get-ChildItem -Path . -Recurse | Where-Object {
    $item = $_
    $skip = $false
    foreach ($pat in $excludePatterns) {
        if ($item.FullName -match [regex]::Escape($pat)) {
            $skip = $true
            break
        }
    }
    -not $skip
}
Compress-Archive -Path $filesToZip.FullName -DestinationPath $targetZip -Force
$zipSize = [math]::Round((Get-Item $targetZip).Length / 1KB, 1)
Write-Host "Zip paketi hazir: $targetZip ($zipSize KB)" -ForegroundColor Green

Write-Host "`nSunucuya gondermek icin PowerShell'de su komutu calistirabilirsiniz:" -ForegroundColor Yellow
Write-Host "scp talkapp-deploy.tar.gz root@<SUNUCU_IP>:/root/talkapp/" -ForegroundColor White

