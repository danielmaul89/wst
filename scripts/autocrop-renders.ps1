Add-Type -AssemblyName System.Drawing

$srcDir = "C:\Users\Maul\Documents\GitHub\WST\assets\products"
$outDir = "C:\Users\Maul\Documents\GitHub\WST\assets\products\renders\crop"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$pngCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/png" }

$files = @(
  "XWD_Egholm_Closed_Transparent_02_Print.png",
  "XWD_Egholm_Exploded_Transparent_Print.png"
)

$alphaThreshold = 60
$maxOutSide = 1800

foreach ($name in $files) {
  $src = Join-Path $srcDir $name
  $slug = ($name -replace '\.png$','' -replace '\s+','-').ToLower()

  $full = New-Object System.Drawing.Bitmap($src)
  $w = $full.Width; $h = $full.Height

  # downsample for fast scanning
  $scanMax = 500
  $scanRatio = [Math]::Min($scanMax / $w, $scanMax / $h)
  $sw = [int]($w * $scanRatio); $sh = [int]($h * $scanRatio)
  $scan = New-Object System.Drawing.Bitmap($sw, $sh)
  $g = [System.Drawing.Graphics]::FromImage($scan)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.DrawImage($full, 0, 0, $sw, $sh)
  $g.Dispose()

  $minX = $sw; $minY = $sh; $maxX = 0; $maxY = 0
  for ($y = 0; $y -lt $sh; $y++) {
    for ($x = 0; $x -lt $sw; $x++) {
      $a = $scan.GetPixel($x, $y).A
      if ($a -gt $alphaThreshold) {
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  $scan.Dispose()

  # map back to full-res coords
  $fx0 = [int]($minX / $scanRatio); $fy0 = [int]($minY / $scanRatio)
  $fx1 = [int]($maxX / $scanRatio); $fy1 = [int]($maxY / $scanRatio)

  # padding ~4% of the box size
  $bw = $fx1 - $fx0; $bh = $fy1 - $fy0
  $padX = [int]($bw * 0.04); $padY = [int]($bh * 0.04)
  $cx0 = [Math]::Max(0, $fx0 - $padX); $cy0 = [Math]::Max(0, $fy0 - $padY)
  $cx1 = [Math]::Min($w, $fx1 + $padX); $cy1 = [Math]::Min($h, $fy1 + $padY)
  $cw = $cx1 - $cx0; $ch = $cy1 - $cy0

  $cropped = New-Object System.Drawing.Bitmap($cw, $ch, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g2 = [System.Drawing.Graphics]::FromImage($cropped)
  $g2.DrawImage($full, (New-Object System.Drawing.Rectangle(0,0,$cw,$ch)), (New-Object System.Drawing.Rectangle($cx0,$cy0,$cw,$ch)), [System.Drawing.GraphicsUnit]::Pixel)
  $g2.Dispose()
  $full.Dispose()

  # resize down for web
  $outRatio = [Math]::Min($maxOutSide / $cw, $maxOutSide / $ch)
  if ($outRatio -gt 1) { $outRatio = 1 }
  $ow = [int]($cw * $outRatio); $oh = [int]($ch * $outRatio)
  $final = New-Object System.Drawing.Bitmap($ow, $oh, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g3 = [System.Drawing.Graphics]::FromImage($final)
  $g3.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g3.DrawImage($cropped, 0, 0, $ow, $oh)
  $g3.Dispose()
  $cropped.Dispose()

  $outPath = Join-Path $outDir "$slug.png"
  $final.Save($outPath, $pngCodec, $null)
  $final.Dispose()

  $outSize = (Get-Item $outPath).Length / 1KB
  "{0}: bbox({1},{2})-({3},{4}) of {5}x{6} -> {7} ({8}x{9}, {10:N0} KB)" -f $name, $fx0,$fy0,$fx1,$fy1,$w,$h,"$slug.png",$ow,$oh,$outSize
}
