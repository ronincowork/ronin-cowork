# routines — behaviours delivered together, one file per Routine

A Routine definition is the single membership list for a switchable way of working. The
stock directory and the owner's routines definition directory in the catalogs store resolve with whole-file
shadowing. `routine_floor` is deliberately absent: it is mandatory machinery, not a
Routine definition.

## Format

```markdown
# readable heading
- **label:** person-facing name
- **blurb:** one honest line about what it equips
- **reading:** routine/<token>/FILE.md, ...
- **reading_off:** routine/<token>/OFF.md, ...
- **sops:** name, ...
- **macros:** name, ...
- **actions:** name, ...
- **tools:** bare-command, ...
- **mcp:** connection-name, ...
- **requires:** routine-name, ...
- **bundles:** base, worktrees, services
- **order:** 10
```

Use `—` for an empty list. Lists contain names, not copied content. `reading` entries are
boot-shelf coordinates, delivered when the Routine is on; `reading_off` entries are the
same kind of coordinate, delivered when it is OFF — the page that says what the owner is
working without and where the switch is; SOP names omit `.md`; macro/action/tool names use their catalog
tokens. An MCP name is the connection identity the launch adapter resolves, never command
flags embedded in Markdown.

Every referenced stock item must exist. The manifest owns membership: do not also add a
`routine:` field to each macro or tool. Campaign and Team configuration store only their
on/off choices.

`requires` expresses the additive Routine progression, never a list of component-level
dependencies. Selecting a Routine also selects every Routine it requires. Ronin Worktrees
requires Ronin Base; it does not require optional Ronin Services.

`bundles` names the setup rungs that switch this Routine ON — catalog metadata, never
names hardcoded in code (the owner's ruling). The rungs are `nothing · floor · base ·
worktrees · services`; the first two turn nothing on and appear in no list. The stock
campaign map is the `base` rung: Ronin Base and the always-on floor.

An unavailable enabled Routine never refuses birth. Its available result is empty or
partial as the adapter reports, and the birth receipt names what was not delivered.
