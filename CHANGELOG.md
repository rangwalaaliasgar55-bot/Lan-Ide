# Changelog

The update notice's news are **auto-detected from git** (new commits, grouped by area). This file
is only a fallback for the case git goes away. Format: `## X.Y.Z` + bullets `- …`, newest first.

## 1.7.6
- Windows: validate the exact PowerShell script embedded in `LanIdeSetup.exe` with the Windows parser before building, preventing broken setup releases.
- Windows: hardened the WSL command construction to avoid here-string parsing failures.
- Release: rebuilt `LanIdeSetup.exe` with the corrected installer and SHA256 checksum.

## 1.7.5
- Windows: fixed the embedded PowerShell here-string terminator so the setup script parses completely after the quoting fix.
- Release: rebuilt `LanIdeSetup.exe` with the corrected installer and SHA256 checksum.

## 1.7.4
- Windows: fixed the setup bootstrapper's PowerShell quoting so the embedded installer parses and can pass repository values safely into WSL.
- Release: setup builds are pinned to this release and published with a SHA256 checksum.

## 1.7.3
- Brand: Lan Ide naming across app, docs, scripts, and install paths; founder listed as Aliasgar Rangwala.
- Release: added a Windows `LanIdeSetup.exe` bootstrapper workflow with checksum assets for downloadable releases.

## 1.7.2
- Install: one command per OS (`install.sh` on Linux/macOS, `install.ps1` on Windows). Full app; Windows leaves LanIde.bat on the Desktop.

## 1.7.1
- No access token: you open `http://localhost:3000` and you're in. The default remains 127.0.0.1.

## 1.7.0
- Voice: first run asks for a free Groq key and the key (or Mouse 1–4) to dictate with.
- Accounts: a CLI already logged in on the system (Grok, Claude, …) shows up without pressing Connect.
- Terminals: the mouse wheel reaches Grok and other TUIs in normal buffer; resizing no longer leaves text leftovers.

## 1.5.0
- Interface: the update notice shows what each version brings, grouped by area.
- Engine: restart in place (re-exec) — agent chats survive updates.
- Security: voice transcription with size limit and isolated temp files.
