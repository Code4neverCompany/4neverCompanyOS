# 4neverCompanyOS — Desktop-App bauen (Tauri v2)

Kurzanleitung, um aus `I:\4neverCompanyOS` die native Windows-App zu bauen.
Die Web-Version läuft parallel weiter wie gewohnt über `start.bat` (Node-Server).

## 1. Einmalige Vorbereitung

1. **Rust installieren (MSVC-Toolchain):**
   https://rustup.rs herunterladen und ausführen (`rustup-init.exe`),
   Standardauswahl bestätigen (`stable`, Host `x86_64-pc-windows-msvc`).
   Falls noch keine Build-Tools vorhanden sind, installiert rustup-init auf
   Wunsch die "Visual Studio C++ Build Tools" gleich mit.
2. **Tauri CLI installieren:**
   ```
   cargo install tauri-cli --locked --version "^2"
   ```
3. **WebView2:** Auf Windows 11 bereits vorinstalliert — nichts zu tun.

## 2. Entwicklung (Live-Fenster)

```
cd I:\4neverCompanyOS\src-tauri
cargo tauri dev
```

Der erste Build dauert einige Minuten (alle Rust-Abhängigkeiten werden
kompiliert), danach startet die App als Fenster. Schließen des Fensters
minimiert in den Tray (Icon unten rechts); wirklich beenden über
Tray-Rechtsklick → **Quit**.

## 3. Release-Build / Installer

```
cd I:\4neverCompanyOS\src-tauri
cargo tauri build
```

Ergebnis:
- Die fertige EXE: `src-tauri\target\release\4neverCompanyOS.exe`
- Installer (MSI / NSIS-Setup): `src-tauri\target\release\bundle\`

## 4. Daten

Die Desktop-App benutzt **dieselben Daten** wie die Web-Version:
`I:\4neverCompanyOS\data` (Tasks, Notes, Runs, Config) und
`I:\4neverCompanyOS\vault` (Markdown-Vault). Es gibt nichts zu migrieren.
Optional lässt sich der Datenordner per Umgebungsvariable `FOURNEVER_ROOT`
auf einen anderen Pfad umbiegen.

## 5. Tests der Kern-Logik (optional)

```
cd I:\4neverCompanyOS\src-tauri
cargo test -p fournever_core
```
