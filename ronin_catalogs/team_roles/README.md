# team_roles — what a TEAM is, one file per team_role

> **DATA.** Nothing here executes. A **`team_role`** is a TEAM's defining role —
> `development`, `health_fitness`, `admin` — named by a team's roster
> (`<team_rosters store>/<team>.md`, the `team_role:` line). It is **the team's and never
> a session's**: a session on two teams wears each team's role contextually, and nothing
> on a session ever stores one (R35, 2026-08-23).

**One file per team_role, named by its token** — a `development` team_role is a file with that token's name.
**Format:** `- **key:** value` lines; everything else is prose. Fields: `icon` · `label` ·
`blurb` · `order` · `hidden`.

**The reading is the point.** A team_role's build brief lives on its shelf —
`team_role/<name>/` on the session-boot shelf — and every session SPAWNED INTO a team
wearing it reads that shelf at birth, beside `all/`, its root's and its session_role's.
Birth-only, by ruling: a session that joins the team later is not re-briefed ("if you
join later, let's not go back and redo it" — the owner, 2026-08-23).

**A roster may name a team_role with no file here.** The reading shelf is then simply
empty; the name still renders on the League and the roster. Blank is valid everywhere in
this house, and an empty team_role is a label the owner has not yet made mean anything.

**Yours and ours.** A file of the same name in your catalogs store replaces ours
**whole**. A new name adds a team_role. `- **hidden:** yes` withdraws one of ours. The
rule in full: `docs/shadowing.md`.

---

*The house ships none: a team_role is the owner's own vocabulary for their teams, and a
stock guess would be furniture. Build Team offers the ones you have defined
(`GET /api/team-roles`) and accepts a fresh label all the same.*
