# Session Control

Each session stores `@ronin-control` as `user`, `read`, or `write`. The tile shows that
value as 👤, 👁, or 🤖, and the owner can change it from the tile.

Control is a visible coordination preference. It does not authorize or deny API calls,
messages, work-record reads, page arrangements, tmux reads, or tmux writes. Tools may show
the value alongside a session so people can coordinate around it.

The value is stored on the tmux session and returned by
`GET /api/sessions/:name/control`. The tile changes it through
`POST /api/sessions/:name/control`.

`bin/shim/tmux` has one separate responsibility: `tmux kill-server` and tmux's accepted
abbreviations for that command are unavailable because they end every session.
