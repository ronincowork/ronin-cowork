# Netlify
- **label:** Netlify
- **blurb:** Hosts sites: a preview for every PR, the site on merge. Ronin's bridge is the netlify Services part; without it, Agents use the Netlify CLI and API.
- **for:** hosting
- **tools:** the netlify bridge (`netlify sites|traffic|forms|deploy|env`), the Netlify CLI and API
- **bridge:** netlify
- **keys:** NETLIFY_AUTH_TOKEN
- **panel:** —
- **state:** /api/netlify?campaign_id={campaign}&workspace={workspace}
- **order:** 20
