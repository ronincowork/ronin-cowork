# Agent team-lead choice

## Settled outcome

Restore an explicit **Make team lead** on/off question anywhere the owner authors a new
Cowork Agent:

- the inline Add Agent editor in New Team; and
- the canonical New Agent form, including when it is opened from an existing Team.

Both controls use the shared `ask()` switch form (`switch: [On, Off]`), default off, and
send the launch API's existing `team_lead` boolean. The choice is per Agent. Do not impose
one-lead validation or clear another row when a switch is turned on; a Team may have
multiple leads.

Keep the question visible when New Agent currently says **No team (rōnin)**. Presentation
must not make Team selection a prerequisite for answering it. The durable authority is
unchanged, however: session lead state is a list of Team names, and `POST /api/launch`
currently records `team_lead` only when the birth has a Team. This change does not invent a
global or teamless lead flag. If product semantics require a no-Team selection to survive
and become effective after some later Team join, that is a separate state-model decision,
not a hidden extension of this form restoration.

## Cut 1 — carry the choice through New Team's Agent rows

Owner: `public/js/team-agents.js`, with the existing launch handoff in
`public/js/team-loader.js` left as the downstream authority.

1. Add `team_lead: false` to `agentRow()` so new and copied editor rows always have a
   boolean answer.
2. Add a compact `ask()` group to the inline editor with a `teamLead` (or consistently
   named equivalent) field labelled **Make team lead** and
   `switch: [t(..., 'On'), t(..., 'Off')]`.
3. Initialize the question from the row, update the row from `onChange`, and include
   `team_lead: row.team_lead === true` in `agentPicks()`.
4. Include the lead fact in the compact saved-row reading so an owner can verify it before
   launching without reopening the editor.
5. Preserve `pick.team_lead` when `new-team-form.js` expands a Team template into editable
   rows. This keeps shipped and saved casts truthful through edit/save/relaunch.

`team-loader.js` already serializes `team_lead` and births ordinary rows before marked
lead rows. Do not add uniqueness rules there or reorder multiple marked rows relative to
one another.

## Cut 2 — carry the choice through New Agent

Owner: `public/js/new-agent.js`; API boundary: `POST /api/launch` in
`src/routes/launch.ts`.

1. Add a false lead value to `freshDraft()` so reset and every entry path agree.
2. Add the **Make team lead** switch to the canonical Cowork Agent question spec. Keep it
   independent of the Team selector, so changing among current/new/no Team does not erase
   the owner's answer.
3. Copy the switch answer in `onQuestionChange`, include it in `syncQuestions()`, and show
   it only for Cowork Agents. Terminals and bare-metal Agents must not submit it; the route
   already treats it as inapplicable to bare-metal births.
4. Add `team_lead: draft.teamLead` to the Cowork Agent launch body and show the answer in
   the folded Payload reading.
5. Decide explicitly whether Agent templates own this launch-time assignment. The narrow
   restoration should not silently add it to the Agent template schema; if existing
   template contracts already expose it by the time this cut lands, hydrate and save it
   symmetrically.

The route already accepts `team_lead`, passes it to the spawn form, records the selected
Team in the session's lead list, and reports the effective boolean in the receipt. No API
or store write is required for the named-Team case.

## Cut 3 — focused checks and contract text

Owner: `tests/new-launch-form-layout.test.js` plus the closest behavior tests for the
client helpers.

1. Replace the assertions that ban `team_lead`, `.lead`, and `switch` from these two forms
   with positive checks for one ERABI switch in each relevant editor/form.
2. Exercise `agentRow()` and `agentPicks()` with zero, one, and multiple marked rows;
   verify every boolean reaches `launchTeamAgents()` and that multiple leads are accepted.
3. Exercise New Team template hydration so a marked cast row remains marked after opening
   and saving the editor.
4. Exercise New Agent payload construction for Cowork Agent + existing Team, Cowork Agent
   + new Team, and Cowork Agent + no Team. Verify the form sends the owner's boolean and
   that terminal/bare-metal payloads omit it.
5. Keep or extend the existing launch-route test proving the effective receipt/store state
   is Team-scoped. Do not claim a durable teamless lead exists.
6. Update `docs/using-ronin/new-team.md` and `docs/architecture/new-team.md` only as needed
   to say each added Agent can be marked as a lead and multiple marked Agents are allowed.

Run the smallest relevant checks:

```sh
node --test tests/new-launch-form-layout.test.js
node --test tests/ask.test.js
node --test tests/preset-launch.test.js
node --import tsx --import ./tests/fixture-teardown.mjs --test tests/launch-parity.test.ts
```

Add or substitute a focused client behavior test if static layout assertions cannot prove
the boolean survives interaction and payload creation. Full `npm run verify` remains the
Team lead's integration gate.

## Gates and ownership boundaries

- UI wording uses **Make team lead**; ERABI remains an internal implementation name.
- `ask.js` and shared switch styling are reused unchanged unless a focused interaction
  test demonstrates a shared defect.
- Live session tags/leads remain the only membership/lead authority. Do not add lead data
  to the Team record.
- No single-lead invariant may be introduced in the browser, template hydration, loader,
  or API.
- The New Agent control stays independent of the Team selection. Its effective durable
  meaning remains Team-scoped under the current state contract.

## Finished when

The two authoring paths visibly offer the same default-off on/off choice, a marked Agent's
boolean reaches the existing launch boundary, New Team templates retain marked rows,
multiple marked rows launch without refusal, the payload truthfully previews the choice,
and focused tests pass without creating a second lead authority.
