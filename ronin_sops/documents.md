# documents — where a development document lives, and for how long

> Stock SOP. Your own copy in the sops store (`$(ronin-store sops)/documents.md`)
> replaces this file whole — these are defaults, not law. Actions that carry
> `- **sop:** documents` resolve their locations from here.

**Every document produced in development is one of three things, and lives in one of
three directories of the project_repo:**

- **`wip/`** — what might be. Plans, build-outs, handoffs, scratch. Mutable and
  mortal: **finishing a piece of work includes deleting its wip documents.** Never a
  log, never amended into a record — git is the history; we are not the Library of
  Congress. Handoffs go in `wip/handoffs/`, build-out plans in `wip/buildouts/`.
- **`docs/`** — what is. Standing, state-of-fact only: what is built, how it works,
  how to start it — what the next agent's reading list points at. Updated when the
  facts change; never a diary, never a history section.
- **`manifest/`** — the drawer: terse lines about where this repo has been, is, and
  is pointed. One line per entry — date · what · pointer (commit, PR, file) — in
  `manifest/MANIFEST.md`, appended, never rewritten. Past, present and future all
  belong; **prose does not**: state-of-fact goes to `docs/`, thinking goes to `wip/`
  and dies there. If an entry needs a second line, it wants to be a commit message
  or a doc.

```
2026-08-14 · render check FAIL→PASS; catalogs ship · a35c0e1..81cb3b5
2026-08-14 · next: wire the SOPs into the stock actions
```

**Landing work ends with three questions:** which wip documents does this delete?
(all of its own) · did the facts change enough to write or update a standing doc? ·
did this produce a line for the manifest?
