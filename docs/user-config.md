# The user config — the owner's own settings, and how to add one

**One file, one bus, two doors.** `ronin.json` in the `config` store holds what the owner
has decided. It is theirs, not ours: it lives under **ronin_user_root**, so an uninstall
leaves it.

```
bin/ronin-store config            where it is on this machine
src/user-config.ts                every read, write and publish
src/settei.ts                     the assembled record the ⚙ Configuration tab draws
```

> **Restored to this repo 2026-08-17.** This document is cited by `src/user-config.ts` and
> by KOTOBA § SETTEI, and it did not survive the repo split — it existed only in the frozen
> tree, so every one of those citations pointed at nothing. Brought across and made true
> against what is actually in the file today, which is more than the three settings the old
> copy described.

## What is in it

| Section | What | Written by | Bus option |
|---|---|---|---|
| `sessions.max` | how many sessions may run at once | `PUT /api/session-max` — ⌂ Roster and ⚙ Configuration, **one route** | `@ronin-session-max` |
| `owner.name` | what to call the owner | `PUT /api/settei/owner` | `@ronin-owner` |
| `machine.name` · `machine.where` | what this box is called, and where it is | `PUT /api/settei/machine` | none |
| `agents.sessions.default` · `agents.sessions.by_provider` · `agents.jobs` | how work gets a model — the install's one default, each provider's preferred model, and what a house job asks | `PUT /api/settei/agents` — merges per key, so saving one never drops another | none |
| `gbrain.enabled` | whether the owner turned gbrain on | `PUT /api/settei/gbrain` | none |
| `koshi` | which outlet each koshi job asks | the 目 Koshi tab | none |
| `auth` | the login record — scrypt params **and the session signing secret** | `bin/ronin-passwd` | none |
| `passkeys` | registered authenticators, and the one-shot recovery code | `/api/passkey/*` | none |

**The file has two kinds of tenant.** The sections above the line — owner, machine,
sessions, agents, gbrain, setup — are **settei's typed half**, and the assembled
record (`docs/settei.md`) includes them. The last three — `koshi`, `auth`, `passkeys` —
share the file and are **not settei**: `koshi` is 目's wiring, and `auth`/`passkeys` are
credentials the record must never carry. Same storage, different tenants; the file is not
the object.

Services activation is not a `ronin.json` tenant. Its non-secret state is the activation
aggregate in the config store and its bearer token is in the `services_secrets` store.
Older `ronin.json.services` keys are inert residue from the retired pasted-code flow.

**Most sections have no bus option, and that is the rule working rather than an exception
to it.** Nothing in `bin/` or `ronin_bin/` parses an outlet choice, a machine name or an
entitlement — checked, not assumed. The rule below is *if a bash tool needs a setting,
publish it*; an option with no reader rots faster than no option at all. Publish when a
reader appears.

## The rule that matters most

> **Absent must mean a sensible default, never a hard stop and never a wrong answer.**

An install that has never opened the settings must behave correctly. `sessions.max` absent
is *no limit* — treating it as zero-allowed would make a fresh install refuse to start its
first session. `owner.name` absent is *this machine's user*, and `machine.name` absent is
*the hostname*, because a config you must fill in before the product stops guessing at who
you are is a config that ships wrong.

This is not politeness. It is what lets a setting be added without a migration: every
existing install already has the right value for a key that does not exist yet.

## The shape

```
        ronin.json              what the owner set  (only the UI/API writes it)
            |
            v   Ronin, on boot and on every save
     @ronin-<setting>           a tmux SERVER option — the bus
        /            \
   the server      bash tools
```

**Why a bus at all.** A Node server and a zero-dependency bash tool both need some of these
values, and `bin/` may not grow a JSON parser — the RIREKI recorder runs from tmux hooks
with nothing guaranteed present. A tmux *server* option is readable from both sides in one
command.

**So a write is two acts, always** — for a setting that has a bus option. Save the file,
then publish. A saved value the bus has not heard about is a setting one door enforces and
the other does not, and they disagree silently until the next restart. `writeMax` and
`writeOwner` both do it.

## `ronin.json` and credentials — what is true, and what is not

**The file DOES hold credentials.** `auth` carries a scrypt record and `auth.secret`, which
signs session tokens; `passkeys.recovery` carries a hash. Two places in the house used to
say the opposite, and both were corrected on 2026-08-17 (cowork dev `17067eb`) — the claim
was *"it is served whole over HTTP by design and holds no secret"*, and **both halves were
false: nothing serves it whole, and it does hold secrets.**

What survives, and what every reader must keep true:

- **No route serves the document, and none may ever be added.** `GET /api/settei` assembles
  a record from NAMED keys; it does not read the file out. The obvious implementation of
  "one place you see the setup" is a GET that returns the config, and that GET would hand
  out the signing secret.
- **No route accepts the document either.** Every write names the keys it may touch and
  ignores the rest of the body, so a browser cannot post a new `auth` section no matter
  what it sends.
- **A key is rendered as its variable NAME and a boolean.** `agents.jobs[*].key_env` is the
  *name* of the env var an outlet needs; the value lives in `.env` and there is no field
  anywhere that would accept one.

## Adding a setting

1. **Decide the absent-behaviour first.** If you cannot name a default that is correct on a
   box that has never been configured, the setting is not ready.
2. **`read<X>()`** — parse, and return the default on anything unexpected. Absent,
   unreadable, not-JSON and wrong-typed all mean *default*; none of them mean *throw*. The
   owner's editor should never be able to take Ronin down. Build it on **`readSection()`**.
3. **`write<X>()`** — **go through `updateConfig()`, never `writeFile` directly.** It reads
   the whole document, hands it to you to mutate, and writes it back through a temp file and
   a rename. That is what preserves every key you did not come to change, and what stops two
   tabs saving at once from interleaving into half a config. It is also the one place a lock
   would go if the read-modify-write window ever needs one.
4. **Take the narrow shape.** A writer that accepts `{ name, where }` is safe by
   construction; one that accepts an object and assigns it is a hole waiting for a caller.
5. **`publish<X>()`** — only if a bash tool reads it. Best-effort: no tmux server yet is a
   normal state at boot, and failing to publish must never stop Ronin from starting. Call it
   at boot too, so a box edited by hand while Ronin was down still agrees with itself.
6. **Read per call, do not cache.** These files are tiny and edited rarely; a cache buys a
   syscall and costs an invalidation story.
7. **Add the row to the table above**, and to `src/settei.ts` if the ⚙ Configuration tab should show
   it. A setting nothing renders is a setting nobody knows they have.

## What does NOT go in here

- **Measurements.** Hostname, cores, RAM, which CLIs exist, whether a key is set. A stored
  fact is a lie the moment the box changes; `src/settei.ts` measures them on read and stamps
  the answer with `observed_at`.
- **Anything derived.** If it can be computed from two things already here, compute it.
- **The owner's projects.** A `project_root` — its directory, its purpose, its default
  provider and model — lives in `PROJECT_ROOTS.md` in the **catalogs store**, written
  through `/api/project-roots`, and stays hand-editable there. That is a real landing place,
  just a different store. The ⚙ Configuration room *shows* projects with their remit and whether
  their directory still resolves, and links to ▣ Project root to change them; it is not
  their second owner. Said here because both surfaces that write settings pass close enough
  to this to assume otherwise.
- **A campaign, and anything that varies with one.** The campaign's name and description
  and its `desk_profile` were sections here until 2026-08-29; they describe a **body of
  work**, and this file describes a **machine**. They live in the `campaigns` store now, one
  `campaign_config` per record, written only through `src/campaign-config.ts` — one writable
  campaign record and no parallel one. `PUT /api/settei/campaign` and `PUT /api/settei/desk`
  still exist and still work; they land there. The old `campaign` and `desk` keys survive in
  `ronin.json` on an upgraded install as the migration's seed, are never written again, and
  go when the old writable surface does. `docs/campaigns.md`.
- **Device state.** The theme and the grid layout are per browser and belong in
  `localStorage` — a phone showing one tile while a Mac shows a 2×2 grid is correct.
- **A credential the owner types.** There is no such field today, and adding one is a
  decision this document does not get to make on its own.

## Traps this has already hit

- **Bash reads the bus, not the file.** `libexec/ronin-may-spawn` and `ronin_bin/tejun-wipeboard`
  never parse `ronin.json`. If a bash tool needs a setting, publish it.
- **A setting in the wrong ROOT is lost, not just misplaced.** Koshi's outlet choices lived
  under `storeDir('session')` — the root uninstall deletes — for as long as they existed.
  The store table's own sentence decides it (`src/stores.ts`, and the standing doc it
  cites is one of the six that never crossed the split — ronin-lab `OPEN_THREADS` 2.7):
  *if deleting it would lose the user's own work or their choices, it is `user`.* A choice
  made in a UI built for making choices is a choice.
- **A literal is not a default.** `user: glen` sat in `src/wipeboards.ts` for months as
  "hardcoded until a profile exists", so every install signed its owner's posts with our
  owner's name. That is **JUSHO** — nothing shipped names a person — and it is what this
  config exists to prevent recurring.
- **The setting is not live until the operator restarts.** The file and the bus update
  immediately; the *code* that reads them is a memory copy taken at start. `bin/ronin-doctor`
  is how you check.

## Related

`docs/settei.md` (the unified representation over this file and every other source) ·
`docs/env.md` (the other file on disk — knobs and secrets, and why neither is a setting) ·
`src/settei.ts` (the assembled record: set · observed · status) · `ronin_sops/accounts.md`
(the SOP that tells an agent to go and look) · `ronin_bin/tejun-account` (what it looks
with). **Why the record is shaped this way** is SETTEI's plan, which lives in the private
ronin-lab repo and is deliberately not a path in this tree.
