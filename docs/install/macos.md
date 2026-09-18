# Install on macOS

One command (needs [Homebrew](https://brew.sh); Xcode CLT if you don't have git yet):

```bash
curl -fsSL https://raw.githubusercontent.com/rangwalaaliasgar55-bot/Lan-Ide/main/install.sh | bash
```

Same script as Linux: full app, `lanide` on your PATH, opens `http://127.0.0.1:3000`.

Terminals are **tmux** sessions.

Want a real window instead of a browser tab? `cd desktop && npm install && npm start`
builds on the same engine, and `npm run dist:mac` produces a `.dmg`
(see [desktop/README.md](../../desktop/README.md)). It is **not notarized** and no
release is published yet, so Gatekeeper needs a right-click → Open the first time.

## Native (from source, manual)

```bash
# Xcode CLT if you don't have them yet (git, clang, …)
xcode-select --install

brew install python@3.12 tmux git ffmpeg

git clone https://github.com/rangwalaaliasgar55-bot/Lan-Ide
cd lan-ide

python3 -m venv venv
source venv/bin/activate
pip install -r plotspace/requirements.txt
pip install -e .                 # registers the `lanide` command

bash scripts/setup-hooks.sh      # optional: anti-secret pre-commit/pre-push
```

### Run

```bash
source venv/bin/activate
lanide
# until `pip install -e .`:
# python3 -m uvicorn plotspace.main:app --host 127.0.0.1 --port 3000 --loop asyncio
```

Open `http://127.0.0.1:3000`.

## What you need besides the app

**Your own agent CLIs** (Claude Code, Codex, opencode, …). Link them in
⚙ → **Cuentas** (BYOK). Lan Ide does not redistribute those products.

**tmux** and **git** are required.

Optional: `ANTHROPIC_API_KEY` / `GROQ_API_KEY` in `plotspace/.env` for
orchestrator-chat extras and cloud STT.

## Where data lives

| | |
|---|---|
| Default (dev checkout) | `<repo>/data` |
| Relocated | `LAN_IDE_DATA_DIR` (e.g. `~/.local/share/lanide`) |

```bash
mkdir -p ~/.local/share/lanide
lanide --datos ~/.local/share/lanide
```

## Docker (optional)

Install Docker Desktop for Mac, then the same compose flow as the README /
[`windows.md`](windows.md) Path B. First build is slow/large; full e2e build
verification is not claimed here.
