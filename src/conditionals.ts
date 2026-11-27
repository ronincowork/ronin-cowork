/**
 * THE CONDITIONALS (docs/architecture/brief.md, Conditionals): whether a catalog file is in play, read off the
 * brief record. The one function every `when:` goes through. An unknown word never holds.
 */
import type { BriefRecord } from './brief-record.js';

/** Every conditional word (docs/architecture/brief.md, Conditionals); `<x>` marks a value the word takes. */
export const CONDITIONALS = [
  'cowork', 'bare', 'mika', 'irasshai', 'owner', 'member', 'new-owner', 'experience:<x>', 'ai:<x>', 'use:<x>', 'account:<x>', 'hosted',
  'service:<part>', 'integration:<name>', 'mcp', 'api', 'pm', 'team', 'lead', 'role:coworker', 'role:lead', 'role:epic_lead',
  'role:coordinator', 'role:appliance', 'desk', 'checkout', 'workspace:<name>',
] as const;

/** One conditional word, optionally `!`-negated. */
export function conditionHolds(word: string, r: BriefRecord): boolean {
  const raw = word.trim();
  if (raw.startsWith('!')) return !conditionHolds(raw.slice(1), r);
  const [kind, value = ''] = raw.split(/:(.*)/s).map((part) => (part ?? '').trim());
  switch (kind) {
    case 'cowork': case 'bare': case 'mika': case 'irasshai': return r.session.type === kind;
    case 'owner': case 'member': return r.user.role === kind;
    case 'new-owner': return r.user.new_owner;
    case 'experience': return r.user.technical_level === value;
    case 'ai': return r.user.ai_experience === value;
    case 'use': return r.user.planned_use.includes(value);
    case 'account': return r.user.account === value;
    case 'hosted': return r.setting.hosted;
    case 'service': return r.setting.services.includes(value);
    case 'integration': return r.setting.integrations.includes(value);
    case 'mcp': return r.setting.mcp.length > 0;
    case 'api': return (r.setting.api ?? []).length > 0;
    case 'pm': return r.setting.pm;
    case 'team': return !!r.agent.team;
    case 'lead': return !!r.agent.team && r.agent.lead;
    case 'role': return r.agent.role === value;
    case 'desk': return r.work.desk;
    case 'checkout': return r.work.checkout;
    case 'workspace': return r.setting.workspace === value;
    default: return false;
  }
}

/** Every conditional of a `when:` list holds (blank = every Agent). */
export const whenHolds = (when: readonly string[], r: BriefRecord): boolean =>
  when.every((word) => conditionHolds(word, r));
