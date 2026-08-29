/**
 * A FORK IS BORN ON THE AXES, AND THE MACRO IS WHERE THAT IS WRITTEN DOWN.
 *
 * Forks used to be created with raw `tmux new-session`. That never touches the letter, so
 * a fork carried a blank `role_family` for its entire life — and because the role is stamped
 * at birth and immutable, nothing could repair it afterwards. Measured on two real
 * sessions (`explainer_library`, `wipeboard_groups`), both of which ended up self-setting
 * only a task. The owner ruled it out on 2026-08-22: a fork that launches an agent must
 * RESOLVE its axes deliberately rather than omit them by accident.
 *
 * WHY THIS IS A TEST AND NOT JUST A CATALOG EDIT. A macro is DATA an agent follows —
 * `ronin_bin/tejun` compiles it and the agent performs what it says. There is no code
 * path to unit-test here; the instruction IS the implementation. So what is asserted is
 * that the instruction still says the things the ruling turns on, read through the same
 * reader the compiler uses (`listMacros`), not by grepping a file this check happens to
 * know the name of.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readCatalogSections } from '../src/catalog.js';
import { listMacros } from '../src/macros.js';

/**
 * THE WHOLE SECTION, not `listMacros().instruction`.
 *
 * `instruction` is the leading prose only — it stops before the `- **key:**` lines and the
 * action table by design (src/macros.ts). What an agent actually performs is the whole
 * block under the heading: the params, the table, and the prose around them. So this
 * reads the section through the same splitter the compiler uses, which also means a
 * user's own shadow of `forkit` is what gets checked on a box that has one.
 */
const forkit = async (): Promise<string> => {
  const s = (await readCatalogSections('MACROS.md')).find((x) => x.name === 'forkit');
  assert.ok(s, 'forkit is a macro on this box');
  return s!.lines.join('\n');
};

test('forkit is still a previewed workflow macro the compiler can find', async () => {
  // The section reader above is deliberately looser than the compiler's; this keeps the
  // two honest about the same entry.
  const m = (await listMacros()).find((x) => x.name === 'forkit');
  assert.ok(m, 'forkit surfaces from listMacros');
  assert.equal(m!.preview, true);
});

test('forkit launches through the one door, not by hand-rolling tmux', async () => {
  const text = await forkit();
  assert.match(text, /session-launch/, 'the launch step is the door');
  // The three steps the door replaces. Typing a CLI into a pane and waiting for its
  // prompt is what LAUNCH_READY retired, and it is also what skipped the letter.
  assert.doesNotMatch(text, /\|\s*session-create\s*\|/, 'session-create cannot stamp a role');
  assert.doesNotMatch(text, /\|\s*run-command\s*\|/, 'the brief rides on argv now');
  assert.doesNotMatch(text, /\|\s*wait-ready\s*\|/, 'there is no prompt to wait for');
});

test('forkit resolves both launch axes, and says how each defaults', async () => {
  const text = await forkit();
  assert.match(text, /`role_family`/, 'the role is a parameter');
  assert.match(text, /`session_role`/, 'the task is a parameter');

  // THE ASYMMETRY IS THE RULING. The role is inherited because it cannot be repaired
  // later; the task may default because it can.
  assert.match(text, /role_family` is INHERITED from the origin/i);
  assert.match(text, /immutable/i, 'the reason the role may not be guessed');
  assert.match(text, /session_role` DEFAULTS to `DraftPlan`/i);
  assert.match(text, /mutable/i, 'the reason the task may be');

  // A blank origin role must become a QUESTION, never a blank passed through — that is
  // the exact failure the two measured forks hit.
  assert.match(text, /ASK the owner which role/i);
  assert.match(text, /propose-and-confirm/, 'and it asks through the action that waits for a yes');

  // Both resolved values reach the owner, or a wrong role is invisible until much later.
  assert.match(text, /resolved `role_family` \+ `session_role`/);
});

test('forkit says team, and no longer says group', async () => {
  const text = await forkit();
  assert.match(text, /`team`/, 'the ruled term');
  // `group` retired as a house term on 2026-08-22 (KOTOBA R32). The sweep across
  // @ronin-tags and tejun-group is its own pass; THIS macro was named in the ruling.
  assert.doesNotMatch(text, /`group`/, 'the retired term is gone from this macro');
  assert.doesNotMatch(text, /tejun-group/, 'and so is the pointer at the tool that spells it');
});

test('a fork still proves it understood before it works', async () => {
  // The oldest rule in this macro, and the schema cut must not have cost it: a fork
  // reports its understanding and waits. It is now delivered by the resolved task's own
  // `ack:` rather than typed into the pane, so the instruction has to say BOTH.
  const text = await forkit();
  assert.match(text, /READ AND REPORT UNDERSTANDING FIRST/);
  assert.match(text, /NO code, NO builds, NO commits until the owner says go/);
  assert.match(text, /Do NOT type that prompt into the pane/i);
  assert.match(text, /ack:/, "the resolved task's own rule is what adds it");
});

test('forkit reuses the canonical launch contract and gets the whole Build Brief', async () => {
  const text = await forkit();
  assert.match(text, /Do not rebuild it/i, 'no second bespoke launch implementation');
  assert.match(text, /zero Build Brief/i, 'and the measured reason a bare tmux session is wrong');
  // The four reading levels the compiled brief carries. A fork made the old way got none.
  assert.match(text, /all-session reading \+ the project_root's \+ the\s+role_family's \+ the session_role's/);
  assert.match(text, /understanding gate/i);
});

test("forkit leaves the model to the owner's default unless the owner named one", async () => {
  const text = await forkit();
  assert.match(text, /`model`/, 'the model is a parameter');
  assert.match(text, /omit it\*\* — the owner's session default answers/i, 'and its default is silence');
  assert.match(text, /an\s+explicit model beats the default/i);
  // The role-model bias was removed with the field (owner, 2026-08-29), so the macro must
  // not teach a fork that the task it is handed says anything about the model.
  assert.match(text, /`session_role` states no model and biases\s+none/i);
  assert.match(text, /real cell from the launch table/i, 'never a composed command');
});

test('a fork owns its task afterwards, and never its role', async () => {
  const text = await forkit();
  assert.match(text, /re-marks itself with `write_tegami` and Ronin hands it that task's reading/);
  assert.match(text, /`role_family` does not move with it, and nothing can change it/);
});

test('forkit is still owner-invoked only', async () => {
  const text = await forkit();
  assert.match(text, /Owner-invoked only — never fork on your own initiative/);
});
