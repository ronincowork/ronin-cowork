# session_tasks — what a session is DOING, one file per task

> **DATA, like `PROJECT_ROOTS.md`.** Nothing here executes. A **`session_task`** is what a
> session is doing *right now* — the button the owner pressed. It is **optional and
> mutable**: the session changes it with `write_tegami` as the work moves, the owner
> changes it from the tile, and a committed change injects that task's reading into the
> running session. A blank task is valid and means no task reading and no mark.
>
> The other axis a launch picks is the **`family_role`** — who the session is, fixed for its
> life. See `../family_roles/README.md`. Neither owns the other: a role's definition lists
> which tasks sit on its shelf, and a task never names a role.

**One file per task, named by its token.** `CutCode.md` defines `CutCode`. The merged
stock ⊕ user directory IS the manifest — there is no second generated file to drift from.

**Format.** `- **key:** value` lines. Everything else in the file is prose for whoever
opens it next, including the `#` heading — the filename is the token, not the heading.
`README.md` is this page and is never a definition.

**Fields:** `icon` · `label` · `blurb` (what the button does) · `ask` (the form's prompt) ·
`remit` (one line: what this session is, for humans and Koshi) · `posture` (how it
behaves — inlined into the boot brief) · `model` (bias: which model this way of working
usually deserves) · `match` (intent words) · `dial` · `permissions` · `lifecycle` (the
michi it starts in) · `ack` · `opening` (first-message template; `{prompt}` is what the
owner typed) · `agent` · `cap` · `dir` · `mcp` · `hidden`.

**Everything but the presentation fields CASCADES.** A task states a launch field only
where it differs from its role, and a role states one only where it differs from the
system:

```text
system default  <  family_role  <  session_task  <  explicit choice on this launch
```

Absence means inherit. An explicit `off` is a value, not an absence. `mcp: always` is a
**lock** — a lower layer may not contradict it. `agent: none` makes `model`,
`permissions`, `posture`, `opening` and `ack` **inapplicable**, and a definition that
states one alongside it is refused rather than half-honored.

**Two launch modes.** In **manual** mode none of this directory's wording is used at all:
what the owner typed IS the prompt, byte for byte, and only the mechanical constants
apply. The `opening:`, the `posture:` and the ack rule belong to **assisted** mode.

**Yours and ours.** A file of the same name in your catalogs store replaces ours
**whole** — never field by field, or neither file would tell the truth. A new name adds a
task. `- **hidden:** yes` withdraws one of ours without deleting shipped files. The rule
in full: `docs/shadowing.md`.

---

*A task earns its place by fixing constants a launch must not guess — a dial, a posture,
a michi. If two tasks differ only in what the prompt says, they are one task.*

*A session **migrates**: `RiffOnIt` → `DraftPlan` → `CutCode` is one session changing what
it is doing, not three sessions. Its `family_role` does not move with it.*

*Forking is not a task. Where a session came from is its **origin**, not its purpose.*

*`OddJob`, `Atarashi` and `OpenShell` sit on no role shelf. They launch with a blank
`family_role`, which is a first-class state and not a gap.*
