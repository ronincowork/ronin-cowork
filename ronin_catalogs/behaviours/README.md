# Behaviors

Provider-neutral instructions for how an Agent works. The four directories are delivery
contracts, not subject categories. One Markdown definition per behavior; the basename is
its stable identifier.

```text
behaviours/
├── floor/         every resolved file is applied in full
├── conditional/   matching files are applied in full from authored `requires` facts
├── selected/      individual files are applied when Agent → Team → Campaign selects them
└── sought/        every resolved file contributes only a generated awareness card
```

`floor/` and `sought/` are folder-resolved: adding a file changes the generated birth
without editing an index. `conditional/` and `selected/` contain candidates; their
inclusion mechanisms choose individual files. Sought files are never applied as current
instructions. This shelf is presently empty.

The owner's `ways` store mirrors these four directories. A file at the same scoped
relative path shadows the stock file whole; a new relative path adds one. Moving a file
between scopes deliberately changes its delivery contract.

Each definition carries `scope`, optional `label`, `blurb`, `installation`, `requires`,
`reading`, `tools`, `mcp`, and `order` keys as needed. The directory and declared `scope`
must agree. There is no `situational`, SOP, practices, reference, or docs sub-shelf here.
Ordinary searchable operator and product explanation belongs in `docs/`.

Stock `floor/user-intro.md` is the empty placeholder. Registration populates its whole-file
shadow in the owner `ways` store with a maximum two-line introduction compiled into every
Cowork Agent's birth brief; blank registration text removes the shadow and reveals the empty
stock page. The registration record is canonical, so there is no maintained index.
