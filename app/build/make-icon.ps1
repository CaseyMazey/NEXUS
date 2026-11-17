param([string]$OutDir)
# Zeichnet das NEXUS-Icon: icon.ico (Windows, PNG-Eintraege), icon.png (256 px), icon-1024.png (macOS/Linux)
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null

function Draw-Icon([int]$s) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'; $g.InterpolationMode = 'HighQualityBicubic'
  $g.Clear([System.Drawing.Color]::Transparent)
  $m = [single]($s * 0.04); $w = [single]($s - 2 * $m); $r = [single]($w * 0.24)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($m, $m, 2*$r, 2*$r, 180, 90)
  $path.AddArc($m + $w - 2*$r, $m, 2*$r, 2*$r, 270, 90)
  $path.AddArc($m + $w - 2*$r, $m + $w - 2*$r, 2*$r, 2*$r, 0, 90)
  $path.AddArc($m, $m + $w - 2*$r, 2*$r, 2*$r, 90, 90)
  $path.CloseFigure()
  # Hintergrund: dunkler Verlauf
  $rect = New-Object System.Drawing.RectangleF $m, $m, $w, $w
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 30, 32, 44)), ([System.Drawing.Color]::FromArgb(255, 14, 15, 20)), 90
  $g.FillPath($bg, $path)
  # Akzentrand Indigo -> Cyan
  $accent = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 99, 102, 241)), ([System.Drawing.Color]::FromArgb(255, 6, 182, 212)), 45
  $pen = New-Object System.Drawing.Pen $accent, ([single][Math]::Max(1.5, $s * 0.045))
  $g.DrawPath($pen, $path)
  # Buchstabe N
  $font = New-Object System.Drawing.Font 'Segoe UI', ([single]($s * 0.56)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $textRect = New-Object System.Drawing.RectangleF 0, ([single]($s * 0.02)), $s, $s
  $g.DrawString('N', $font, $accent, $textRect, $fmt)
  $g.Dispose()
  return $bmp
}

$sizes = 16, 24, 32, 48, 64, 128, 256
$pngs = @()
foreach ($s in $sizes) {
  $bmp = Draw-Icon $s
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  if ($s -eq 256) { $bmp.Save((Join-Path $OutDir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
  $bmp.Dispose()
  $pngs += , $ms.ToArray()
}
$big = Draw-Icon 1024; $big.Save((Join-Path $OutDir 'icon-1024.png'), [System.Drawing.Imaging.ImageFormat]::Png); $big.Dispose()
# ICO-Datei: Header + Verzeichnis + PNG-Daten
$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $out
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]; $d = $pngs[$i]
  $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s }))); $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
  $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$d.Length); $bw.Write([UInt32]$offset)
  $offset += $d.Length
}
foreach ($d in $pngs) { $bw.Write($d) }
$bw.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $OutDir 'icon.ico'), $out.ToArray())
"ok"
