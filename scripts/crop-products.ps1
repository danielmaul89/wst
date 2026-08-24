Add-Type -AssemblyName System.Drawing

$srcDir = "C:\Users\Maul\Documents\GitHub\WST\assets\products\web"
$outDir = "C:\Users\Maul\Documents\GitHub\WST\assets\products\web\crop"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]92)

# name -> [x, y, w, h] crop rect in the 1800x1013 source
$crops = @{
  "hexacopter-grounded_scaled.jpg" = @(850, 460, 880, 430)
  "agv_scaled02.jpg"               = @(970, 610, 740, 340)
  "humanoid02.jpg"                 = @(920, 30, 880, 983)
  "boat.jpg"                       = @(430, 410, 1360, 460)
  "ups-system.jpg"                 = @(970, 60, 640, 953)
  "lawn-mover.jpg"                 = @(600, 180, 1200, 730)
}

foreach ($name in $crops.Keys) {
  $rect = $crops[$name]
  $src = Join-Path $srcDir $name
  $img = [System.Drawing.Image]::FromFile($src)

  $x = [Math]::Max(0, $rect[0]); $y = [Math]::Max(0, $rect[1])
  $w = [Math]::Min($rect[2], $img.Width - $x); $h = [Math]::Min($rect[3], $img.Height - $y)

  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $srcRect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
  $dstRect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $g.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $img.Dispose()

  $outPath = Join-Path $outDir $name
  $bmp.Save($outPath, $jpegCodec, $encoderParams)
  $bmp.Dispose()
  "{0} -> {1}x{2}" -f $name, $w, $h
}
