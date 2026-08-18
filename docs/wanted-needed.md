# Wanted and Needed — the two lists, and why only one is stored

> Current state, not a plan. The ⚙ Configuration tab renders both. Companion to
> `docs/settei.md` (the one object these
> lists live in). In code: `src/settei.ts` (`computeNeeded`), `src/settei-registry.ts`
> (`requires`, the verbs), `public/js/settei.js` (the ⚙ ticks and the needed box),
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
| written by | `PUT /api/settei/wanted` (whole-list, through the one door) | nobody, ever |
| cleared by | the owner unticking | reality changing |
| read by | `computeNeeded`, the ⚙ ticks | the ⚙ needed box · the 新 seat at its own start |

## Where needed[] comes from — two feeders, one judge

1. **The registry's `requires`** — a leaf may declare what a choice drags in
   (`src/settei-registry.ts`). Each row has an `applies` check (does this choice
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

## The surfaces

- **⚙ agent installations / services** — the leading checkbox IS the installed bit:
  ticked-and-fixed means on the box (a fact — reality unticks it, not you); an empty
  one is live, and ticking it writes the want. Taught once, on the hint line.
- **⚙ still needed** — the one box: every unmet thing, requires and wants alike,
  each with its how. Empty reads "nothing — your choices are satisfied."
- **"Start your setup session"** — beneath the box (and on ＋ New) whenever an agent
  CLI exists and the box is non-empty. One press seats 新 Atarashi with a one-line
  pointer; **the seat reads `GET /api/settei` itself at start**, so it works the same
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
