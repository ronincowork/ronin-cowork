# League cowork view

League exists only at `#/league-workspace`, rendered by
`createCoworkView({ kind: 'league' })` in `public/js/cowork-view.js`.

It uses the same workspaces, two/four shape, selector column, placement, drag/drop,
recall, sizing and lifecycle as `kind: 'team'`. Its selector exposes League commons,
League view, Teams and New Team instead of Team commons, sessions and New Session.

There is no `#/league` destination, League view module, League board module, League
stylesheet, roster visibility state, or parallel workspace implementation.
