# Secret
- **label:** Secret
- **blurb:** How do I get a password or key from the owner without it passing through chat?
- **class:** cowork
- **requires:** —
- **order:** 85

Reach for this when work needs a password, token or key. Ask for it with `secret ask`: a
paste field opens on your tile, the owner pastes it, and you hear only `saved` or
`cancelled`. Use it by its file, never its value: `secret path <name>` gives the file to pass
as `--password-file` or to read inside your own script. Never print it, echo it, or put it on
a command line, in a reply, a log or a commit. A secret can carry an expiry: a date, or never. The owner
picks it beside the value, or you record it later with
`secret expires <name> <YYYY-MM-DD|<N>d|never|clear>`; `secret ls` shows it.

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `secret ask` | write: opens a paste field on your tile for the owner and waits; answers `saved: <name>` or `cancelled: <name>`, never the value | priority | `secret --help` |
| `secret path` | read: the file holding a saved secret (`secret ls` lists the names, each with `expires <date>` or `never expires` when recorded) | priority | `secret --help` |
| `secret expires` | write: records a saved secret's expiry (`YYYY-MM-DD`, `<N>d` from today, `never`) or clears it (`clear`); the value is not touched | | `secret --help` |
