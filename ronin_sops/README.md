# ronin_sops — how this house works

Standard operating procedures: the owner's way of planning, building out, deploying —
the process choices the macros defer to, one SOP per file. The catalogs say *what you
can do*; an SOP says *how, and where, this install does it*.

**Deliberately near-empty.** Stock SOPs are screened in one at a time, exactly like
the library. The one principle the stock set will preach: **a document produced in
development is either WIP or persisted** — WIP is temporary by definition, deleted
when its work lands, never amended into a log (git is the history; this is not the
Library of Congress); a persisted document describes what is built and how it works,
so the next agent can read it. Finishing a build-out means deleting its WIP document
and, when the facts changed, persisting a state-of-fact document.

**Yours beats ours, file for file.** Your own SOPs live in the `sops` store
(`$(ronin-store sops)` — never spell the path): a file there with the same name as a
shipped one replaces it whole; a new name sits beside stock. Nothing here is
prescriptive — the shipped SOPs are a default way of working, and redefining yours is
how your sessions inherit *your* process instead of ours.
