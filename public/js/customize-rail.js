/* part of the ronin-cowork client — see js/README.md */
/**
 * CUSTOMIZE — the resource model, and the ONE place the v1 capability matrix is encoded.
 *
 * The matrix is the authority (wip/buildouts/CUSTOMIZE_RONIN.md): each resource is
 * exactly one of DIRECT EDITOR, GUIDED AGENT HANDOFF or READ-ONLY, and a resource earns a
 * direct editor only where a typed, validating write API already exists. Two do. The rest
 * are handoff or read-only, and this file is where that ruling lives so a view cannot
 * quietly grant itself a capability by drawing a form.
 *
 * `read` IS THE WHOLE HONESTY TEST OF THIS PREVIEW. A resource with no route does not get
 * an empty list — an empty list is a claim that the shelf is empty, which is false. It
 * gets the `unavailable` state and says which route is missing. Four resources are in that
 * position today (SOPs, actions, tools, session readings) because their read routes are a
 * prerequisite the owner has not unblocked; drawing them as empty would be the surface
 * lying about the owner's own files.
 */
export const SECTIONS = [
  { id: 'behavior', label: 'Behavior' },
  { id: 'people', label: 'People & work' },
  { id: 'presentation', label: 'Presentation' },
];

/**
 * `capability` is the matrix verdict. `read` is the route that tells the truth today, or
 * null when none exists. `why` is what the surface says INSTEAD of an empty list — it
 * names the missing prerequisite, because "unavailable" without a reason is indistinguishable
 * from "broken".
 */
export const RESOURCES = [
  { id: 'macros', section: 'behavior', mark: '⚡', label: 'Macros',
    capability: 'handoff', read: '/api/macros', file: 'MACROS.md', what: 'a workflow an agent runs when you type +name:',
    blurb: 'Saved instructions you would otherwise have typed to your agent.' },
  { id: 'sops', section: 'behavior', mark: '▤', label: 'SOPs',
    capability: 'read-only', read: null, why: 'No read route exists for the SOP shelf yet (prerequisite P3).',
    blurb: 'How this house goes about a domain — fetched by a situation, never pushed.' },
  { id: 'actions', section: 'behavior', mark: '◇', label: 'Actions',
    capability: 'handoff', read: null, why: 'No read route exists for ACTIONS.md yet (prerequisite P3).',
    file: 'ACTIONS.md', what: 'a primitive step macros are composed from',
    blurb: 'The cataloged procedures macros are made of.' },
  { id: 'tools', section: 'behavior', mark: '⚙', label: 'Tools',
    capability: 'read-only', read: null,
    why: 'TOOLS.md is a table, and the server has no table reader — the rule in docs/shadowing.md is implemented in ronin_bin/tejun and not in src/catalog.ts (prerequisite P1).',
    blurb: 'The executables that implement actions. A markdown row cannot author one.' },

  { id: 'role-families', section: 'people', mark: '人', label: 'Role families',
    capability: 'read-only', read: '/api/role-families',
    blurb: 'The shelves of the ＋ New board. Presentation only — a family never rides a launch.' },
  { id: 'session-roles', section: 'people', mark: '◫', label: 'Session roles',
    capability: 'handoff', read: '/api/session-roles', dir: 'session_roles',
    blurb: 'What a session is doing now. Its fields cascade into every launch.' },
  { id: 'team-roles', section: 'people', mark: '⧉', label: 'Team roles',
    capability: 'handoff', read: '/api/team-roles', dir: 'team_roles',
    blurb: 'What a TEAM is. The house ships none — every one is yours.' },
  { id: 'saved-launches', section: 'people', mark: '↗', label: 'Saved launches',
    capability: 'read-only', read: '/api/saved-launches',
    blurb: 'The launcher form, filled in ahead of time and named.' },

  { id: 'skins', section: 'presentation', mark: '◐', label: 'Skins',
    capability: 'read-only', read: '/api/skins', file: 'SKINS.md', what: 'a look — a set of design tokens, and nothing else',
    blurb: 'A set of design tokens and nothing else. Choosing one is a setting, and stays on the gear.' },
  { id: 'readings', section: 'presentation', mark: '▧', label: 'Session readings',
    capability: 'read-only', read: null, why: 'No read route exists for the session-boot shelf yet (prerequisite P3).',
    blurb: 'What a new session reads before anything else. A reading you add reaches the next session born, never a running one.' },
];

export const byId = (id) => RESOURCES.find((r) => r.id === id) || null;

/** Sections with their resources, for the rail. Counts are filled in by the caller as
 *  reads resolve — never guessed, and absent until the read answers. */
export function railSections(counts = {}, marks = {}) {
  return SECTIONS.map((section) => {
    const items = RESOURCES.filter((r) => r.section === section.id).map((r) => ({
      id: r.id,
      label: `${r.mark} ${r.label}`,
      count: counts[r.id] ?? null,
      provenance: marks[r.id] ?? null,
    }));
    // A section count is the sum of the reads that ANSWERED. Sections whose resources
    // cannot be read carry none rather than a zero, for the same reason a resource does.
    const known = items.map((i) => i.count).filter((c) => typeof c === 'number');
    return { label: section.label, count: known.length ? known.reduce((a, b) => a + b, 0) : null, items };
  });
}
