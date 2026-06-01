; nsis/installer-hooks.nsi
; Custom NSIS hooks to add install directory to PATH.
; This file is included by Tauri's default NSIS template.

!ifdef CUSTOM_install
Function CUSTOM_install
  ; Add install directory to PATH for current user
  ReadRegStr $0 HKCU "Environment" "Path"
  ${If} $0 != ""
    StrCpy $1 "$INSTDIR"
    StrCpy $2 "$0"
    StrLen $3 "$1"
    StrCpy $4 $2 0 $3
    ${If} $4 != "$1"
      ; Append to PATH since not already present
      StrCpy $0 "$0;$INSTDIR"
      WriteRegStr HKCU "Environment" "Path" "$0"
      ; Broadcast WM_SETTINGCHANGE to notify explorers of PATH change
      System::Call 'user32::SendMessageTimeout(i ${HWND_BROADCAST}, i ${WM_SETTINGCHANGE}, i 0, i "Path", i 0, i 1000, i 0)'
    ${EndIf}
  ${Else}
    WriteRegStr HKCU "Environment" "Path" "$INSTDIR"
  ${EndIf}
FunctionEnd
!endif

!ifdef CUSTOM_uninstall
Function CUSTOM_uninstall
  ; Remove install directory from PATH on uninstall
  ReadRegStr $0 HKCU "Environment" "Path"
  ${If} $0 != ""
    StrCpy $1 "$INSTDIR;"
    StrCpy $2 "$0"
    StrLen $3 "$1"
    StrCpy $4 $2 0 $3
    ${If} $4 == "$1"
      ; Remove it from PATH
      StrCpy $0 $2 $3
      StrCpy $0 "$0" "" $3
      WriteRegStr HKCU "Environment" "Path" "$0"
      System::Call 'user32::SendMessageTimeout(i ${HWND_BROADCAST}, i ${WM_SETTINGCHANGE}, i 0, i "Path", i 0, i 1000, i 0)'
    ${EndIf}
  ${EndIf}
FunctionEnd
!endif
