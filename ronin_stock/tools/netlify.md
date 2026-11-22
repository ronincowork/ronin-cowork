# netlify
- **seed:** Netlify sites, deploys, previews, traffic, forms and variables for the Workspace's site
- **when:**
- **depth:** seed
- **serves:** netlify-bridge
- **order:** 86

## Usage

`netlify sites`, `traffic [--days N]`, `previews`, `forms [<form>]`, `deploy [<dir>] [--prod]`, `env` and `env set <KEY> <value> [--context <c>] [--branch <b>]`: a few lines for the site linked to the caller's Workspace, or `--site <name>`. The Ronin Services part `netlify` reads the secret `netlify-auth-token` and makes the call. Something not set: one line saying what, exit 4. Without the part: use Netlify's own API or CLI. Any other command goes to Netlify's CLI when it is installed. `netlify --help`.
