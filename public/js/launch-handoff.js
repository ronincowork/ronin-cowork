/* Successful launch results become one-shot Workbench destinations here. */
import { openWorkbenchTab } from './workspace.js';

const EMPTY_WORKSPACE = '@empty';
const sessionSeat = (name) => ({ type: 'session.terminal', key: name });
const commonsSeat = () => ({ type: 'team.commons', tab: 'roster' });

function orderedSessions(sessions = []) {
  const seen = new Set();
  return sessions
    .map((session, index) => ({
      name: String(session?.name || '').trim(),
      team_lead: session?.team_lead === true,
      index,
    }))
    .filter((session) => session.name && !seen.has(session.name) && seen.add(session.name))
    .sort((left, right) => Number(right.team_lead) - Number(left.team_lead) || left.index - right.index);
}

/** Build the destination without opening it, so every launch entrance shares the rule. */
export function launchHandoffSpec({ team = '', sessions = [] } = {}) {
  const ordered = orderedSessions(sessions);
  const teamName = String(team || '').trim();
  if (!teamName) {
    if (!ordered.length) return null;
    const name = ordered[0].name;
    return {
      destination: 'agent', param: name, mode: 'replace',
      state: {
        count: 2, selected: 'workspace1',
        seats: { workspace1: sessionSeat(name), workspace2: EMPTY_WORKSPACE },
      },
    };
  }

  if (!ordered.length) return {
    destination: 'team', param: teamName, mode: 'replace',
    state: {
      count: 2, selected: 'workspace1', tabName: '',
      seats: { workspace1: commonsSeat(), workspace2: 'session.new-agent' },
    },
  };

  return {
    destination: 'team', param: teamName, mode: 'replace',
    state: { count: 2, selected: 'workspace1', tabName: '', seats: {
      workspace1: sessionSeat(ordered[0].name),
      workspace2: ordered[1] ? sessionSeat(ordered[1].name) : commonsSeat(),
    } },
  };
}

export function openLaunchHandoff(outcome, reserved = null) {
  const spec = launchHandoffSpec(outcome);
  return spec ? openWorkbenchTab(spec, reserved) : null;
}
