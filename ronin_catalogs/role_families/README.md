# role_families — WHO a session is, one file per role

> **DATA.** Nothing here executes. A **`role_family`** is the durable hat a session wears —
> Developer, QuarterBack, PersonalAssistant. It is **optional and FIXED**: chosen at
> birth, carried in the session's letter, and refused by every ordinary write afterwards.
> A blank role is valid and means no role reading.
>
> A role is the promoted successor to `job_class` and the launcher's old "Job Group". The
> shelf survived whole — ordering, folding, drag and drop, many-to-many membership, user
> ownership — and gained what a shelf never had: **its own reading level and its own
> launch defaults**.

**One file per role, named by its token.** `developer.md` defines `developer`.

**Format.** `- **key:** value` lines; everything else is prose. The filename is the token.
`README.md` is this page and is never a definition.

**THE TASK FAMILY — the set of session_roles presented under this role.** Surface word
**Family**; `session_roles` in every internal name, because a bare `family` is already the
settei registry's write family and Node's own address family, which is exactly the
collision KOTOBA's spelling law exists to prevent (owner, 2026-08-22).

`- **session_roles:** A, B, C` is the whole link, and the role owns it — a task never names
a role. **Family is ASSOCIATION, not exclusive ownership**: a task may appear in several
role families, and moving one between roles edits only these files.
`- **session_roles:** —` is a role with an empty family, which is ordinary: it launches with
a blank task.

**A family is not a team.** A `session_team` is a roster-scoped set of collaborating
SESSIONS, addressable as one; a task family associates TASKS with a role and addresses
nothing. The axes are strict and do not overlap.

**`order:`** is the board position. A directory has no file order, so display order is
stated or it is not stable. Roles without an `order:` follow the ordered ones, by label.

**Every role is launchable blank.** A role needs a visible blank-task affordance so
QuarterBack, PersonalAssistant or any role the owner invents can start without inventing
a task for it. That is what a role's own `opening:`, `posture:` and `ask:` are for.

**Launch defaults cascade.** A role states a field where it differs from the system; a
task on its shelf states one where it differs from the role:

```text
system default  <  role_family  <  session_role  <  explicit choice on this launch
```

`mcp: always` is a **lock** (`personalassistant` carries it) — a task or a launch may not
contradict it. `dir: {install}` and `cap: exempt` (`mikaassist`) are ordinary cascading
values that happen to be stated only here.

**Its reading is a shelf, not a field.** `role/<role_family>/` on the session-boot shelf is
the strong role prompt, listed at the moment of the launch and extendable with as many
inspectable files as the role deserves. The definition does not carry a giant duplicate.
**Role reading is birth-only** — the role cannot change, so it is never re-injected.

**Yours and ours.** A file of the same name in your catalogs store replaces ours
**whole**. A new name adds a role. `- **hidden:** yes` withdraws one of ours. The rule in
full: `docs/shadowing.md`.

---

*The house ships four so a fresh board is useful before you customize it. They are design
input, not data you must keep: shadow one, hide one, or add your own.*
