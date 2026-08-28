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

Team cards inside the League view surface are drag-only. Clicking one does not replace
the selected workspace; dragging one onto another workspace opens that Team there. Team
cards in the League selector remain clickable as well as draggable.

There is no `#/league` destination, League view module, League board module, League
stylesheet, roster visibility state, or parallel workspace implementation.
