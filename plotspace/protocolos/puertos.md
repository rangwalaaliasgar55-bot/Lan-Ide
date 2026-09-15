<!-- LAN_IDE_PUERTOS_START -->
## 🔌 Port rule (LanIde)

**Port 3000 is FORBIDDEN**: that's where Lan Ide runs (the dashboard orchestrating you). Running anything on 3000 breaks it.

Before running ANY server (dev server, API, preview, http.server):

1. See which ports are already in use:

       ss -tlnp 2>/dev/null || lsof -iTCP -sTCP:LISTEN -P -n

2. Pick a FREE port that doesn't clash with any in use (for dev servers use the 5000-5999 or 8081-8999 range if free).
3. Pass the port explicitly to the command (`--port`, `-p`, `PORT=`); don't trust the tool's default.

NEVER kill a process on a port you didn't start: it can be LanIde, another agent or a preview in use.
<!-- LAN_IDE_PUERTOS_END -->