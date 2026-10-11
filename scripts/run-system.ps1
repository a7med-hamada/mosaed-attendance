$ErrorActionPreference = "SilentlyContinue"
$projectDir = "C:\Users\A7MD\.gemini\antigravity\scratch\workforce-attendance-system"
Set-Location $projectDir

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "     نظام حضور وانصراف شركة مساعد (Workforce System)   " -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Check if node server is running on port 3000
$serverRunning = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect("127.0.0.1", 3000)
    if ($tcp.Connected) {
        $serverRunning = $true
        $tcp.Close()
    }
} catch {}

if (-not $serverRunning) {
    Write-Host "[1/2] جاري تشغيل خادم النظام (Node.js)..." -ForegroundColor Green
    Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList "server/app.js" -WorkingDirectory $projectDir -WindowStyle Hidden
    Start-Sleep -Seconds 3
} else {
    Write-Host "[1/2] خادم النظام شغال بالفعل!" -ForegroundColor Green
}

# 2. Check cloudflared
$cfProcess = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
if (-not $cfProcess) {
    Write-Host "[2/2] جاري تشغيل الرابط الخارجي (Cloudflare Tunnel)..." -ForegroundColor Green
    $logPath = "$projectDir\tunnel.log"
    if (Test-Path $logPath) { Remove-Item $logPath -Force }
    Start-Process -FilePath "$projectDir\cloudflared.exe" -ArgumentList "tunnel --url http://localhost:3000 --logfile `"$logPath`"" -WorkingDirectory $projectDir -WindowStyle Hidden
    
    $tunnelUrl = $null
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Path $logPath) {
            $logContent = Get-Content $logPath -Raw
            if ($logContent -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
                $tunnelUrl = $matches[0]
                break
            }
        }
    }
    
    if ($tunnelUrl) {
        Write-Host "✓ تم إنشاء الرابط بنجاح: $tunnelUrl" -ForegroundColor Cyan
        
        # Update desktop shortcut
        $shortcut = "[InternetShortcut]`nURL=$tunnelUrl`nIconIndex=0`n"
        Set-Content -Path "C:\Users\A7MD\Desktop\نظام_حضور_شركة_مساعد.url" -Value $shortcut -Encoding ASCII
        
        # Update info text
        $info = @"
============================================================
           نظام حضور شركة مساعد - بيانات الدخول والرابط
============================================================

🔗 رابط الموقع الحالي (يعمل على أي موبايل أو كمبيوتر):
$tunnelUrl

------------------------------------------------------------
👑 حساب المدير:
الاسم: محمد حماده
البريد الإلكتروني: mohamed@gmail.com
كلمة المرور: admin123

------------------------------------------------------------
👤 حسابات الموظفين:
1) أحمد حماده (مونتير)
   البريد: ahmed@gmail.com | الباسورد: emp123 (أو 123456)
2) منصور السيد (سيلز)
   البريد: mansour@gmail.com | الباسورد: emp123 (أو 123456)

============================================================
"@
        Set-Content -Path "C:\Users\A7MD\Desktop\بيانات_الدخول_والرابط.txt" -Value $info -Encoding UTF8
        
        # Open in default browser
        Start-Process $tunnelUrl
    }
} else {
    Write-Host "[2/2] نفق الاتصال الخارجي شغال بالفعل!" -ForegroundColor Green
    # Open desktop shortcut url if available
    if (Test-Path "C:\Users\A7MD\Desktop\نظام_حضور_شركة_مساعد.url") {
        $content = Get-Content "C:\Users\A7MD\Desktop\نظام_حضور_شركة_مساعد.url"
        $urlLine = $content | Where-Object { $_ -match "^URL=" }
        if ($urlLine) {
            $url = $urlLine.Substring(4)
            Write-Host "الرابط الحالي: $url" -ForegroundColor Cyan
            Start-Process $url
        }
    }
}

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "النظام الآن شغال وجاهز لاستقبال الموظفين!" -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Cyan
Start-Sleep -Seconds 3
