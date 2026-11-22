# secret
- **seed:** get a password or key from the owner without it passing through chat
- **when:**
- **depth:** seed
- **serves:** integrations
- **order:** 85

Reach for this when work needs a password, token or key. Ask for it with `secret ask`: a
paste field opens on your tile, the owner pastes it, and you hear only `saved` or
`cancelled`. Use it by its file, never its value: `secret path <name>` gives the file to pass
as `--password-file` or to read inside your own script. Never print it, echo it, or put it on
a command line, in a reply, a log or a commit. A secret can carry an expiry: a date, or never. The owner
picks it beside the value, or you record it later with
`secret expires <name> <YYYY-MM-DD|<N>d|never|clear>`; `secret ls` shows it.

## Usage

The owner hands an Agent a password or key without it ever passing through chat. `secret ask <name> [--for "<what it is>"]` (an Agent) opens a paste field on its tile and waits for `saved: <name>` or `cancelled: <name>`; `secret path <name>` prints the file to use; `secret ls` lists names, each with `expires <date>` or `never expires` when recorded; `secret expires <name> <YYYY-MM-DD|<N>d|never|clear>` records or clears it (also chosen in the paste field: Nothing, a date, Never, or N days). One 0600 file per secret in `services_secrets`, dates beside them in `secrets-expiry.json`; no value is ever printed.
