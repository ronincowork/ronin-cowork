# Machine settings
- **label:** Machine settings
- **blurb:** How do I read or change Campaign defaults, installation choices, providers, and Workspace Folders?
- **class:** cowork
- **requires:** campaign
- **order:** 50

Reach for the settings tool when the owner asks what this box has, what the Campaign has switched on, what a new Team starts from, which providers and models exist, or which Workspace Folders Ronin may work in — and when they ask you to change one of those. It is independent of Ronin Host: the host's own operations (survey, accounts, secrets, restart) are the Host bundle's, not these.

**Live tool:** every operation below is a typed subcommand of the shipped `machine-settings` executable.

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `machine-settings read` | read: one composed, secret-free answer | priority | `machine-settings --help` |
| `machine-settings campaign read` | read: the selected Campaign | priority | `machine-settings --help` |
| `machine-settings defaults read` | read: what a new Team starts from | priority | `machine-settings --help` |
| `machine-settings project-root list` | read: the Workspace Folders | priority | `machine-settings --help` |
| `machine-settings campaign write` | write: title or description | | `machine-settings --help` |
| `machine-settings campaign archive` | write: archive the selected Campaign | | `machine-settings --help` |
| `machine-settings installations` | read/write: the catalog, proven state, and the Campaign's switches | | `machine-settings --help` |
| `machine-settings defaults write` | write: the typed default fields | | `machine-settings --help` |
| `machine-settings project-root` | read/write/create: named fields, archive, exclude | | `machine-settings --help` |
| `machine-settings provider` | read/write: providers and the default model | | `machine-settings --help` |
| `machine-settings machine` | read/write: name, location, monitor | | `machine-settings --help` |
| `machine-settings owner` | read/write: display name only | | `machine-settings --help` |
| `machine-settings session-defaults` | read/write: session maximum, desk profile, Mika level | | `machine-settings --help` |
| `machine-settings messages` | read/write: delivery timeout | | `machine-settings --help` |
| `machine-settings requirements` | read/write: wanted choices; needed is read-only | | `machine-settings --help` |

Bare `read` is the priority: one composed, secret-free answer that keeps four states
visibly apart — **catalogued** (definitions Ronin knows), **installed** (what a runtime
authority can prove present, loaded, parked, or activated; `unknown` where nothing
measures it, never "not installed"), **Campaign on/off** (the selected Campaign's switches),
and **defaults for new Teams** (what prefills the next form and never rewrites an existing
Team).

Every write reuses an existing typed route and its validation; there is no generic patch
door. "Installed" is observed, never set: changing it means running the applicable install,
activation, or restart operation and measuring again. Observed, status, needed, schema, and
measured facts are always read-only.

The selected Campaign is the current session's when `--campaign` is omitted; an ambiguous
or absent Campaign is reported, never guessed. Workspace Folder writes preserve the
workspace-folder-handle; title and directory may change. Archive keeps the catalog entry and removes
it from launch choices; exclude removes only the entry and never deletes a directory or
hosted repository. Inspect a repository's declared arrangement before changing its
profile; adding an existing repository does not rewrite `RONIN_REPO` unless a profile is supplied.

Available session models are read dynamically from the canonical Campaign/provider model
catalog used by the UI dropdowns. This document carries no model list: installation and
configuration changes must appear without maintaining a second inventory.
`session_create --help` renders the current provider/model choices and defaults from that
same source.

Any Agent with this capability can use the same typed reads and writes. Mika also receives
`session_create` as a separate grant. Her house guidance tells her to show the owner the
intended change and wait for a yes before writing, and not to exclude Workspace Folders or
handle credentials. These are instructions to Mika, not identity checks in the tool.
