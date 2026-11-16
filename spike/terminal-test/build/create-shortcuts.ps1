# Legt NEXUS-Verknuepfungen auf dem Desktop und im Startmenue an (startet ohne Konsolenfenster).
# Aufruf: powershell -ExecutionPolicy Bypass -File build\create-shortcuts.ps1
$app = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $app 'node_modules\electron\dist\electron.exe'
$icon = Join-Path $PSScriptRoot 'icon.ico'
if (-not (Test-Path $exe)) { throw "Electron fehlt ($exe). Erst 'npm install' im Ordner $app ausfuehren." }

$shell = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'NEXUS.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'NEXUS.lnk')
)
foreach ($lnk in $targets) {
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath = $exe
  $s.Arguments = '"' + $app + '"'
  $s.WorkingDirectory = $app
  $s.IconLocation = "$icon,0"
  $s.Description = 'NEXUS – KI-Arbeitsplatz'
  $s.Save()
  "Angelegt: $lnk"
}
