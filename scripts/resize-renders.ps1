Add-Type -AssemblyName System.Drawing

$srcDir = "C:\Users\Maul\Documents\GitHub\WST\assets\products"
$outDir = "C:\Users\Maul\Documents\GitHub\WST\assets\products\renders"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$pngCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/png" }

$files = @(
  "QKW_Print.png",
  "Xshore_Transparant_Print_No logo.png",
  "XUG_Transparant_Print.png",
  "XWD_Egholm_Closed_Transparent_02_Print.png",
  "XWD_Egholm_Exploded_Transparent_Print.png"
)

$maxSide = 2200

foreach ($name in $files) {
  $src = Join-Path $srcDir $name
  $slug = ($name -replace '\.png$','' -replace '\s+','-').ToLower()
  $outPath = Join-Path $outDir "$slug.png"

  $img = [System.Drawing.Image]::FromFile($src)
  $ratio = [Math]::Min($maxSide / $img.Width, $maxSide / $img.Height)
  if ($ratio -gt 1) { $ratio = 1 }
  $newW = [int]($img.Width * $ratio)
  $newH = [int]($img.Height * $ratio)

  $bmp = New-Object System.Drawing.Bitmap($newW, $newH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($img, 0, 0, $newW, $newH)
  $g.Dispose()
  $img.Dispose()

  $bmp.Save($outPath, $pngCodec, $null)
  $bmp.Dispose()

  $outSize = (Get-Item $outPath).Length / 1KB
  "{0} -> {1} ({2}x{3}, {4:N0} KB)" -f $name, "$slug.png", $newW, $newH, $outSize
}
