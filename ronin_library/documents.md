# documents — where a development document lives, and for how long

> Stock library page. Your own copy in the library store (`ronin-store library` →
> `documents.md`) replaces this file whole — these are defaults, not law. Actions that
> carry `- **library:** documents` resolve their locations from here, and a compile
> inlines it.
>
> **It moved off the SOP shelf on 2026-08-15**, when the owner ruled that an action leads
> to a library page and never to an SOP. The content did not change: it is reached from an
> action, and that is what the library is.

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

Example entries — one past, one standing intention:

```
2026-05-01 · login flow shipped; sessions carry tokens · 41c9f2b
2026-05-02 · next: rate limiting on the login route
```

**Landing work ends with three questions:** which wip documents does this delete?
(all of its own) · did the facts change enough to write or update a standing doc? ·
did this produce a line for the manifest?
