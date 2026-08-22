# Design-system conformance scoring.
#
# WHAT THIS MEASURES
#   How closely a page follows the rules written down in DESIGN-SYSTEM.md and
#   COMPONENTS.md: does it use the tokens, the heading tiers, the shared shell,
#   and does it avoid re-declaring shared components locally.
#
# WHAT THIS DOES NOT MEASURE
#   Whether the page looks good. A page can be the visual reference for the
#   whole site and still score poorly here because it carries a large private
#   stylesheet - index.html is exactly that case. Read a low score as "this
#   page is expensive to maintain and will not inherit shared changes", not as
#   "this page is ugly".
#
# ASCII only - see the note in check-design-system.ps1.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/score-design-system.ps1
#   ... -Json    also write design-scores.json for page-index.html

[CmdletBinding()]
param(
  [switch]$Json
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..").Path

$SharedSheets = @(
  'assets/styles/wst-design-system.css',
  'assets/styles/wst-components.css',
  'assets/styles/enterprise-polish.css'
)

# The documented type scale, plus the tier tokens that wrap it.
$ScaleSizes = @(14, 16, 24, 32, 40, 48, 56, 64)

function Get-DeclaredClasses {
  param([string]$Css)
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

# --- Shared vocabulary ------------------------------------------------------

$sharedClasses = New-Object System.Collections.Generic.HashSet[string]
foreach ($sheet in $SharedSheets) {
  $path = Join-Path $root $sheet
  if (-not (Test-Path -LiteralPath $path)) { continue }
  foreach ($n in (Get-DeclaredClasses (Get-Content -LiteralPath $path -Raw))) {
    [void]$sharedClasses.Add($n)
  }
}

# --- Score one page ---------------------------------------------------------

function Get-PageScore {
  param([string]$Path, [string]$Name)

  $html = Get-Content -LiteralPath $Path -Raw

  $css = ''
  foreach ($m in [regex]::Matches($html, '<style[^>]*>(.*?)</style>', 'Singleline')) {
    $css += $m.Groups[1].Value + "`n"
  }
  $css = [regex]::Replace($css, '/\*.*?\*/', '', 'Singleline')

  $detail = [ordered]@{}

  # 1. HEADING TIERS (25) --------------------------------------------------
  # Every font-size on a heading selector should come from a tier token.
  $headingRules = [regex]::Matches($css, '(?m)^([^{}]*\bh[1-6]\b[^{}]*)\{([^}]*)\}')
  $tierHits = 0; $tierMiss = 0
  foreach ($h in $headingRules) {
    $body = $h.Groups[2].Value
    foreach ($fs in [regex]::Matches($body, 'font-size\s*:\s*([^;]+)')) {
      if ($fs.Groups[1].Value -match '--h[1-6]-') { $tierHits++ } else { $tierMiss++ }
    }
  }
  $tierTotal = $tierHits + $tierMiss
  $sHeading = if ($tierTotal -eq 0) { 25 } else { [math]::Round(25 * $tierHits / $tierTotal, 1) }
  $detail['headingTiers'] = "$tierHits/$tierTotal tier-token"

  # 2. TYPE SCALE (15) -----------------------------------------------------
  # Raw px font sizes should land on the documented scale.
  $onScale = 0; $offScale = 0; $offList = @()
  foreach ($fs in [regex]::Matches($css, 'font-size\s*:\s*([0-9.]+)px')) {
    $v = [double]$fs.Groups[1].Value
    if ($ScaleSizes -contains [int]$v -and $v -eq [int]$v) { $onScale++ }
    else { $offScale++; $offList += ($fs.Groups[1].Value + 'px') }
  }
  $fsTotal = $onScale + $offScale
  $sScale = if ($fsTotal -eq 0) { 15 } else { [math]::Round(15 * $onScale / $fsTotal, 1) }
  $detail['typeScale'] = "$onScale/$fsTotal on-scale"
  $detail['offScaleSizes'] = (($offList | Select-Object -Unique | Sort-Object) -join ' ')

  # 3. SPACING TOKENS (15) -------------------------------------------------
  # padding/margin/gap should use --sp-* rather than loose px.
  $spTok = 0; $spRaw = 0
  foreach ($d in [regex]::Matches($css, '(?:^|[;{\s])(padding|margin|gap|row-gap|column-gap)\s*:\s*([^;}]+)')) {
    $val = $d.Groups[2].Value
    if ($val -match '^\s*(0|auto)\s*$') { continue }
    if ($val -match '--sp-|--section-space') { $spTok++ } elseif ($val -match '\d') { $spRaw++ }
  }
  $spTotal = $spTok + $spRaw
  $sSpacing = if ($spTotal -eq 0) { 15 } else { [math]::Round(15 * $spTok / $spTotal, 1) }
  $detail['spacing'] = "$spTok/$spTotal tokenised"

  # 4. NO SHADOWED COMPONENTS (20) -----------------------------------------
  # Every locally re-declared shared class is a private fork.
  $declared = Get-DeclaredClasses $css
  $shadowed = @($declared | Where-Object { $sharedClasses.Contains($_) })
  # 0 shadowed = full marks; 40 or more = zero. Linear in between.
  $sShadow = [math]::Round([math]::Max(0, 20 * (1 - ($shadowed.Count / 40))), 1)
  $detail['shadowedClasses'] = $shadowed.Count

  # 5. SHARED SHELL (10) ---------------------------------------------------
  $shellScore = 0
  if ($html -match 'data-wst-header') { $shellScore += 4 }
  if ($html -match 'data-wst-footer') { $shellScore += 3 }
  if ($html -notmatch '<nav[\s>]')    { $shellScore += 1.5 }
  if ($html -notmatch '<footer[\s>]') { $shellScore += 1.5 }
  $sShell = $shellScore
  $detail['shell'] = "$shellScore/10"

  # 6. ACCESSIBILITY HOOKS (10) --------------------------------------------
  $a11y = 0
  if ($css -match 'prefers-reduced-motion') { $a11y += 4 }
  if ($css -match ':focus-visible')         { $a11y += 3 }
  if ($html -match 'aria-hidden')           { $a11y += 1.5 }
  if ($html -match 'aria-label|<label')     { $a11y += 1.5 }
  $sA11y = $a11y
  $detail['a11y'] = "$a11y/10"

  # 7. COMPONENT LAYER (5) -------------------------------------------------
  $sLayer = if ($html -match 'wst-components\.css') { 5 } else { 0 }
  $detail['componentLayer'] = ($sLayer -eq 5)

  # Weight of local CSS, reported but not scored - context for the rest.
  $cssLines = ($css -split "`n" | Where-Object { $_.Trim() }).Count
  $detail['localCssLines'] = $cssLines

  $total = $sHeading + $sScale + $sSpacing + $sShadow + $sShell + $sA11y + $sLayer

  return [pscustomobject]@{
    Page      = $Name
    Score     = [math]::Round($total, 0)
    Heading   = $sHeading
    Scale     = $sScale
    Spacing   = $sSpacing
    NoShadow  = $sShadow
    Shell     = $sShell
    A11y      = $sA11y
    Layer     = $sLayer
    Detail    = $detail
  }
}

# --- Run --------------------------------------------------------------------

$results = @()
foreach ($page in (Get-ChildItem -LiteralPath $root -Filter '*.html' -File | Sort-Object Name)) {
  $results += Get-PageScore -Path $page.FullName -Name $page.Name
}

$ranked = $results | Sort-Object -Property Score -Descending

Write-Host ""
Write-Host "Design-system conformance" -ForegroundColor Cyan
Write-Host "  Mechanical adherence to DESIGN-SYSTEM.md, not visual quality." -ForegroundColor DarkGray
Write-Host ""
Write-Host ("  {0,-24} {1,5}  {2,5} {3,5} {4,5} {5,5} {6,5} {7,5} {8,5}   {9}" -f `
  'page','total','head','scale','space','noDup','shell','a11y','layer','local CSS')
Write-Host ("  " + ("-" * 96)) -ForegroundColor DarkGray

foreach ($r in $ranked) {
  $colour = if ($r.Score -ge 80) { 'Green' } elseif ($r.Score -ge 60) { 'Yellow' } else { 'DarkGray' }
  Write-Host ("  {0,-24} {1,4}%  {2,5} {3,5} {4,5} {5,5} {6,5} {7,5} {8,5}   {9} lines" -f `
    $r.Page, $r.Score, $r.Heading, $r.Scale, $r.Spacing, $r.NoShadow, $r.Shell, $r.A11y, $r.Layer, $r.Detail.localCssLines) -ForegroundColor $colour
}

Write-Host ""
Write-Host "  Weights: headings 25, type scale 15, spacing 15, no duplication 20," -ForegroundColor DarkGray
Write-Host "           shared shell 10, accessibility 10, component layer 5." -ForegroundColor DarkGray
Write-Host ""

if ($Json) {
  $payload = [ordered]@{
    generated = (Get-Date).ToString('yyyy-MM-dd HH:mm')
    weights   = [ordered]@{
      headingTiers = 25; typeScale = 15; spacing = 15
      noDuplication = 20; sharedShell = 10; accessibility = 10; componentLayer = 5
    }
    pages = @()
  }
  foreach ($r in $ranked) {
    $payload.pages += [ordered]@{
      file    = $r.Page
      score   = $r.Score
      parts   = [ordered]@{
        headingTiers = $r.Heading; typeScale = $r.Scale; spacing = $r.Spacing
        noDuplication = $r.NoShadow; sharedShell = $r.Shell
        accessibility = $r.A11y; componentLayer = $r.Layer
      }
      detail  = $r.Detail
    }
  }
  $out = Join-Path $root 'design-scores.json'
  $payload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $out -Encoding utf8
  Write-Host "  Wrote design-scores.json" -ForegroundColor Green
  Write-Host ""
}
