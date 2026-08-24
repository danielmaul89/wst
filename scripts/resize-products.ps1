Add-Type -AssemblyName System.Drawing

$srcDir = "C:\Users\Maul\Documents\GitHub\WST\assets\products"
$outDir = "C:\Users\Maul\Documents\GitHub\WST\assets\products\web"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$maxSide = 1800
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]82)

Get-ChildItem $srcDir -Filter *.png | ForEach-Object {
  $src = $_.FullName
  $slug = ($_.BaseName -replace ' Topaz.*$','' -replace ' Firefly.*$','' -replace '\s+','-').ToLower()
  $outPath = Join-Path $outDir "$slug.jpg"

  $img = [System.Drawing.Image]::FromFile($src)
  $ratio = [Math]::Min($maxSide / $img.Width, $maxSide / $img.Height)
  if ($ratio -gt 1) { $ratio = 1 }
  $newW = [int]($img.Width * $ratio)
  $newH = [int]($img.Height * $ratio)

  $bmp = New-Object System.Drawing.Bitmap($newW, $newH)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($img, 0, 0, $newW, $newH)
  $g.Dispose()
  $img.Dispose()

  $bmp.Save($outPath, $jpegCodec, $encoderParams)
  $bmp.Dispose()

  $outSize = (Get-Item $outPath).Length / 1KB
  "{0} -> {1} ({2}x{3}, {4:N0} KB)" -f $_.Name, "$slug.jpg", $newW, $newH, $outSize
}
