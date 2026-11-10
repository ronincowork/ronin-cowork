# Integrations

- **label:** Integrations
- **blurb:** Use any outside service a user connects the common way: its own tools, its keys, a PR, the preview, the record.
- **installation:** —
- **order:** 23
- **scope:** selected

Ronin has one common way for any outside service a user brings: hosting, a database, mail,
anything. You already know how to use the service. This says where things are and what to
write down.

### Where things are
- **The index:** one record per integration: what it is for, where its token lives, its
  tools (its own CLI and API, and a bridge if Ronin has one). The shipped records are in
  `../../integrations/` beside this brief (its `README.md` gives the fields); the ones
  Agents add are in `~/ronin/catalogs/integrations/<provider>.md` (make the folder with
  the first). Read it before you connect anything.
- **Your Workspace's integrations:** `work-record workspace list` shows them. They live in
  the Workspace record, `~/ronin/workspaces/<campaign>/<workspace>.json`, as
  `"integrations": [{"provider": "<provider>"}]`; add a provider there (with any fact its
  bridge reads, such as `"site"`), or the owner does it on the Workspace page.
- **Keys:** one plain `.env` per provider per Campaign, in `~/ronin/services_secrets/`
  (`<provider>-<campaign>.env`). For the provider's CLI, load it:
  `set -a; . ~/ronin/services_secrets/<provider>-<campaign>.env; set +a`.
  A new key goes in that file. Settings › Integrations shows what is set and what is missing.
- **A bridge**, where Ronin has one, is the short way: it reads the same file, fills in the
  account and the site, and trims the answer. Without one, call the provider's CLI or API.

### The way
1. Code goes through a PR: `gh pr create`. A host linked to the repo builds a preview by
   itself; `gh pr checks` says whether it built.
2. Show the preview: `preview` adds the PR's preview link to your Documents.
3. Ship when the person you work for says so: `gh pr merge`.
4. A choice that depends on the work (where a preview's data comes from, which plan, which
   region): name the choices to the person you work for, and take the one they pick.
5. Connect a new provider: its key in its `.env`, its record in the index. Connect a
   provider with its record, never without one. Remove the record when it goes.
6. When your Workspace has a canvas, put it there: a link and one line.

### Don'ts
- Don't print, paste or commit a key, or put one in a Workspace `.env`, a doc or a message.
