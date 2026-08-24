$root = (Resolve-Path "$PSScriptRoot\..").Path
$port = 8973
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

while ($true) {
  $client = $listener.AcceptTcpClient()

  # Browsers open speculative connections they may never send a request on.
  # This server accepts one connection at a time, so without a read timeout a
  # single silent connection blocks the accept loop forever and the whole
  # server stops responding - it keeps listening, but every request times out.
  $client.ReceiveTimeout = 2000
  $client.SendTimeout = 10000

  $stream = $null
  $reader = $null
  try {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 2000
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $requestLine = $reader.ReadLine()
    if (-not $requestLine) { continue }

    while (($line = $reader.ReadLine()) -ne "" -and $null -ne $line) {}
    $parts = $requestLine.Split(" ")
    $method = $parts[0]
    $path = [System.Uri]::UnescapeDataString(($parts[1] -split "\?")[0])
    if ($path -eq "/") { $path = "/index.html" }

    $relativePath = $path.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))
    $allowed = $filePath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)

    if ($allowed -and (Test-Path -LiteralPath $filePath -PathType Leaf)) {
      $body = [System.IO.File]::ReadAllBytes($filePath)
      $ext = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
      $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $status = "200 OK"
    } else {
      $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $contentType = "text/plain; charset=utf-8"
      $status = "404 Not Found"
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
    if ($reader) { $reader.Dispose() }
    if ($stream) { $stream.Dispose() }
    $client.Dispose()
  }
}
