import test from 'node:test';
import assert from 'node:assert/strict';
import { agentDefaults, mandate } from '../src/agent-defaults.js';

test('agent_defaults validates every field in the complete record shape', () => {
  const cases = [
    ['blank gets the ruled stock values', undefined, {
      provider: '', model: '', reach: 'plan', recruit: 'propose agents', output: 'open',
      routines: {}, behaviours: [], dial: 'write', permissions: 'default',
    }],
    ['every valid value survives', {
      provider: ' anthropic ', model: ' opus ', reach: 'execute', recruit: 'staff agents',
      output: 'code', routines: { base: true, control: false },
      behaviours: [' ways:CutCode ', 'ronin_sops:github'], dial: 'read', permissions: 'bypass',
    }, {
      provider: 'anthropic', model: 'opus', reach: 'execute', recruit: 'staff agents',
      output: 'code', routines: { base: true, control: false },
      behaviours: ['ways:CutCode', 'ronin_sops:github'], dial: 'read', permissions: 'bypass',
    }],
    ['bad hand edits fall back field by field', {
      reach: 'run', recruit: 'propose', output: 'report', routines: { base: 'yes', control: true },
      behaviours: [null, ' ways:CheckWork '], dial: 'admin', permissions: 7,
    }, {
      provider: '', model: '', reach: 'plan', recruit: 'propose agents', output: 'open',
      routines: { control: true }, behaviours: ['ways:CheckWork'], dial: 'write', permissions: 'default',
    }],
  ] as const;

  for (const [name, input, expected] of cases) assert.deepEqual(agentDefaults(input), expected, name);
});

test('mandate blank and explicit table uses the amended R36 words', () => {
  const cases = [
    [undefined, { reach: 'plan', recruit: 'propose agents', output: 'open' }],
    [{ reach: 'open', recruit: 'staff agents', output: 'the team' }, { reach: 'open', recruit: 'staff agents', output: 'the team' }],
    [{ reach: 'run', recruit: 'propose', output: 'report' }, { reach: 'plan', recruit: 'propose agents', output: 'open' }],
  ] as const;
  for (const [input, expected] of cases) assert.deepEqual(mandate(input), expected);
});
