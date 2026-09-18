<div align="center">

# Lan Ide

A local web cockpit that runs several AI coding agents side by side — your keys, your machine.

[![License](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
![Python](https://img.shields.io/badge/python-3.11+-3b82f6.svg)
![BYOK](https://img.shields.io/badge/model-BYOK-8b5cf6.svg)

**[Install · Linux / macOS](#linux--macos)** &nbsp;·&nbsp; **[Install · Windows](#windows)**

**Founder:** Aliasgar Rangwala

**Download for Windows:** grab `LanIdeSetup.exe` from the latest [GitHub Release](https://github.com/rangwalaaliasgar55-bot/Lan-Ide/releases/latest).

</div>

You open a project. Lan Ide gives you a grid of live terminals. Claude Code, Codex, OpenCode, Qwen, Antigravity, Grok Build, or a shell — each in its own pane, all on the same branch. You bring the accounts. Lan Ide only orchestrates.

<table>
<tr>
<td width="50%" valign="top">

<h2 id="linux--macos">Linux / macOS</h2>

```bash
curl -fsSL https://raw.githubusercontent.com/rangwalaaliasgar55-bot/Lan-Ide/main/install.sh | bash
```

Then `lanide`. Opens `http://localhost:3000`. macOS needs [Homebrew](https://brew.sh). Details: [Linux](docs/install/linux.md) · [macOS](docs/install/macos.md).

</td>
<td width="50%" valign="top">

<h2 id="windows">Windows</h2>

```powershell
irm https://raw.githubusercontent.com/rangwalaaliasgar55-bot/Lan-Ide/main/install.ps1 | iex
```

Engine runs in [WSL2](docs/install/windows.md). One reboot if WSL is new. Leaves **LanIde.bat** on the Desktop. Details: [Windows](docs/install/windows.md).

</td>
</tr>
</table>

Full app (terminals, voice, preview, Mobile Studio, …). Link your own CLIs in ⚙ → Accounts. Docker: `cp .env.example .env && docker compose up -d --build` (large, experimental).

Something not working? [Troubleshooting](docs/troubleshooting.md) — or ask the
engine directly: `curl -s localhost:3000/api/system/preflight`.

### Desktop app

Prefer a real window over a browser tab:

```bash
cd desktop && npm install && npm start
```

It starts the engine for you and **stops it when you close the window** — no
orphan process holding port 3000 — and if the engine can't start it tells you
why, with the fix, instead of an `ERR_CONNECTION_REFUSED` page. If you already
have one running (`lanide`), it attaches to it and leaves it alone on quit.
Package it with `npm run dist:linux` / `dist:mac` / `dist:win`. See
[desktop/README.md](desktop/README.md).

---

### Start here

The empty workspace. One project, nothing running yet. New terminal, talk to Lan Ide, or open the editor.

<p align="center">
  <img src="docs/images/home-empty.png" alt="Empty Lan Ide workspace — What are we building today? Welcome card with new terminal, talk to Lan Ide and editor shortcuts" width="920">
</p>

### Launch a swarm

Pick agents, how many, and a layout. Seven Claude Codes, a mix, or one shell. They land in a live grid.

<p align="center">
  <img src="docs/images/launcher-batch.png" alt="New terminal — pick Claude, Codex, Grok, Cursor or Pi; not-installed chips, layout, launch" width="920">
</p>

<p align="center">
  <img src="docs/images/swarm-live.png" alt="Lan Ide — a live grid of Claude Code, Codex, and shell agents on the same project" width="920">
</p>

### Editor and radio by your side

Edit your project while the agent works in its own pane — file tree and a live terminal together. Or open the Radio: search YouTube music or play a curated station while the swarm builds.

<p align="center">
  <img src="docs/images/editor.png" alt="Editor — file tree, settings.json, and a Claude Code terminal in the same workspace" width="920">
</p>

<p align="center">
  <img src="docs/images/radio.png" alt="Radio — music search and playback open over the agent grid" width="920">
</p>

### Mobile Studio

Preview your app in a live phone frame — add phone frames, web browsers or project notes to the canvas, zoom to taste. Phones connect to the Expo/Metro the agent started: the empty canvas explains the three steps — start the project, run Metro, the app lands on the frame. Mobile Studio also **detects Expo projects** — when the agent starts Metro, the mobile tab opens on its own (⚙ → Appearance → auto-start).

<p align="center">
  <img src="docs/images/mobile-studio-signal.png" alt="Mobile Studio — empty canvas waiting for the signal, with the 3-step guide: Expo project, Metro --web, live preview" width="800">
</p>

<p align="center">
  <img src="docs/images/mobile-studio-live-frame.png" alt="Mobile Studio — the empty home and the studio side by side: iPhone 15 Pro frame, dock with phone, web, note" width="800">
</p>

### Memory, as a neuron graph

The shared memory of the swarm, as living neurons — each memory is a node (size = connections), the memory itself pulses at the core. Zoom, pan, hover any neuron to see its title and links, or watch the synapses fire.

<p align="center">
  <img src="docs/images/memory-graph.png" alt="Memory graph — scattered neurons with a pulsing core, synaptic connections" width="800">
</p>

### Live on Discord

Windows only: the launcher (`LanIde.exe`) pushes your fleet to Discord — live activity, agent count and uptime while the swarm works.

<p align="center">
  <img src="docs/images/discord-presence.png" alt="Discord Rich Presence — playing Lan Ide, in Terminals, 1 agent (1 of 12), 2:38:07" width="450">
</p>

### Your accounts, not ours

⚙ → **Accounts**. Several logins per CLI, switch without logging in again. Native sessions (Grok, Claude, …) show up even if you never clicked Connect. Rate-limit? It rotates.

<p align="center">
  <img src="docs/images/accounts-switchboard.png" alt="Settings → Accounts — Claude, Codex, Antigravity switchboard" width="920">
</p>

### Make it yours

⚙ → **Appearance**. 24 themes, tint, language, scale. The bench at the top is the live workspace.

<p align="center">
  <img src="docs/images/appearance-themes.png" alt="Settings → Appearance — 24 themes, tint, scale" width="920">
</p>

Also in the dock: web preview, editor, tasks, per-agent diff review. Hold your voice key to dictate (Groq's free Whisper API).

### Radio: local music & Spotify

The Radio searches **local music** (`data/music/` — upload via the UI or drop files into `data/music/audio/`) and **Spotify** (search with your own account, playback in the browser). For Spotify you need a client ID — free at [developer.spotify.com](https://developer.spotify.com/dashboard) → **Create app** → set the **Redirect URI** to `http://localhost:3000/api/radio/spotify/callback` — then put `SPOTIFY_CLIENT_ID` (and optionally `SPOTIFY_CLIENT_SECRET`) in your `.env` (see `.env.example`). Never commit those values.

## Use

| | |
|---|---|
| **Ctrl+T** | New project |
| **Ctrl+\\** | New terminals |
| **⚙** | Accounts, appearance, voice |
| **Ctrl+P** | Dock |

Also: `Ctrl+B` strip · `Ctrl+E` editor · `Ctrl+J` Lan Ide chat · `Ctrl+1…9` jump to a project. Port **3000** is Lan Ide — put dev servers on 5000–5999 or 8081–8999.

## Tests

```bash
source venv/bin/activate
python -m pytest
node frontend/sections/**/__tests__/*.test.js
```

Vanilla HTML/CSS/JS, no npm. PRs: [`CONTRIBUTING.md`](CONTRIBUTING.md). Keep secrets out of git (`data/`, `.env`).

## License

[MIT](LICENSE) © 2026 Aliasgar Rangwala and Lan Ide contributors
