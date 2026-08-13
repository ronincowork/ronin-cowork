# tools — host-side requirements that ship with cowork

**What belongs here:** small scripts and config fragments that Ronin needs to exist *on the
box* but that neither the server nor an agent calls. They are requirements of the environment,
versioned with the repo so a rebuilt machine gets them back.

**What does not:** `bin/` is tools on PATH that agents call. `scripts/` is build, gate and
smoke tooling. `deploy/` is the systemd and launchd units. If the server or an agent invokes
it, it is not a `hostside/` thing.

**Why this directory exists.** The ⛽ context gauge depends on a Claude Code `statusLine`
script that lived only in `~/.claude/` on the old box. It was never in git, `setup.sh` never
wrote it, and when that box died the feature went dark with it — with nothing broken and
nothing to point at. A documented feature must not depend on an unversioned file in a vendor's
config directory.

**Nothing of ours goes in `~/.claude/`.** That is the agent vendor's directory, it is not
something we can ship, and per-box hand-editing is what caused the loss above. Scripts live
here, in the repo.

> **The unavoidable caveat, and the ruling on it (2026-08-12).** Claude Code only runs a status
> line if `statusLine` is set in one of *its* settings files. The **script** can live here; the
> **registration** cannot — that is the vendor's contract, not our choice. **Ruled: `setup.sh`
> writes that one pointer** into `~/.claude/settings.json`, naming the script in this directory.
> A pointer written once by our installer is not the same thing as our files living in the
> vendor's directory — the file itself stays here, in git, which is the whole point of the rule.
> `setup.sh` merges (other keys survive), is idempotent, refuses to overwrite a `statusLine` you
> set yourself, backs off from an unreadable or invalid settings file with paste-ready
> instructions, and never fails the install over any of it.

## Contents

| | What it is |
|---|---|
| `statusline-ronin.sh` | Claude Code `statusLine` command. Reads Claude's JSON on stdin, emits `⛽ ctx NN% · <model>` for `src/ctx.ts:19` (percentage) and `src/ctx.ts:33` (model) to scrape. **Rebuilt 2026-08-12** from the consumer + the vendor's documented payload — the original died with the old box. Percentage comes from `context_window.used_percentage` (falls back to `remaining_percentage`, then the documented input-token formula over `current_usage`); when Claude reports no reading yet it prints the model alone rather than a fake `0%`. POSIX `sh`, parses with `python3`, **no `jq`** (not installed here); always exits 0. **Registered by `./setup.sh`** (see the ruling above), which writes `"statusLine": { "type": "command", "command": "<repo>/hostside/statusline-ronin.sh" }` into `~/.claude/settings.json`. To turn it on without a full `setup.sh` run, paste that line yourself; Claude Code picks it up on its next launch. |
