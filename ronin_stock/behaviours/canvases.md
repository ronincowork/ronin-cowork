# Canvases
- **seed:** A canvas is a one-page map of a Workspace: its live site, repos, work, documents and outside services. Read it with `canvas read <name>`; keep the typed parts true as you change things: `ronin-help canvases`.
- **when:** cowork
- **depth:** seed
- **order:** 36

A Workspace may have one or more canvases; each is one page showing what it is made of and how
each part is now. Your Team's line on the work record names its canvases; `canvas ls` lists the
Workspace's.

- **When to make one:** the user asks, or a lead sets up a Workspace whose kind a template
  suits (`canvas templates`). `canvas create <name> --template <t>`, then trim it to what
  the Workspace has: `canvas edit <name> remove <block>` for a block it lacks. A template is
  one option; the canvas is then the Workspace's own.
- **Live blocks keep themselves.** An integration, the repos, the work items and the
  documents are read where they live each time `canvas read` runs; nothing of them is
  written into the canvas, and there is nothing to update.
- **Typed entries are yours to keep true.** Anything outside Ronin the Workspace depends on
  (a DNS registrar, a mail service, a domain): add it the moment it exists, change it when it
  moves, remove it when it goes: `canvas edit <name> add|change|remove <block> <entry> "<line>"`.
  Ronin stamps who and when.
- One line per entry, with a link where there is one. Never put a key, token or password in a
  canvas: name the secret that holds it, never its value.
