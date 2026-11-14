# Integrations
- **label:** Integrations
- **blurb:** A site or app and what it runs on: the live page, its database, repos, work and documents.
- **order:** 10
- **kinds:** site, app
- **drawing:** https://claude.ai/artifact/5DzaJKuVZu2jJoPP9G1JyC

One block per linked integration, then the Workspace's own parts. A block holds only what
the Workspace uses: no Netlify site linked, no Netlify block; no database, no Database block.

## blocks

### Netlify
- **source:** integration netlify
- **holds:** The site itself, read from Netlify each time the canvas opens.
- **entries:** page or app (up, and whether the last change went out), preview (only while one is open), traffic (visitors and errors, today), forms (only if the site has one: new messages), credits (left this month, auto-recharge on or off; at zero every site pauses)

### Database
- **source:** integration
- **holds:** Only the databases this site uses, from whichever provider: none, one or several.
- **entries:** database (provider and health)

### Repos
- **source:** live
- **holds:** The code for this site.
- **entries:** repo (what it holds)

### Work items
- **source:** live
- **holds:** Epics and items in this Workspace, open ones first.
- **entries:** epic or item (status and who holds it)

### Documents
- **source:** live
- **holds:** Plans and documents the Agents keep for this site.
- **entries:** plan or document (what it covers)

### Other services
- **source:** typed
- **holds:** Anything outside Ronin the site depends on, added by an Agent or a person.
- **entries:** service (one line; who changed it and when)
