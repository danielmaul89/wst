$root = (Resolve-Path "$PSScriptRoot\..").Path
$port = if ($env:PORT) { [int]$env:PORT } else { 8973 }
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
$listener.Start()
Write-Host "Serving $root at http://127.0.0.1:$port/"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".woff" = "font/woff"
  ".woff2" = "font/woff2"
  ".otf" = "font/otf"
}

# Read the request head one byte at a time, up to the blank line. A buffered
# reader would swallow the start of a POST body along with the headers.
function Read-Head($stream) {
  $bytes = New-Object System.Collections.Generic.List[byte]
  $state = 0
  while ($true) {
    $b = $stream.ReadByte()
    if ($b -lt 0) { return $null }
    $bytes.Add([byte]$b)
    if ($b -eq 13) { if ($state -eq 2) { $state = 3 } else { $state = 1 } }
    elseif ($b -eq 10) {
      if ($state -eq 1) { $state = 2 } elseif ($state -eq 3) { break } else { $state = 0 }
    }
    else { $state = 0 }
    if ($bytes.Count -gt 32768) { return $null }
  }
  return [System.Text.Encoding]::ASCII.GetString($bytes.ToArray())
}

while ($true) {
  $client = $listener.AcceptTcpClient()

  # Browsers open speculative connections they may never send a request on.
  # This server accepts one connection at a time, so without a read timeout a
  # single silent connection blocks the accept loop forever and the whole
  # server stops responding - it keeps listening, but every request times out.
  $client.ReceiveTimeout = 30000
  $client.SendTimeout = 30000

  $stream = $null
  try {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 30000
    $head = Read-Head $stream
    if (-not $head) { continue }

    $lines = $head -split "`r`n"
    $parts = $lines[0].Split(" ")
    $method = $parts[0]
    $target = $parts[1]
    $path = [System.Uri]::UnescapeDataString(($target -split "\?")[0])
    $query = if ($target -match "\?") { ($target -split "\?", 2)[1] } else { "" }
    if ($path -eq "/") { $path = "/index.html" }

    $contentLength = 0
    foreach ($line in $lines) {
      if ($line -match "^(?i)Content-Length:\s*(\d+)") { $contentLength = [int]$Matches[1] }
    }

    $status = "404 Not Found"
    $contentType = "text/plain; charset=utf-8"
    $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")

    # Development only: lets a page in the browser hand a generated file back
    # to disk, so model conversion can run where the 3D loaders already are.
    # Loopback only, inside the repo only, and only formats we generate.
    if ($method -eq "POST" -and $path -eq "/__save") {
      $savePath = $null
      foreach ($pair in ($query -split "&")) {
        $kv = $pair -split "=", 2
        if ($kv.Length -eq 2 -and $kv[0] -eq "path") { $savePath = [System.Uri]::UnescapeDataString($kv[1]) }
      }
      $payload = New-Object byte[] $contentLength
      $read = 0
      while ($read -lt $contentLength) {
        $n = $stream.Read($payload, $read, $contentLength - $read)
        if ($n -le 0) { break }
        $read += $n
      }
      $target = if ($savePath) { [System.IO.Path]::GetFullPath((Join-Path $root $savePath)) } else { $null }
      $ok = $target -and $target.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and
            ([System.IO.Path]::GetExtension($target).ToLowerInvariant() -in @(".wstm", ".bin", ".json")) -and
            ($read -eq $contentLength)
      if ($ok) {
        [System.IO.File]::WriteAllBytes($target, $payload)
        Write-Host "Saved $savePath ($read bytes)"
        $body = [System.Text.Encoding]::UTF8.GetBytes("{""saved"":""$savePath"",""bytes"":$read}")
        $contentType = "application/json; charset=utf-8"
        $status = "200 OK"
      } else {
        $body = [System.Text.Encoding]::UTF8.GetBytes("refused")
        $status = "400 Bad Request"
      }
    }
    elseif ($method -eq "GET" -or $method -eq "HEAD") {
      $relativePath = $path.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
      $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))
      $allowed = $filePath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)
      if ($allowed -and (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        $body = [System.IO.File]::ReadAllBytes($filePath)
        $ext = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
        $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
        $status = "200 OK"
      }
    }

    $header = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($method -ne "HEAD") { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
  } catch [System.IO.IOException] {
    # Idle or aborted connection. Normal browser behaviour, not worth logging.
  } catch {
    Write-Host "Request error: $_"
  } finally {
    if ($stream) { $stream.Dispose() }
    $client.Dispose()
  }
}
