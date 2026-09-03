# desk_profiles — the owner's standing defaults, one file per profile

> **DATA.** Nothing here executes. A **`desk_profile`** is a template of standing defaults
> `SKINS.md`, tokens only, unchanged), which **theme**, which **lexicon** (the words — `lexicons/`), which
> **campaign kind** the board opens on, the **Team page's default arrangement**, and the
> RIREKI **detail level** a new tile shows. **A desk_profile is NOT a skin; each one HAS a
> skin and theme.** Applying one copies its fields into a Campaign. Campaign edits then
> stand alone; applying a template again explicitly overwrites them.

**One file per profile, named by its token.** `- **key:** value` lines; everything else is
prose. Fields, all optional — a blank field means "as stock":

| Field | Names | Read by |
|---|---|---|
| `label` · `blurb` · `order` · `hidden` | what a person picks | the ⚙ picker |
| `skin` | a `SKINS.md` entry | `public/js/skins.js` at boot and on pick |
| `theme` | `light` · `dark` · `automatic` | root presentation, before reveal |
| `lexicon` | a `lexicons/` entry | `public/js/lexicon.js` — every `t()` |
| `rireki_view` | `terminal_mirror` · `detailed` · `condensed` · `cherry_pick` · `locked` | a NEW tile's Output, when the tile has no choice of its own |
| `team_arrangement` | slot names in order — `workspace1,roster,workspace2` | the Team page, when a tab has no arrangement of its own |

**Yours and ours.** A file of the same name in your catalogs store replaces ours **whole**;
a new name adds a profile; `- **hidden:** yes` withdraws one of ours (`docs/shadowing.md`).
Five ship: `terminal` · `vibe_code` · `professional` · `home` · `league` — League the gamer one, goofy on purpose. No profile chosen is the
ordinary state of every install older than this file, and it renders exactly as stock.
