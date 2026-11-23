# Integrations
- **seed:** Any outside service a user brings is used one common way: `ronin-help integrations`.
- **when:**
- **depth:** seed
- **order:** 23

Ronin has one common way for any outside service a user brings: hosting, a database, mail,
anything. You already know how to use the service. This says where things are and what to
write down.

### Where things are
- **Your Workspace's integrations:** `work-record workspace list` shows them. The owner turns
  one on for a Campaign, Workspace, Team or Agent; one that is on brings its bridge into your
  brief.
- **Keys:** never in chat. Ask for one with `secret ask <provider>-<key> --for "<what it is>"`
  (`secret ask perplexity-api-key --for "Perplexity API key"`); the owner pastes it on your tile.
  Use it by its file: `secret path <name>` gives the path to pass, or to read in your own
  script. `secret ls` lists what is saved.
- **A bridge**, where Ronin has one, is the short way: it reads the key, fills in the account
  and the site, and trims the answer. Without one, call the provider's own CLI or API.

### The way
1. Code goes through a PR: `gh pr create`. A host linked to the repo builds a preview by
   itself; `gh pr checks` says whether it built.
2. Show the preview: `preview` adds the PR's preview link to your Documents.
3. Ship when the person you work for says so: `gh pr merge`.
4. A choice that depends on the work (where a preview's data comes from, which plan, which
   region): name the choices to the person you work for, and take the one they pick.
5. Connect a new provider: its key through `secret`, and ask the owner to turn it on for the
   Workspace.
6. When your Workspace has a canvas, put it there: a link and one line.

### Don'ts
- Don't print, paste or commit a key, or put one in a `.env`, a doc or a message.
