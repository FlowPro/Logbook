; NSIS pre-install hook for Logbuch
; Runs before the installer extracts any files.
; Kills nmea-bridge.exe if it is still running so the installer can overwrite it.
!macro NSIS_HOOK_PREINSTALL
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM nmea-bridge.exe'
  Pop $0
!macroend
