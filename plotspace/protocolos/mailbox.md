<!-- LAN_IDE_MAILBOX_START -->
## 📬 Agent mailbox (LanIde)

To tell ANOTHER agent in this workspace something (you changed an interface it uses, a bug in its area), add ONE line at the end of `.lan-ide/MAILBOX.md` with this exact format:

    - @YourName -> @OtherName: short, actionable message

The mailbox is 1-to-1: 1 line = 1 CONCRETE recipient, with the EXACT name of its terminal (your name is your task/terminal name, e.g. "Backend"). There is NO broadcast: messages to "everyone" reach no one. Zero idle chatter — no announcing progress, thanking or asking others to test: what you want verified, verify it yourself in your terminal. To read, read YOUR messages with `.lan-ide/jv inbox` — NEVER re-read `.lan-ide/MAILBOX.md` whole (the inbox gives you only yours, unread markers).
<!-- LAN_IDE_MAILBOX_END -->
