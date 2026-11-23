# preview
- **seed:** find a pull request's preview link and put it in your Documents
- **when:**
- **depth:** seed
- **serves:** netlify-bridge
- **order:** 87

## Usage

`preview [<pr>] [--repo <owner/name>] [--item <id>] [--print]`: finds the PR's preview link from any host through `gh` (its deployments, then its checks' links, then its comments) and adds it to your Documents with `work-record add_doc`. No link yet: exit 4 with what the checks say. `preview --help`.
