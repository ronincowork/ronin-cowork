# Integrations

The integrations index: one record per outside service a user brings (hosting, a
database, mail, a tracker, anything). Ronin uses every one the same way; a bridge is
optional, only for efficiency. Without one, Agents use the provider's own CLI and API.

A record names no Workspace: a Workspace lists the integrations it uses
(`<workspaces>/<campaign>/<ws>.json`, `integrations`), so the link lives in one place.

Fields:

- **label:** the provider's name.
- **blurb:** one line: what it is for, and what Ronin adds (a bridge, or none).
- **for:** what it is for, in a word or two (hosting, tracker, research, memory).
- **tools:** what Agents use: the provider's CLI and API, and the bridge if there is one.
- **bridge:** the bridge Ronin has for it (a Services part or a command), or `—`.
- **token:** the file in `~/ronin/services_secrets/` that holds its token; `{campaign}` is
  the Campaign's id. Absent, it is `<name>-{campaign}.env`: plain `KEY=value` lines, mode 0600.
- **keys:** the `.env` keys Connect asks for, comma-separated.
- **panel:** a panel of its own the Integrations panel opens (jira), or `—`.
- **state:** where a running bridge reports its live state (`/api/...`; `{campaign}` and
  `{workspace}` filled in), or `—`. The panel shows what it reports.
- **order:** where it sits in the list.

Agents add a record when they connect a new provider and remove it when it goes. Those
records go in the owner store, `~/ronin/catalogs/integrations/<name>.md`; the same name
there shadows a shipped one.
