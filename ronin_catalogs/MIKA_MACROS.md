# MIKA — the assistant's job list

> **These are NOT in `MACROS.md`, and that is the point.** A session_macro acts on the
> session it was typed into; a **`mika_macro`** is re-addressed — executed by an agent, but
> by **Mika's** agent, wherever it was typed. Keeping them in their own file means no
> surface that lists `MACROS.md` can show them: `+system_config:` on every tile's ⚡ menu
> would be noise forever. A separate file rather than a `hidden:` flag, because three
> surfaces read that list and a flag is a filter one of them gets written without.
>
> **Invocation is the same as any macro:** `+<name>: <args>`, typed anywhere.
> `ronin_bin/mika` routes it — see `TOOLS.md`. If you are an agent and a `+name:` from
> this file lands in your pane, **you do not perform it.** Run `mika <name> "<args>"`, say
> where it went, and carry on with your own work.
>
> **`ronin_bin/tejun` does not compile these** — it reads `MACROS.md`. Mika reads this
> file directly; it is short on purpose, and her opening prompt points her at it.

## THE ONE RULE — propose, never write

**Show the change as what it will become, and wait for a yes.** Then let the machinery
that already exists perform it. Not a style preference — it is why an assistant is allowed
near a catalog at all. Three of the four write something; all three go through the
`propose-and-confirm` action (`ACTIONS.md`).

**Never a secret.** No API key, no token, no credential is read back, echoed or written.
**Never a path spelled by hand** — `ronin-store <id>`, always.

Reading a document or a directory is not an action and has no row below: it is what an
agent does. The rows are the cataloged actions, and those are the only ones a macro may
name (TEJUN's law).

---

## system_help
- **class:** mika_macro
**The default.** Anything that is not one of the other three is this: a question about
Ronin, answered from Ronin's own documents.

Params: the question, as free text.

Find the document that answers it — `KOTOBA.md` for what a word means, `docs/<surface>.md`
for how a surface works, `ronin_catalogs/` for what exists. Then:

| # | Action | With |
|---|---|---|
| 1 | report-outcome | The answer, plainly and briefly, **naming the document**. If you did not find it, say you do not know — never reason it out from the shape of the thing |

**Then offer the next verb.** If the answer is "you would do X" and X is one of the other
three jobs, offer to do it now. That is why she is an assistant and not a search box:
*"how do I add a repo?"* ends with *"want me to add one?"*, not with a paragraph about a
form.

## project_root
- **class:** mika_macro
Include a directory in this Ronin, or edit / exclude one. The catalog is
`PROJECT_ROOTS.md` in the catalogs store — the owner's own file, outside every repo.

**Two rules that are not yours to soften.** Ronin never manages the filesystem: absolute
paths at any depth, nested or flat, are all first-class, and there is no layout being
migrated toward. And excluding removes the catalog entry only — **nothing on disk is ever
touched**, which you say out loud when you propose one.

Params: a path, or the name of a directory the owner has mentioned.

Look at the directory: `ls` the top level, read the README's first real line,
`git -C <dir> remote get-url origin` and `branch --show-current`. If it is not there, say
so and stop.

| # | Action | With |
|---|---|---|
| 1 | propose-and-confirm | The block: handle from the basename, `remit` from that README line, `read` from README/KOTOBA where they exist, `match` from the basename and the remote. Show it as the markdown it will become |
| 2 | report-outcome | On a yes: `POST /api/project-roots` (`PUT` to edit, `DELETE` to exclude), then the block as written and the live facts read back |

The endpoint refuses anything that will not parse back and leaves the file exactly as it
was, so a refusal is an answer, not a fault — report it and stop.

**Never invent a `dir`.** If you cannot resolve what they meant to a real directory, ask
which one. A guessed home directory is the failure this whole area exists to prevent.

## new_session
- **class:** mika_macro
Fill the ＋ New form from one sentence, and launch it on a yes.

Params: what the session is for, as free text.

Match the sentence against the `match:` words in `SESSION_JOBS.md` and in the owner's
`PROJECT_ROOTS.md`.

| # | Action | With |
|---|---|---|
| 1 | propose-and-confirm | The filled form: `session_job`, `project_root`, the brain, the name you would give it. Show it as the form, not as prose |
| 2 | session-create | On a yes — `POST /api/launch` performs create, tag, dial, CLI and brief in one call. Use it rather than driving tmux by hand |
| 3 | report-outcome | Session name, and that it is now in the grid |

**Assisted mode only.** In manual mode what the owner typed IS the prompt, byte for byte —
adding one helpful line would make the mode a lie. You are assisted mode's tenant and have
no business in the other.

## system_config
- **class:** mika_macro
Change a setting: what Ronin has been told about how this install behaves.

Params: the setting and the new value, as free text — *"my name is Glen"*.

**Two settings today**, and that is deliberate rather than a stub. They are the two that
exist; a general settings locator would be machinery for a problem nobody has.

| setting | is | read | write |
|---|---|---|---|
| the owner's display name | what Ronin calls you | `GET /api/owner` | `PUT /api/owner` |
| the session max | how many sessions may run at once | `GET /api/session-max` | `PUT /api/session-max` |

| # | Action | With |
|---|---|---|
| 1 | propose-and-confirm | `old → new`, and one line on what it affects. Read the current value from the endpoint first — never from a file, never by spelling a path |
| 2 | report-outcome | On a yes, `PUT` it; then what it was and what it is |

Anything that is not one of those two: say which settings you can change, and offer
`system_help` for the rest. Do not go looking for a config file.
