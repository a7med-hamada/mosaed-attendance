$ErrorActionPreference = "Stop"
$projectDir = "C:\Users\A7MD\.gemini\antigravity\scratch\workforce-attendance-system"
Set-Location $projectDir

$exposePublicly = Read-Host "Expose this system to the public internet through Cloudflare Tunnel? (y/N)"

$client = New-Object System.Net.Sockets.TcpClient
try {
    $client.Connect("127.0.0.1", 3000)
    $serverRunning = $client.Connected
} catch {
    $serverRunning = $false
} finally {
    $client.Dispose()
}

if (-not $serverRunning) {
    Write-Host "Starting local application server..." -ForegroundColor Green
    Start-Process -FilePath "C:\Program Files\nodejs\node.exe" `
        -ArgumentList "server/app.js" -WorkingDirectory $projectDir -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

if ($exposePublicly -match '(?i)^(y|yes)$') {
    $cfProcess = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
    $logPath = Join-Path $projectDir "tunnel.log"
    if (-not $cfProcess) {
        if (Test-Path $logPath) {
            Remove-Item $logPath -Force
        }
        Start-Process -FilePath (Join-Path $projectDir "cloudflared.exe") `
            -ArgumentList "tunnel --url http://localhost:3000 --logfile `"$logPath`"" `
            -WorkingDirectory $projectDir -WindowStyle Hidden

        $tunnelUrl = $null
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 1
            if ((Test-Path $logPath) -and (Get-Content $logPath -Raw) -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
                $tunnelUrl = $matches[0]
                break
            }
        }
    } else {
        if ((Test-Path $logPath) -and (Get-Content $logPath -Raw) -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
            $tunnelUrl = $matches[0]
        } else {
            $shortcutPath = Join-Path $env:USERPROFILE "Desktop\Workforce-Attendance.url"
            if (Test-Path $shortcutPath) {
                $urlLine = Get-Content $shortcutPath | Where-Object { $_ -match "^URL=" } | Select-Object -First 1
                if ($urlLine) {
                    $tunnelUrl = $urlLine.Substring(4)
                }
            }
        }
    }

    if ($tunnelUrl) {
        $shortcutPath = Join-Path $env:USERPROFILE "Desktop\Workforce-Attendance.url"
        Set-Content -Path $shortcutPath -Value "[InternetShortcut]`nURL=$tunnelUrl`n" -Encoding ASCII
        Set-Content -Path (Join-Path $env:USERPROFILE "Desktop\Workforce-Attendance-Link.txt") `
            -Value "Temporary public URL: $tunnelUrl`nCreate an account through registration. Share the link only with authorized users." `
            -Encoding UTF8
        Start-Process $tunnelUrl
    } else {
        Write-Error "Cloudflare tunnel did not provide a usable URL."
    }
} else {
    Write-Host "Running locally only; no public tunnel was created." -ForegroundColor Yellow
    Start-Process "http://localhost:3000"
}
