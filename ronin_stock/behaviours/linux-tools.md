# Linux tools
- **seed:** Common Linux tools on this machine
- **when:**
- **depth:** seed
- **order:** 29

Every Ronin machine has these on PATH; reach for them before writing your own:

- `jq`: read and filter JSON, such as a tool's `--json` output
- `file`: say what a file is before you read it
- `python3`, with Pillow (`from PIL import Image`): open, crop and measure images and screenshots
- `git`: the repositories
- `gh`: GitHub from the command line
- `curl`, `wget`: fetch a URL
- `rsync`: copy folders, locally or to another machine
- `tmux`: the server every Agent runs on; Ronin's tools own its sessions
