# Troubleshooting

## First: ask the engine what's missing

```bash
curl -s localhost:3000/api/system/preflight | python3 -m json.tool
```

```json
{
  "ok": false,
  "faltan_criticos": ["tmux"],
  "binarios": [
    {
      "nombre": "tmux",
      "presente": false,
      "critico": true,
      "para": "motor de terminales (sesiones persistentes de los agentes)",
      "arreglo": "sudo apt install tmux   # o: dnf/pacman install tmux"
    }
  ]
}
```

The same check runs at startup and prints a warning to the console, so the
answer is usually already in your terminal. `arreglo` is the exact command for
your platform.

---

## "Terminals do nothing" / a terminal opens and closes instantly

**Almost always: `tmux` isn't installed.** It *is* the terminal engine — Lan Ide
has no fallback PTY.

```bash
sudo apt install tmux      # Debian/Ubuntu
brew install tmux          # macOS
sudo dnf install tmux      # Fedora
```

What you should see when it's missing — and what it used to do:

| | Now | Before |
|---|---|---|
| Creating a terminal | `503` + the install command | `201 Created`, a dead card in the grid, and a row in the DB that the next reboot tried to resurrect |
| Opening one | The reason printed **in the terminal**, socket closed `4503` | `1011`, "connection lost", reconnect loop, a traceback per retry |
| `GET /terminals/{id}/snapshot` | `404` | `500 Internal Server Error` |
| Background pollers | Quiet | A traceback per second, per terminal |

If you see any of the "before" column, you're on an old build.

## The port is taken

```
[Errno 98] Address already in use
```

Another engine is already running — often one you started earlier and forgot.

```bash
curl -s localhost:3000/api/health     # is it Lan Ide?
LAN_IDE_PORT=3100 lanide              # or just use another port
```

The desktop app handles this for you: it detects a live engine and attaches to
it instead of starting a second one.

## The server won't start after editing config

Since the `entorno` helper, a bad environment variable can't stop the boot: it
warns and falls back.

```
[entorno] WATCHDOG_INTERVALO_S='fast' no es un número entero — uso 20
```

If you get one of those, the variable is being ignored. Note `''` counts as
unset — `export LAN_IDE_PORT=` and a compose file with `${PUERTO}` undefined
both land there.

## Voice dictation returns an error

`ffmpeg` is missing. It's optional — everything else works without it.

```bash
sudo apt install ffmpeg   # brew install ffmpeg
```

## The desktop app shows "no pude levantar el motor"

The error screen names the cause and shows the last lines of the engine log.
The usual ones:

- **Missing dependencies** → run `./install.sh` from the repo root, or
  `pip install -r packaging/requirements-base.txt` into `venv/`.
- **Port busy** → `LAN_IDE_PORT=3100 npm start`.
- **No Python** → install Python 3.11+ and make sure it's on `PATH`.

The app doesn't bundle Python; it looks for `venv/` first, then the system one.

## Nothing above matches

```bash
python -m pytest                 # engine
cd desktop && npm test           # desktop shell (boots the real engine)
```

If those pass, the engine is healthy and it's worth
[opening an issue](https://github.com/rangwalaaliasgar55-bot/Lan-Ide/issues/new/choose)
with the output of `/api/system/preflight`.
