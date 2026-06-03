; nsis/installer-hooks.nsi
; Custom NSIS hooks to add install directory to PATH.
; This file is included by Tauri's NSIS template which calls
; !insertmacro NSIS_HOOK_POSTINSTALL and !insertmacro NSIS_HOOK_POSTUNINSTALL.

!macro NSIS_HOOK_POSTINSTALL
  ReadRegStr $R0 HKCU "Environment" "Path"
  ${If} $R0 != ""
    StrCpy $R1 "$INSTDIR"
    StrCpy $R2 "$R0"
    StrLen $R3 "$R1"
    StrCpy $R4 $R2 0 $R3
    ${If} $R4 != "$R1"
      StrCpy $R0 "$R0;$INSTDIR"
      WriteRegStr HKCU "Environment" "Path" "$R0"
      System::Call 'user32::SendMessageTimeout(i ${HWND_BROADCAST}, i ${WM_SETTINGCHANGE}, i 0, i "Path", i 0, i 1000, i 0)'
    ${EndIf}
  ${Else}
    WriteRegStr HKCU "Environment" "Path" "$INSTDIR"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ReadRegStr $R0 HKCU "Environment" "Path"
  ${If} $R0 != ""
    StrCpy $R1 "$INSTDIR;"
    StrCpy $R2 "$R0"
    StrLen $R3 "$R1"
    StrCpy $R4 $R2 0 $R3
    ${If} $R4 == "$R1"
      StrCpy $R0 $R2 $R3
      StrCpy $R0 "$R0" "" $R3
      WriteRegStr HKCU "Environment" "Path" "$R0"
      System::Call 'user32::SendMessageTimeout(i ${HWND_BROADCAST}, i ${WM_SETTINGCHANGE}, i 0, i "Path", i 0, i 1000, i 0)'
    ${EndIf}
  ${EndIf}
!macroend
