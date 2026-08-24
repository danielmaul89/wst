# Design-system guard.
#
# Two checks:
#   1. FAIL - a page declares a `wst-*` class in its own <style> block. The
#      prefix is reserved for assets/styles/wst-components.css; a page that
#      declares one has forked a shared component.
#   2. WARN - a page declares an unprefixed class that a shared stylesheet also
#      owns (.nav, .btn, .footer, ...). Legal, but it means the page carries a
#      private copy of a shared component and you cannot tell by reading it
#      which rules are actually live.
#
# Pages listed in $LegacyPages predate the component layer and are exempt from
# the warning: their duplication is known debt, deliberately left in place.
# Anything not on that list is expected to be clean.
#
# ASCII only, on purpose. This file is read by Windows PowerShell 5.1, which
# decodes a .ps1 without a BOM using the system ANSI codepage - non-ASCII
# characters do not survive that round trip reliably.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-design-system.ps1
#   ... -Strict     treat legacy debt as a failure too

[CmdletBinding()]
param(
  [switch]$Strict
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..").Path

$SharedSheets = @(
  'assets/styles/wst-design-system.css',
  'assets/styles/wst-components.css',
  'assets/styles/enterprise-polish.css'
)

# Built before the component layer existed. Each carries a private copy of the
# navigation, button and footer CSS. Deliberately untouched.
$LegacyPages = @(
  'index.html', 'solutions-v3.html', 'about.html', 'product-drone.html',
  'bms.html', 'production.html', 'development.html', 'product.html',
  'contact.html', 'design-system.html', 'careers.html', 'news.html',
  'layout-options.html',
  'index-v2.html', 'index-v3.html', 'index-v4.html', 'index-v5.html',
  'about-v2.html', 'bms-v2.html', 'contact-v2.html', 'development-v2.html',
  'product-v2.html', 'production-v2.html', 'solutions.html',
  'solutions-v2.html'
)

function Get-DeclaredClasses {
  param([string]$Css)

  # Strip comments, then take every `.class-name` appearing in a selector
  # position (before a `{`). Crude but sufficient: this is a lint, not a parser.
  $clean = [regex]::Replace($Css, '/\*.*?\*/', '', 'Singleline')
  $names = New-Object System.Collections.Generic.HashSet[string]

  foreach ($m in [regex]::Matches($clean, '(?m)^([^{}]+?)\{')) {
    $selector = $m.Groups[1].Value
    if ($selector -match '^\s*@') { continue }
    foreach ($c in [regex]::Matches($selector, '\.(-?[A-Za-z_][A-Za-z0-9_-]*)')) {
      [void]$names.Add($c.Groups[1].Value)
    }
  }
  return ,$names
}

# --- Collect the class names the shared sheets own --------------------------

$sharedClasses = New-Object System.Collections.Generic.HashSet[string]
foreach ($sheet in $SharedSheets) {
  $path = Join-Path $root $sheet
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Host "  ! missing shared stylesheet: $sheet" -ForegroundColor Yellow
    continue
  }
  $found = Get-DeclaredClasses (Get-Content -LiteralPath $path -Raw)
  foreach ($name in $found) { [void]$sharedClasses.Add($name) }
}

Write-Host ""
Write-Host "Design-system check" -ForegroundColor Cyan
Write-Host "  shared classes: $($sharedClasses.Count)"
Write-Host ""

# --- Check each page --------------------------------------------------------

$failures = New-Object System.Collections.ArrayList
$newWarnings = New-Object System.Collections.ArrayList
$oldWarnings = New-Object System.Collections.ArrayList

$pages = Get-ChildItem -LiteralPath $root -Filter '*.html' -File | Sort-Object Name

foreach ($page in $pages) {
  $html = Get-Content -LiteralPath $page.FullName -Raw

  $localCss = ''
  foreach ($m in [regex]::Matches($html, '<style[^>]*>(.*?)</style>', 'Singleline')) {
    $localCss += $m.Groups[1].Value + "`n"
  }
  if ([string]::IsNullOrWhiteSpace($localCss)) { continue }

  $declared = Get-DeclaredClasses $localCss

  $prefixed = New-Object System.Collections.ArrayList
  $shadowed = New-Object System.Collections.ArrayList

  foreach ($name in $declared) {
    if ($name.StartsWith('wst-')) {
      [void]$prefixed.Add($name)
    }
    elseif ($sharedClasses.Contains($name)) {
      [void]$shadowed.Add($name)
    }
  }

  if ($prefixed.Count -gt 0) {
    [void]$failures.Add([pscustomobject]@{
      Page    = $page.Name
      Classes = ($prefixed | Sort-Object)
    })
  }

  if ($shadowed.Count -gt 0) {
    $entry = [pscustomobject]@{
      Page    = $page.Name
      Count   = $shadowed.Count
      Classes = ($shadowed | Sort-Object)
    }
    if ($LegacyPages -contains $page.Name) {
      [void]$oldWarnings.Add($entry)
    } else {
      [void]$newWarnings.Add($entry)
    }
  }
}

# --- Report -----------------------------------------------------------------

if ($failures.Count -gt 0) {
  Write-Host "FAIL - pages declaring reserved wst-* classes:" -ForegroundColor Red
  foreach ($f in $failures) {
    Write-Host "  $($f.Page)" -ForegroundColor Red
    Write-Host "    $($f.Classes -join ', ')"
  }
  Write-Host "  Move these into assets/styles/wst-components.css as a variant."
  Write-Host ""
}

if ($newWarnings.Count -gt 0) {
  Write-Host "WARN - pages shadowing shared components:" -ForegroundColor Yellow
  foreach ($w in $newWarnings) {
    Write-Host "  $($w.Page)" -ForegroundColor Yellow
    Write-Host "    $($w.Classes -join ', ')"
  }
  Write-Host "  Delete the local copy, or promote the difference to the shared sheet."
  Write-Host ""
}

if ($oldWarnings.Count -gt 0) {
  $total = 0
  foreach ($w in $oldWarnings) { $total += $w.Count }
  Write-Host "Known debt - pages predating the component layer:" -ForegroundColor DarkGray
  foreach ($w in $oldWarnings) {
    Write-Host ("  {0,-24} {1,3} shadowed" -f $w.Page, $w.Count) -ForegroundColor DarkGray
  }
  Write-Host "  $total duplicated declarations across $($oldWarnings.Count) pages. Run -Strict to fail on these." -ForegroundColor DarkGray
  Write-Host ""
}

$exitCode = 0
if ($failures.Count -gt 0) { $exitCode = 1 }
if ($newWarnings.Count -gt 0) { $exitCode = 1 }
if ($Strict -and $oldWarnings.Count -gt 0) { $exitCode = 1 }

if ($exitCode -eq 0) {
  Write-Host "PASS - no page forks a shared component." -ForegroundColor Green
  Write-Host ""
}

exit $exitCode
