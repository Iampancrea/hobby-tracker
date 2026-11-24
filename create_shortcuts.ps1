$wsh = New-Object -ComObject WScript.Shell

$vbsPath = (Resolve-Path ".\Launch-Hobby-Tracker.vbs").Path
$workDir = (Resolve-Path ".").Path
$icoPath = (Resolve-Path ".\icons\icon.ico").Path

# 1. Start Menu Programs
$startMenu = [Environment]::GetFolderPath('Programs')
$startLnk = Join-Path $startMenu "Hobby Tracker.lnk"
$s1 = $wsh.CreateShortcut($startLnk)
$s1.TargetPath = "wscript.exe"
$s1.Arguments = "`"$vbsPath`""
$s1.WorkingDirectory = $workDir
$s1.IconLocation = "$icoPath,0"
$s1.Description = "Hobby Tracker"
$s1.Save()

# 2. Desktop
$desktop = [Environment]::GetFolderPath('Desktop')
$desktopLnk = Join-Path $desktop "Hobby Tracker.lnk"
$s2 = $wsh.CreateShortcut($desktopLnk)
$s2.TargetPath = "wscript.exe"
$s2.Arguments = "`"$vbsPath`""
$s2.WorkingDirectory = $workDir
$s2.IconLocation = "$icoPath,0"
$s2.Description = "Hobby Tracker"
$s2.Save()

Write-Output "StartMenu: $(Test-Path $startLnk) -> $startLnk"
Write-Output "Desktop: $(Test-Path $desktopLnk) -> $desktopLnk"
