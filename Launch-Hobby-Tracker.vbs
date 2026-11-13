Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & WshShell.CurrentDirectory & "\Launch-Hobby-Tracker.bat" & chr(34), 0
Set WshShell = Nothing
