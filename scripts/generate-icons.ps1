Add-Type -AssemblyName System.Drawing

function Generate-AppIcon([int]$size, [string]$outputPath) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    # 1. Dark Rounded Background
    $bgColor = [System.Drawing.ColorTranslator]::FromHtml('#060e18')
    $bgBrush = New-Object System.Drawing.SolidBrush $bgColor
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $g.FillRectangle($bgBrush, $rect)

    # 2. Glowing emerald circle inside
    $outerColor = [System.Drawing.ColorTranslator]::FromHtml('#0a273b')
    $outerBrush = New-Object System.Drawing.SolidBrush $outerColor
    $margin = [int]($size * 0.06)
    $g.FillEllipse($outerBrush, $margin, $margin, $size - 2 * $margin, $size - 2 * $margin)

    # 3. Emerald ring
    $penColor = [System.Drawing.ColorTranslator]::FromHtml('#00c288')
    $ringPen = New-Object System.Drawing.Pen $penColor, ([float]($size * 0.035))
    $ringMargin = [int]($size * 0.08)
    $g.DrawEllipse($ringPen, $ringMargin, $ringMargin, $size - 2 * $ringMargin, $size - 2 * $ringMargin)

    # 4. Center Emerald Shield
    $shieldColor = [System.Drawing.ColorTranslator]::FromHtml('#10b981')
    $shieldBrush = New-Object System.Drawing.SolidBrush $shieldColor
    $p1 = New-Object System.Drawing.Point ([int]($size * 0.50)), ([int]($size * 0.22))
    $p2 = New-Object System.Drawing.Point ([int]($size * 0.76)), ([int]($size * 0.33))
    $p3 = New-Object System.Drawing.Point ([int]($size * 0.72)), ([int]($size * 0.62))
    $p4 = New-Object System.Drawing.Point ([int]($size * 0.50)), ([int]($size * 0.78))
    $p5 = New-Object System.Drawing.Point ([int]($size * 0.28)), ([int]($size * 0.62))
    $p6 = New-Object System.Drawing.Point ([int]($size * 0.24)), ([int]($size * 0.33))
    $points = [System.Drawing.Point[]]@($p1, $p2, $p3, $p4, $p5, $p6)
    $g.FillPolygon($shieldBrush, $points)

    # 5. Crisp White Checkmark
    $checkPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([float]($size * 0.065))
    $checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $checkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawLine($checkPen, [float]($size * 0.39), [float]($size * 0.50), [float]($size * 0.47), [float]($size * 0.59))
    $g.DrawLine($checkPen, [float]($size * 0.47), [float]($size * 0.59), [float]($size * 0.63), [float]($size * 0.41))

    $g.Dispose()
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$baseDir = "C:\Users\A7MD\.gemini\antigravity\scratch\workforce-attendance-system\public\icons"
Generate-AppIcon 512 "$baseDir\icon-512.png"
Generate-AppIcon 192 "$baseDir\icon-192.png"

# Also generate an ICO file for Windows desktop shortcut
$bmp512 = [System.Drawing.Bitmap]::FromFile("$baseDir\icon-512.png")
$bmpSmall = New-Object System.Drawing.Bitmap $bmp512, (New-Object System.Drawing.Size 64, 64)
$hIcon = $bmpSmall.GetHicon()
$ico = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = New-Object System.IO.FileStream "$baseDir\app.ico", ([System.IO.FileMode]::Create)
$ico.Save($fs)
$fs.Close()
$bmp512.Dispose()
$bmpSmall.Dispose()

# Copy to public/favicon.ico
Copy-Item "$baseDir\app.ico" "C:\Users\A7MD\.gemini\antigravity\scratch\workforce-attendance-system\public\favicon.ico" -Force

Write-Output "All icons created successfully!"
