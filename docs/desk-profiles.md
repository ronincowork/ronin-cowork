# Desk profiles — the owner's standing defaults for the surfaces they work at

A **desk_profile** (KOTOBA R38, 2026-08-27) is the set of defaults the owner chooses
once and keeps: which **skin** (the look — `SKINS.md`, tokens only, unchanged by this),
which **lexicon** (the words — `docs/lexicons.md`), which **campaign kind** the board
opens on, the **Team page's default arrangement**, and the RIREKI **detail level** a new
tile shows. **A desk_profile is not a skin; each one has a skin.** It is configuration,
never a step in any run.

## The catalog

`ronin_catalogs/desk_profiles/<name>.md`, one file per profile, shadowable whole-file by
name (`docs/shadowing.md`). The directory's `README.md` carries the fields. Five ship:
`terminal` · `vibe_code` · `professional` · `home` · `league` (League is the gamer one, goofy on purpose). Every field is optional and a blank
means "as stock".

## Which one is active is settei's

`set.desk.profile` — one leaf, read by `GET /api/settei` like every other and written by
`PUT /api/settei/desk` (`{ profile }`; blank goes back to stock). A choice that must hold
across browsers is not a browser's to keep, which is why this is not `localStorage` the
way the skin pick alone used to be. `GET /api/desk-profiles` serves the list (with
`origin`, so the picker can say which are yours) and the active name in one answer, and
the client reads it once at boot (`public/js/desk-profile.js`). No profile chosen —
`active: ''` — is the ordinary state of every install older than the catalog, and
renders exactly as before.

## What reads it

| Field | Read by | When |
|---|---|---|
| `skin` | `public/js/skins.js` | at boot: the profile's skin is put up and mirrored to the device cache; a device may still pick another skin in ⚙, which wins on that device until the next profile pick |
| `lexicon` | `public/js/lexicon.js` | at boot and on a pick; every `t()` |
| `rireki_view` | `public/js/desk-profile.js` → `S.output` | a NEW tile's Output, when nothing was saved for it; a tile's own choice is never overwritten |
| `team_arrangement` | `public/js/cowork-view.js` | the Team cowork view, when a tab has no arrangement of its own |
| `campaign_kind` | the campaign board | when it lands (LEAGUE_KIT leg 6) |

Two places pick: the ⚙ Configuration tab's *Desk profile* row (the registry leaf, a
select) and the ⚙ desk's picker beside the skins (rows with blurbs and `origin`). Both
write the same leaf.
