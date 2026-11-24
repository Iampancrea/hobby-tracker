Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & scriptDir & "\Launch-Hobby-Tracker.bat" & chr(34), 0
Set WshShell = Nothing
Set fso = Nothing
