# League cowork view

League exists only at `#/league-workspace`, rendered by
`createCoworkView({ kind: 'league' })` in `public/js/cowork-view.js`.

It uses the same workspaces, two/four shape, selector column, placement, drag/drop,
recall, sizing and lifecycle as `kind: 'team'`. Its selector exposes League commons,
League view, Team roster, Teams, New Team and New Session. Team roster restores the
Commons roster's Team-grouped list in a two-column workspace surface. Its rows contain
only session names; a session can be dragged onto another Team heading to add that Team
tag through the canonical tags API without removing other Team memberships.

The League selector groups its cards into collapsible Views, Teams and New sections.
Ronin Desk is a View card and opens the shared Cowork commons directly on its Desk tab,
which contains Ronin usage statistics; it is not a second desk surface.

League commons is a shared tabbed surface: Project roots, Team roster and Templates.
Team roster is the same grouped membership view formerly exposed as its own selector
card. Templates are durable user-scope copies of the canonical New Team draft. Saving a
template clears Team identity and transaction state; using one fills New Team but never
launches it automatically.

Team cards inside the League view surface are drag-only. Clicking one does not replace
the selected workspace. Dropping one within League view reorders the Team groups; dragging
one onto another workspace opens that Team there. Team cards in the League selector remain
clickable as well as draggable.

League view is an operational Agent roster, not a tile board. Each Team is one full-width
group with live Agent rows showing role, SHINGO, status, selected agent, model and context
remaining. League-facing copy calls these workers Agents; internal API and persistence
names remain `session` for compatibility.

There is no `#/league` destination, League view module, League board module, League
stylesheet, roster visibility state, or parallel workspace implementation.
