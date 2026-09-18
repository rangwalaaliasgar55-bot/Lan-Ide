# Lan Ide — desktop shell (Electron)

A native window around the existing engine. **Not** a rewrite: the product is
still the Python engine (`plotspace/`) plus the vanilla frontend (`frontend/`).
This adds what a browser tab can't:

- **Lifecycle.** Starts the engine on open and **stops it on close** — no
  orphan `uvicorn` holding port 3000 until the next reboot.
- **An honest startup screen.** "Starting the engine…", and if it fails, the
  reason plus the fix — instead of the browser's `ERR_CONNECTION_REFUSED`.
- **Native menu, shortcuts, single instance**, and a guard that sends external
  links to the system browser.
- **Adopts a running engine.** If you already started one with `lanide`, the
  app attaches to it and does *not* kill it on close. It isn't the app's.

## Run it

```bash
cd desktop
npm install
npm start
```

The engine is found automatically: `venv/` first (so a repo installed with
`install.sh` uses its own dependencies), then the system Python. Override the
port with `LAN_IDE_PORT=3100 npm start`.

## Tests

```bash
npm test          # 25 tests, no display needed
```

Two suites, and the split is deliberate:

| File | What it covers |
|---|---|
| `test/engine-config.test.js` | Pure decisions: interpreter order, `--loop asyncio`, the URL guard, failure diagnosis. |
| `test/engine-process.test.js` | The **real** engine: boots it, waits for `/api/health`, kills it, and asserts the port is actually free. Skips if there's no `venv`. |

The process suite isn't mocked on purpose — the bug worth catching here is
"an orphan uvicorn kept the port", and a mocked `spawn` never sees it.

## Package

```bash
npm run dist:linux     # AppImage + deb
npm run dist:mac       # dmg + zip
npm run dist:win       # NSIS installer
```

`electron-builder` copies the engine into `resources/engine` (see
`extraResources` in `package.json`); `main.js` prefers that path when it
exists and falls back to the repo for development.

**The build does not bundle Python.** The app looks for an interpreter on the
machine. That's the same contract as the rest of Lan Ide — BYO runtime, BYO
agent CLIs — and it keeps the artifact in the tens of MB instead of hundreds.

## Layout

```
desktop/
├── src/
│   ├── main.js            # Electron only: window, menu, app events
│   ├── engine-config.js   # pure decisions (testable without Electron)
│   └── engine-process.js  # engine lifecycle: spawn, wait, stop
└── test/
```

`main.js` holds nothing worth testing in isolation; everything that can break
quietly in a refactor lives in the other two, which run under plain `node --test`
— that's what lets CI verify the engine actually starts and the port is
released, with no display attached.
