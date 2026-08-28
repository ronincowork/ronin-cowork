# League cowork view

League exists only at `#/league-workspace`, rendered by
`createCoworkView({ kind: 'league' })` in `public/js/cowork-view.js`.

It uses the same workspaces, two/four shape, selector column, placement, drag/drop,
recall, sizing and lifecycle as `kind: 'team'`. Its selector exposes League commons,
League view, Team roster, Teams, New Team and New Session. Team roster is a two-column
workspace surface: sessions on the left can be dragged onto Teams on the right. A drop
adds the Team tag through the canonical session tags API without removing other Team
memberships.

There is no `#/league` destination, League view module, League board module, League
stylesheet, roster visibility state, or parallel workspace implementation.
