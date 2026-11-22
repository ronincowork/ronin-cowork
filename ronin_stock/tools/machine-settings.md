# machine-settings
- **seed:** read or change Campaign defaults, providers and Workspace folders
- **when:**
- **depth:** seed
- **serves:**
- **order:** 50

Reach for the settings tool when the owner asks what this box has, what the Campaign has switched on, what a new Team starts from, or which providers and models exist — and when they ask you to change one of those. It is independent of Ronin Host: the host's own operations (survey, accounts, secrets, restart) are `ronin-host`'s, not these.

**Live tool:** every operation below is a typed subcommand of the shipped `machine-settings` executable.

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
or absent Campaign is reported, never guessed. Folders and repositories are not here: they
are rows of a Workspace, changed on its page.

Available session models are read dynamically from the canonical Campaign/provider model
catalog used by the UI dropdowns. This document carries no model list: install and
configuration changes must appear without maintaining a second inventory.
`session_create --help` renders the current provider/model choices and defaults from that
same source.

Every Agent can use the same typed reads and writes. Mika also receives
`session_create` as a separate grant. Her house guidance tells her to show the owner the
intended change and wait for a yes before writing, and not to handle credentials. These are instructions to Mika, not identity checks in the tool.

## Usage

Typed, secret-free Machine and Campaign configuration. `machine-settings --help` lists read and write operations for the Campaign, installations, Agent and Cowork defaults, providers, machine facts, and owner profile. The same operations are available to every Agent given this tool.
