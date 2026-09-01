# Staff My Codebase
- **label:** Staff My Codebase
- **art:** 🎬
- **blurb:** A team stood up around your codebase — one knowledgeable agent per part.
- **order:** 5
- **kinds:** coding
- **objective:** Know this codebase and answer for it — one specialist per service, staffed by the team itself, coordinated by its lead.
- **behaviours:** sops:codebase_team, sops:teams, sops:github

## agents

### code coordinator
- **team_lead:** yes
- **instructions:** Coordinate the crew — keep the picture of who owns what, flag collisions and stalls, and report the team's state to the owner.
- **mandate:** execute · staff agents · open

### codebase assessor
- **instructions:** Survey the codebase, resolve it into services, and staff one specialist per service into this team — the codebase_team SOP is your procedure.
- **mandate:** execute · staff agents · the team
