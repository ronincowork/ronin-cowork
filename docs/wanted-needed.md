# Wanted and Needed — the two lists, and why only one is stored

> Current state, not a plan. The ⚙ Configuration tab renders both. Companion to
> `docs/settei.md` (the one object these
> lists live in). In code: `src/machine-settings.ts` (`computeNeeded`), `src/machine-settings-schema.ts`
> (`requires`, the verbs), `public/js/machine-settings.js` (the ⚙ ticks and the needed box),
> `ronin_session_boot/job/Atarashi/00_ATARASHI.md` (the seat that works the list).

## The one idea

**Wanted is intent. Needed is arithmetic.** You say what you want once and it
persists; what is still missing is *computed* from that intent against what the box
observably has, fresh on every read. Nothing ever writes the needed list, so nothing
ever has to clear it: install the thing and its task is gone the next time anyone
looks, with no write anywhere. Met items do not exist.

| | wanted | needed[] |
|---|---|---|
| what it is | the owner's typed intents | what those intents still lack |
| provenance | **typed** — persists in `ronin.json` `wanted` | **derived** — exists only in the answer |
| written by | `PATCH /api/machine-settings` (whole-list, through the one door) | nobody, ever |
| cleared by | the owner unticking | reality changing |
| read by | `computeNeeded`, the ⚙ ticks | the ⚙ needed box · the 新 seat at its own start |

## Where needed[] comes from — two feeders, one judge

1. **The registry's `requires`** — a leaf may declare what a choice drags in
   (`src/machine-settings-schema.ts`). Each row has an `applies` check (does this choice
   speak at all?) and a `met` check (is it satisfied?). Seeds today: services → the
   verified email; gbrain → enabled-but-not-installed surfaces as a task.
2. **The want list** — every entry is itself a check the owner typed, judged the
   same way. Unmet joins `needed[]` with a `how`; met produces nothing.

Both are judged by the same five verbs, and the vocabulary **stays five**:

| verb | asks | against |
|---|---|---|
| `key(name)` | is this env var set? | the env scan — presence only, never a value |
| `agent(id)` | is this CLI installed? | the login-shell probe |
| `tool(name)` | is this host tool on PATH? | the PATH scan |
| `service(name)` | is this socket registered? (`*` = any — the bundle) | the install's roster |
| `set(path)` | did the owner answer this? | the typed half — blank and `false` are not answers |

The next "just one more condition kind" is a new scan family, not a new verb.

## The choke — every requirement says whose hand closes it

Each entry on `needed[]` carries `met_by`, so the list arrives already partitioned and
a surface renders the three kinds by filtering rather than by deciding again what it is
looking at. Declared per `requires` row; for a want, by its verb, because the verb is
what says whose hand it takes.

| `met_by` | means | today |
|---|---|---|
| `mechanical` | a command can do it **and Ronin knows the command** | an agent CLI whose `AGENTS[].operations.install` is filled (`src/agents.ts`, the one source the install operation reads). An agent PARKED there — empty install operation, and a `parked` sentence saying why — is `owner`, so nothing ever claims to be installing what the operation would refuse |
| `owner` | only the person can | the services email link, a key pasted in `.env`, an entitled download |
| `agent` | judgment required, so the setup seat keeps it | a host tool — "install `gh`" means knowing whether this box is apt, brew or dnf |

It classifies the requirement, never its progress. Whether something is in flight is
the install operation's own answer; nothing here is written, and met items still do not
exist. Adding a mechanical item later is one row, not a code path.

## The surfaces

- **⚙ agent installations / services** — the leading checkbox IS the installed bit:
  ticked-and-fixed means on the box (a fact — reality unticks it, not you); an empty
  one is live, and ticking it writes the want. Taught once, on the hint line.
- **⚙ still needed** — the one box: every unmet thing, requires and wants alike,
  each with its how. Empty reads "nothing — your choices are satisfied."
- **The landing** — the mechanical items are already running in their own tiles by the
  time it opens; the strip carries the `owner` and `agent` remainder.
- **"Start your setup session"** — beneath the box (and on ＋ New) whenever an agent
  CLI exists and the box is non-empty. One press seats 新 Atarashi with a one-line
  pointer; **the seat reads `GET /api/machine-settings` itself at start**, so it works the same
  fresh list you are looking at — nothing composed, parked, or stale.

## The rules

- **Only the want persists.** A stored needed list is a to-do list that rots; a
  computed one cannot be stale and never needs un-writing.
- **A want is not a nag about the past** — it speaks only while unmet, and unticking
  it is always the owner's own act.
- **No credential ever rides either list.** A key appears as its variable name and a
  boolean; the `how` says *set it in `.env`*, never *paste it here*.
- **Adding a check is one row** — a `requires` entry on the leaf that wants it, or
  one tick in ⚙. Anything that costs more is a defect in the registry, not a chore.
