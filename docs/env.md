# The .env file — knobs and secrets, and why it is neither

`ronin.json` holds what the owner *set*; `.env` configures the *process* and holds the
*values that must never leave it*. Different file, different rules, and the difference is
the point of this document. The pair: `docs/user-config.md` is `ronin.json`'s contract;
this is `.env`'s. The unified representation over both is settei (`docs/settei.md`).

**Everything in `.env` is one of two kinds:**

- **a knob** — configures the operator process itself. Read once at start, so a change is
  **inert until the operator restarts** (the house calls this BYOKI). That is why a knob
  must never sit in a settings UI looking editable: the file updates instantly and the
  running code does not.
- **a secret** — a value that lives here and *only* here. Settei reports its **name and
  presence**, never the value; no surface renders one, no route accepts one.

## The variables

Copy `.env.example` to `.env` and edit; every value is optional with a sane default.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3006` | the port the operator listens on |
| `BIND` | the tailnet IP (`tailscale ip -4`) | bind address. Unset = tailnet-only, the recommended deployment; `127.0.0.1` = local only; `0.0.0.0` = all interfaces — with no auth the server **refuses to start** that way |
| `GRID_USER` · `GRID_PASS` | unset | HTTP Basic gate, both required to enable. The owner's browser login is separate (`bin/ronin-passwd`); either satisfies the gate |
| `RONIN_ALLOWED_ORIGINS` | unset | extra hostnames a browser may open a websocket from — only needed behind a non-Tailscale reverse proxy that rewrites `Host` |
| `TMUX_WINDOW_SIZE` | `latest` | window-size policy for browser viewers beside another client (`latest` / `largest` / `smallest` / `manual`) |
| `TMUX_MOUSE` | `on` | wheel scrolls scrollback (`on`) or is translated to arrow keys (`off`) |
| `RONIN_NEW_SESSION_DIR` | `$HOME` | where a picker-born session starts when no project root decides it |
| `SCRIBE_URL` | `http://127.0.0.1:3004` | the dictation proxy |
| `RONIN_USER_ROOT` · `RONIN_DATA_ROOT` | store defaults | relocate the two store roots (`src/stores.ts`) |
| `RONIN_<ID>_DIR` | per store | override a single store's directory |
| `ANTHROPIC_API_KEY` · `OPENAI_API_KEY` and kin | unset | **provider credentials — the secrets.** Cowork itself never reads a value; a koshi outlet reads the variable its `keyEnv` *names*, and agent CLIs in panes read their standard variables |

## The secrets rules

- **Values live here and nowhere else.** Settei's env scan contributes a name and a
  boolean to the record; `tejun-secrets` prints names and has *no flag to print values*;
  `ronin-doctor` never sources this file.
- **A pane inherits the service's environment**, not the shell you typed in — when they
  disagree, the pane is what counts. How a credential is supplied and audited is
  `ronin_sops/secrets.md`.
- **A set key silently outranks a subscription login** for CLIs that check the variable
  first — an owner on a subscription who exports a key is moved onto per-token billing
  with no symptom but the invoice. Put a key here deliberately, not by habit; the SOP
  carries the full resolution order.

## Applying a change

Edit the file, then restart the operator — that is what makes a knob a knob.
`bin/ronin-doctor` is how you check what the running process actually has.

## How this file appears in settei

Only as **found presence**: `observed.keys` says which key names are set. Knobs are not
in the record today; if they are ever shown, they render read-only with the restart
caveat, because a knob in an editable row is a lie about when it takes effect.
