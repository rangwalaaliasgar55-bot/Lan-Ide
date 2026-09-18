# Contributing

Fork, branch, PR. Keep it small.

## Setup

Follow the [native install](README.md#install) (`./install.sh` from a clone, or the one-liner there), then:

```bash
bash scripts/setup-hooks.sh   # blocks secrets; don't skip
```

## Tests

```bash
source venv/bin/activate

# Engine (~2000 tests)
python -m pytest

# Frontend — every suite, not just sections/
for t in $(find frontend -path '*__tests__*' -name '*.test.js'); do node "$t" || break; done

# Desktop shell
cd desktop && npm test
```

The frontend command used to be `node frontend/sections/**/__tests__/*.test.js`,
which silently skipped 17 of the 53 suites — `shell/`, `shared/` and the nested
ones don't live under `sections/`, and a non-matching glob is not an error. CI
runs the `find` above; run the same thing locally.

## Lint

```bash
ruff check plotspace backend scripts packaging
```

CI gates on this. The rule set (`[tool.ruff]` in `pyproject.toml`) is
deliberately narrow — **only real bugs**: undefined names, dead imports,
redefinitions, mutable default args. Style is *not* enforced; this codebase has
its own conventions (long comments explaining *why*, Spanish identifiers) and an
opinionated formatter on top would just add noise to every PR.

## Style

- Frontend: vanilla HTML/CSS/JS — no frameworks, no npm
- Colors: `var(--ob-*)`, never raw hex
- tmux/git: synchronous `subprocess.run` (async `create_subprocess_exec` hangs)
- After frontend edits, bump `?v=N` on the `<script>` / `<link>` in HTML
- Interpolating into HTML? Use `esc()`. It escapes quotes too, so it's safe
  inside `attr="${esc(x)}"` — which is where it's mostly used
- Reading config from the environment? Use `plotspace.core.entorno`
  (`entero`/`decimal`/`booleano`/`texto`), never a bare `int(os.environ[...])`:
  a typo in a var must not stop the server from booting
- Shelling out to `tmux`? Go through `terminal_backend`. It degrades when the
  binary is missing instead of raising `FileNotFoundError` from a poller

## Don't commit

API keys, `.env`, `data/`. The pre-commit hook (`scripts/scan_secretos.py`) will stop you.
