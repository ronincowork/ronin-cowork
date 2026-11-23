# Netlify bridge
- **seed:** Netlify hosts the Workspace's sites: `netlify` for its sites, deploys, traffic, forms and variables; `preview` for a pull request's preview link. Setting a site up, the owner's steps: `ronin-help netlify-bridge`.
- **when:** integration:netlify
- **depth:** full
- **facts:** site
- **order:** 24

Netlify hosts this Workspace's site. It builds a preview for every pull request and publishes
the production branch when a PR merges. The `netlify` bridge is the short way to read it: it
fills in the account and the Workspace's site (its `site`, which the owner sets on the Workspace
page's Netlify row and your Workspace line shows), and answers in a few lines.
Netlify's own CLI and API still work for anything it doesn't cover.

- Change the site the usual way: a PR, then `preview` puts its preview link in your Documents.
  It goes live when the person you work for says ship and the PR merges.
- `netlify sites`: is it live, and did the last deploy fail? A failed build also shows red on
  the PR's checks.
- `netlify previews`: the site's deploy previews, the latest per PR and the latest drafts, with state and link.
- `netlify env`, `netlify env set <KEY> <value> --context <c>` (or `--branch <b>`): the
  variables a build reads. A change applies from the next deploy.
- `netlify forms [<form>]`: what visitors sent through the site's forms.
- `netlify traffic`: views and visitors, when Netlify Analytics is on for the site.
- A draft for the person you work for to check, on a Workspace with no repo: `netlify deploy <dir> --message "<item>: <what changed>"`; the canvas shows that message, the item and your name.
- `netlify deploy <dir>`: only for a Workspace with no repo. Without `--prod` it is a draft
  with its own URL. A site that builds from a repo changes by PR, not by this.
- `--site <name>` reaches another site on the account; without it, the Workspace's.
- Which data a preview uses (production's, one staging database, one per PR) is a choice for
  the person you work for: name the forks and take the one they pick.


### Setting it up
`netlify sites` says what is missing. The owner does the clicks: give one step at a time and
wait for each.
1. **The site:** app.netlify.com, sign up with GitHub; Add new project → Import an existing
   project → GitHub; install the Netlify app on the repository's owner, for that repository
   only; pick the repository, the production branch, the build command (empty for a static
   site) and the publish directory (`.` for the top). Deploy, then ask for the site name it
   gives (`<name>.netlify.app`).
2. **The token:** `secret ask netlify-auth-token --for "Netlify personal access token"`. The
   owner makes it under User settings → Applications → Personal access tokens.
3. **The link:** the owner adds Netlify to the Workspace on its page (Integrations) and types
   the site name in its `site` field; until then, `--site <name>`.
4. **The domain:** add it and its `www` to the site through Netlify's API, the token by
   `secret path netlify-auth-token`.
5. **DNS,** at the registrar: the bare domain an A record to `75.2.60.5`; `www` a CNAME to
   `<name>.netlify.app`. Netlify issues the HTTPS certificate by itself.
6. **Done:** when `curl -sI` shows both names answered by Netlify, say so. An old host comes
   down only when the owner takes it down.
