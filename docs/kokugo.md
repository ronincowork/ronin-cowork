# KOKUGO — every string a person reads, through one door

**The rule, in one sentence: every string a person reads in the coworkspace is
`t('room.key', 'the literal')`, and the key lands in `ronin_catalogs/lexicons/professional_en.md`
in the same commit — `scripts/check-lexicon.mjs` fails you otherwise.**

This page is the instruction for anyone building a new tab, view, page or control in
`public/js/` or `public/index.html`. It is written for an agent with no other context and
is short enough to read every time. The machinery it describes: `public/js/lexicon.js`
(the helper), `ronin_catalogs/lexicons/` (the words, one file per lexicon), `docs/lexicons.md`
(how the chain resolves), `docs/desk-profiles.md` (how a person picks one), and
`docs/kokugo-table.md` (every key and every lexicon's word beside it — generated, never
edited). The sweep that put every existing view through this door landed 2026-08-27.

## 1 · The helper

```js
import { t } from './lexicon.js';

label.textContent = t('roster.session_max', 'session max');
note.textContent  = t('roster.running_of', '{n} / {max} running', { n: live, max: cap });
```

`t(key, literal, vars)`:

- **`key`** — `room.thing` in lower snake case (§ 2).
- **`literal`** — the English exactly as it would have been written inline, byte for byte.
  It is the floor's floor: with no lexicon up, the surface paints exactly this. Never an
  empty string (an empty literal makes `t()` return the key).
- **`vars`** — fills `{name}` placeholders (§ 3). Optional.

The active lexicon is one flat object the server resolved (`base:` chain and all); `t()`
answers its word for the key, else the literal. It never returns `undefined` or `''`.

## 2 · Keys

- **`<room>.<thing>`**, lower snake: `desk.skin`, `launcher.go`, `roster.no_sessions`,
  `new_team.name_taken`. The room is the surface the word lives on — usually the module's
  name or the tab's — and it is the heading the table groups by.
- **Reuse a key when two surfaces say the same thing in the same sense**: every Save button
  that means "save this" may share `panels.save`; the Team page family shares `team.project_root`
  for the row label *Project root*. **Never reuse a key for a different sense**, even if the
  English happens to match today — another language may not.
- **Reserved prefixes** name catalog tokens, not surface strings: `kind.*`, `role.*`,
  `team_role.*`, `behaviour.*`. When you list definitions, ask
  `t('role.' + def.token, def.label)` — the definition's own `label:` is their floor and they
  are exempt from the floor check.
- **Singular and plural are two keys** (`roots.count_one` / `roots.count_many`), chosen in
  code. Do not build a plural by appending `s`.

## 3 · Placeholders — never concatenation

A string with a value in it stays **one key** with a `{name}` in it, filled by `vars`:

```js
t('roster.drop_here', 'Drop a session here to add it to {team}', { team })
```

Never `t('a', 'Drop a session here to add it to ') + team` and never two translated halves
joined — word order differs between languages, and a half-sentence key is untranslatable.
A placeholder `vars` does not name is left as written, so a typo in a lexicon shows on
screen instead of vanishing.

Two shapes that come up:

- **A leading or trailing space** is not a word. Catalog values are trimmed, so `' (dirty)'`
  becomes `' ' + t('desk.dirty', '(dirty)')`.
- **Markup inside a sentence** (`Agents resolve these with <code>tejun-team</code>.`): keep
  one key with a placeholder and split on it —
  `const [before, after] = t('panels.team_hint', 'Agents resolve these with {cmd}.').split('{cmd}')`
  — then append `before`, the `<code>` element, `after`. A lexicon's word is text and must
  never reach `innerHTML`.

## 4 · What is never translated

- **Anything an agent reads** — the letter, the brief, the boot shelf, a prompt handed to a
  session, `write_tegami` output, tool output. A session on a Home desk is still `DraftPlan`
  with `reach: plan`.
- **The house's internal names** — KOTOBA's closed list (TEJUN, RIREKI, KOSHI, …); *Ronin*
  the product; a vendor's name (gbrain, Claude).
- **Values** — a session name, a path, a branch, a model, a count, a timestamp, a token
  (`manual`, `cherry_pick`, a status word the server sends as data). A label is a word; a
  value is not.
- **Text a person typed**, and **error text that quotes the server** (`r.message`). The
  client's own sentence around it is translated; the quoted part rides as a placeholder.
- **A `title` that is a command or a path.** A tooltip that is prose with a shortcut in it
  (`⌃⇧N — start a new session…`) IS translated, shortcut and all.

## 5 · Tables of words: a function, not a constant

`check-modules` refuses an imported binding used at module top level — and a table of
labels built at import time is evaluated before the lexicon has loaded, so it would freeze
the stock words. Any module-level table that holds words becomes a function read at paint:

```js
// before                                   // after
export const PANES = [                       export function PANES() {
  { id: 'docs', label: '▧ Docs' },             return [{ id: 'docs', label: t('pane.docs', '▧ Docs') }];
];                                           }
```

Same for a top-level `window.addEventListener('error', (e) => … t() …)`: name the handler
(`function onWindowError(e) {…}`) and pass it.

## 6 · index.html — one pass, no second mechanism

The page is served as a file and cannot call `t()`. An element names its key in an
attribute and `public/js/pagewords.js` fills it once at boot, after the desk profile has
put its lexicon up and before the grid is built:

```html
<button id="newbtn" data-t-title="bar.new_title" title="⌃⇧N — start a new session …">
  か<span class="txt" data-t="bar.new"> New</span>
</button>
```

`data-t` fills the text (leading/trailing space kept), `data-t-title` the tooltip,
`data-t-aria` the `aria-label`. The literal stays in the file as the floor's floor. The gate
reads these attributes as keys the client reads.

## 7 · Adding a word, adding a language

- **A new string in a view**: write the `t()` call, add `- **room.key:** the literal` to
  `ronin_catalogs/lexicons/professional_en.md` under the room's heading, regenerate the
  table (`node scripts/kokugo-table.mjs`), commit all three together.
- **A profile's word for it** (Home says *household* where the floor says *team*): one
  line in that profile's lexicon, e.g. `- **roster.no_team:** no household` in
  `ronin_catalogs/lexicons/home_en.md`. Only the words that change; everything else falls
  through. Regenerate the table.
- **A new lexicon**: one file `ronin_catalogs/lexicons/<name>_<lang>.md` with `label:`,
  `blurb:` and `base:` (the format is `ronin_catalogs/lexicons/README.md`). Wording and
  translation are one axis: a French Home is one file, `home_fr`, based on `professional_fr`,
  itself based on `professional_en` — never a second setting. The language is in the name.
- **Yours**: a same-named file in your catalogs store (`bin/ronin-store catalogs` →
  `lexicons/`) replaces ours whole; a new name is a new lexicon (`docs/shadowing.md`).
- **A desk profile names its lexicon** (`- **lexicon:** home_en` in
  `ronin_catalogs/desk_profiles/`); picking one in ⚙ · appearance puts its words up. Views
  take the words on their next paint; only the ⚙ desk repaints itself on a pick. Do not add
  a global re-render.

## 8 · Running the gate

```
node scripts/check-lexicon.mjs
```

- `FAIL the client reads \`x\` and professional_en.md does not carry it` — add the line.
- `FAIL <lexicon>.md spells \`x\`, which professional_en.md does not carry` — a typo in a
  lexicon: a bare key must exist in the floor to fall through to.
- `FAIL docs/kokugo-table.md is stale` — `node scripts/kokugo-table.mjs`, commit the page.
- `note N floor key(s) no view reads yet` — allowed (the campaign board's keys wait for
  their surface); read it so the list cannot rot.
- `note N module(s) import t and also name a local t` — legal; each is a scope where a
  bare `t` is a local, not the word. If you renamed a local off `t`, read that scope twice.
- `check-lexicon: the floor holds (N keys, M read by the client, L lexicons)` — green.

Also green after every change: `node scripts/check-modules.mjs` (cycles, top-level use of
an import), `check-dead`, `check-docs`, and `node --check` on the file. `check-lexicon` is
in `npm run verify` and in the BYOIN gate.

## 9 · A worked before / after

`public/js/roster.js`, the session-max line, as it was:

```js
maxNow.textContent = m > 0 ? `${maxLive} / ${m} running` : `${maxLive} running · no limit`;
```

As it is:

```js
maxNow.textContent = m > 0
  ? t('roster.running_of', '{n} / {max} running', { n: maxLive, max: m })
  : t('roster.running_no_limit', '{n} running · no limit', { n: maxLive });
```

And in `ronin_catalogs/lexicons/professional_en.md`, under `## roster`:

```
- **roster.running_of:** {n} / {max} running
- **roster.running_no_limit:** {n} running · no limit
```

Two keys, because they are two sentences; placeholders, because the numbers are values;
the literals byte-identical, because a box with no lexicon must paint exactly as before.
`home_en` says nothing about either, and falls through.
