
export const MACHINE_SETTINGS_SCHEMA = {
  sections: [
    {
      id: 'campaign',
      title: 'Campaign',
      lede: 'This Ronin instance is one campaign. Name the body of work its projects, teams and agents belong to.',
    },
    {
      id: 'machine',
      title: 'This machine',
      lede: 'Ronin is now installed on this machine — laptop, home server or a VM somewhere, it makes no difference to what follows. This page is already talking to it.',
      facts: true,
    },
    {
      id: 'you',
      title: 'You',
      lede: 'One name, used by everything on the box that has to address you — the assistant, the roster, an agent writing you a note.',
    },
    {
      id: 'agents',
      title: 'Agents',
      lede: 'Ronin is the room your agents work in — a co-working space for the CLIs you already use, each in its own terminal, all on one screen. So the only question here is what is on the machine: something present is already in the room, and something absent can be fetched — tick it and Ronin installs it for you, in its own tile you can watch. Ronin looks for the command and nothing else — signing in happens inside the agent itself, the first time you use it.',
      custom: 'agents',
    },
    {
      id: 'messages',
      title: 'Messages',
      lede: 'What Ronin does with an Agent message it could not deliver.',
    },
    {
      id: 'defaults',
      title: 'Defaults for new sessions',
      lede: 'A default is what a new session starts as, never what it is stuck with — every launch can pick something else.',
    },
  ],

  fields: [
    {
      id: 'campaignName', sec: 'campaign', kind: 'text', ask: false,
      label: 'Campaign name', short: 'campaign name', placeholder: 'Ronin Home',
      from: 'set.campaign.name', lands: { family: 'campaign', key: 'name' }, omit: 'blank',
    },
    {
      id: 'campaignDescription', sec: 'campaign', kind: 'text', ask: false,
      label: 'Description', short: 'campaign description', placeholder: 'What this campaign is for',
      from: 'set.campaign.description', lands: { family: 'campaign', key: 'description' }, omit: 'blank',
    },
    {
      id: 'machineName',
      sec: 'machine',
      kind: 'text',
      label: 'What do you want to call this machine?',
      short: 'this machine',
      hint: 'Yours to choose — it is what you will see in the roster. The hostname stays what it is.',
      placeholder: 'the workshop',
      from: 'set.machine.name',
      fallback: 'status.machine_name',
      lands: { family: 'machine', key: 'name' },
      omit: 'blank',
    },
    {
      id: 'machineWhere',
      sec: 'machine',
      kind: 'text',
      ask: false,
      label: 'Where is it?',
      short: 'where it is',
      aside: 'in your own words — nothing detects this',
      placeholder: 'Hetzner fsn1 · under my desk',
      from: 'set.machine.where',
      lands: { family: 'machine', key: 'where' },
      omit: 'blank',
    },
    {
      id: 'ownerName',
      sec: 'you',
      kind: 'text',
      label: 'What should we call you?',
      short: 'your name',
      placeholder: 'Your name',
      from: 'set.owner.name',
      fallback: 'status.owner_name',
      lands: { family: 'owner', key: 'name' },
      omit: 'blank',
    },
    {
      id: 'model',
      sec: 'defaults',
      kind: 'select',
      label: 'Model',
      short: 'new sessions use',
      hint: 'Any session can be launched with another.',
      options: 'models',
      from: 'set.agents.sessions.default',
      seed: 'models:first',
      shape: 'provider-model',
      lands: { family: 'agents', key: 'sessions.default' },
      omit: 'blank',
    },
    {
      id: 'deskProfile',
      sec: 'defaults',
      kind: 'select',
      ask: true,
      label: 'Desk profile',
      short: 'desk profile',
      hint: 'The look, the words, and how much of the terminal a new tile shows. Unset is stock.',
      options: 'desk_profiles',
      from: 'set.desk.profile',
      lands: { family: 'desk', key: 'profile' },
      omit: 'blank',
    },
    {
      id: 'mika',
      sec: 'defaults',
      kind: 'select',
      label: 'Which model answers Mika?',
      short: 'answers Mika',
      aside: "Mika is Ronin's own helpful assistant",
      hint: 'Mika is Ronin’s own assistant — she explains the house and runs small errands. She does not need your best model, and using one is how a helper gets expensive.',
      options: 'models',
      from: 'set.agents.jobs.mikaassist',
      seed: 'models:light',
      shape: 'provider-model',
      lands: { family: 'agents', key: 'jobs.mikaassist' },
      omit: 'blank',
    },
    {
      id: 'autoForce',
      sec: 'messages',
      kind: 'number',
      min: 0,
      label: 'Force a stuck message after',
      short: 'auto-force after',
      hint: 'Seconds. A message still waiting or failed after this long is forced once, exactly as if you pressed Force on its card — past the target’s Control setting, a dialog, or someone’s draft. Polite until then. 120 unless you say otherwise; 0 = never. The Messages tab’s switch flips between the two.',
      from: 'set.messages.auto_force_after_s',
      shape: 'number',
      lands: { family: 'messages', key: 'auto_force_after_s' },
    },
    {
      id: 'cap',
      sec: 'defaults',
      kind: 'number',
      min: 0,
      label: 'How many agents at once',
      short: 'session max',
      hint: 'Budget about 700 MB per agent. Ronin refuses a new session past your number rather than letting the machine run out of memory. 0 = no limit.',
      note: 'status.sessions.state',
      aside: 'also on ⌂ Roster, same setting',
      from: 'set.sessions.max',
      seed: 'sessions:estimate',
      shape: 'number',
      lands: { family: 'session-max', key: 'max' },
    },
  ],

  facts: [
    { label: 'this box', path: 'machine.host' },
    { label: 'cores', path: 'machine.cores' },
    { label: 'memory', path: 'machine.ram_gb', suffix: ' GB' },
  ],

  scans: {
    keys: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
    tools: ['gh', 'tailscale', 'chromium'],
  },

  requires: [] as Array<{
    leaf: string;
    applies: { kind: string; path?: string; name?: string };
    met: { kind: string; path?: string; name?: string };
    needs: string;
    how: string;
    met_by: 'mechanical' | 'owner' | 'agent';
  }>,

  seat: {
    behaviours: ['ways:setup'],
    name: 'setup',
    prompt: 'Finish what setup still needs. Your task shelf says how: read GET /api/machine-settings at start — needed[] is your reading list, and set is what the owner already answered; never re-ask it.',
  },
};

export function providerModelFields(providers: string[]) {
  return providers.map((provider) => ({
    id: `model_${provider}`,
    sec: 'defaults',
    kind: 'select',
    ask: false,
    label: `Preferred ${provider} model`,
    short: `${provider} prefers`,
    hint: 'Used when a launch names this provider but not a model.',
    options: `models_for:${provider}`,
    from: `set.agents.sessions.by_provider.${provider}`,
    shape: 'text',
    lands: { family: 'agents', key: `sessions.by_provider.${provider}` },
    omit: 'blank',
  }));
}

export type ProviderModelField = ReturnType<typeof providerModelFields>[number];
