# Netlify
- **label:** Netlify
- **blurb:** A site or app on Netlify, for checking a change: the newest preview first, then the live page, traffic and forms, its database and repos.
- **order:** 10
- **kinds:** site, app
- **integration:** netlify
- **drawing:** https://claude.ai/artifact/5DzaJKuVZu2jJoPP9G1JyC

The Netlify block first, then the Workspace's own parts. A block holds only what
the Workspace uses: no Netlify site linked, no Netlify block; no database, no Database block.
No credits entry: Netlify's API gives no credits-left figure to read. No work items or documents
block: the item behind a preview shows on that preview.

## blocks

### Netlify
- **source:** integration netlify
- **holds:** The site itself, read from Netlify each time the canvas opens.
- **entries:** Draft and Live buttons on top (the newest ready preview, the live site), then Drafts (one entry with Open for each open PR and each of the newest drafts: what it is, who made it, for which item), then Live (up, published when, the latest build, the code), traffic (visitors and errors, today), forms (only if the site has one: new messages)
- **read:** netlify previews --card --workspace {workspace}; netlify sites --card --workspace {workspace}; netlify traffic --card --days 1 --workspace {workspace}; netlify forms --card --workspace {workspace}

### Database
- **source:** integration
- **holds:** Only the databases this site uses, from whichever provider: none, one or several.
- **entries:** database (provider and health)

### Repos
- **source:** live repos
- **holds:** The code for this site.
- **entries:** repo (what it serves, and its page)

### Other services
- **source:** typed
- **holds:** Anything outside Ronin the site depends on, added by an Agent or a person.
- **entries:** service (one line; who changed it and when)
