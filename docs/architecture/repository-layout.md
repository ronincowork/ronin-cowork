# Ronin Cowork repository layout

This is the canonical directory map for Ronin Cowork. It answers two questions before a
file is added or moved: who owns it, and what kind of material may live beside it? Keep
this page current in the same change that creates, removes, or changes the purpose of a
directory.

Ronin Cowork is the implemented public product. Plans, audits, speculative designs,
handoffs, and work in progress belong in Ronin Lab. Consequently, this repository has no
`plans/` or `wip/` directory.

## Repository outline

```text
ronin-cowork/
├── .github/                 hosted-repository forms and automation
├── bin/                     operator, build, install, and release entry points
├── deploy/                  deployment-owned service and machine assets
├── docs/                    current product and contributor documentation
│   ├── agents/              provider CLI integration contracts
│   ├── architecture/        implemented construction and ownership contracts
│   ├── assets/              documentation-only media
│   ├── development/         contribution, verification, and release references
│   ├── getting-started/     evaluation, installation, and first-use journey
│   ├── operating/           explicit machine and installation operations
│   ├── products/            explanations of named Ronin products
│   └── using-ronin/         ordinary owner journeys after setup
├── hostside/                files installed or executed on the host boundary
├── libexec/                 internal command implementations, not public commands
├── public/                  browser UI source and served static assets
├── ronin_bin/               Agent-facing executable tools projected onto PATH
├── ronin_catalogs/          stock typed catalogs and Agent-composition definitions
│   ├── behaviours/
│   │   ├── floor/           every resolved file applies to every Cowork Agent
│   │   ├── conditional/     individual files apply from authored launch facts
│   │   ├── selected/        individual files apply through explicit composition
│   │   └── sought/          awareness-only files; currently empty
│   ├── capabilities/        real tool bundles and their teaching
│   ├── desk_profiles/       named presentation/workspace defaults
│   ├── installations/       installable or enableable machine contributions
│   ├── lexicons/            surface-language dictionaries
│   └── templates/           reusable Agent and Team starting compositions
├── ronin_library/           Library type/index definitions and user-facing inventory
├── ronin_session_boot/      background birth sources outside Behavior composition
│   ├── all/                 KOTOBA glossary and Ronin utility only
│   ├── house/               house-seat-specific startup material
│   └── routine/             installation-contributed on/off reading
├── scripts/                 repository verification, diagnostics, and maintenance
├── src/                     TypeScript server, contracts, adapters, and runtime
│   ├── activation/          registration and optional-Service activation state
│   ├── commands/            implementations behind command dispatchers
│   ├── desks/               managed-worktree lifecycle and custody
│   ├── promotion/           coordinated Team-line promotion machinery
│   ├── routes/              HTTP resource and operation adapters
│   ├── services/            generated Services runtime placement; never author here
│   └── ws/                  websocket transport boundaries
├── tests/                   behavior and contract tests mirroring owned surfaces
├── artifacts/               disposable diagnostic output; never product authority
├── AGENTS.md                contributor routing for coding agents
├── CLAUDE.md                provider-native contributor routing adapter
├── CONTRIBUTING.md          human contributor entry
├── KOTOBA.md                canonical product vocabulary
├── KOTOBA_GLOSSARY.md       Agent-facing vocabulary source
├── LICENSE                  distribution license
├── NOTICE                   attribution notice
├── README.md                public repository/product entry
├── RONIN_REPO               repository arrangement declaration
├── package.json             JavaScript commands and dependency contract
├── package-lock.json        pinned JavaScript dependency graph
├── setup.sh                 installation entry point
├── tsconfig.json            TypeScript compiler contract
└── vendor.lock              pinned external source dependencies
```

## Placement rules

### Documentation

`docs/` explains the implemented Ronin product. Put a page under the reader journey it
serves, not under the code module that happens to implement it:

| Directory | Put here | Do not put here |
|---|---|---|
| `getting-started/` | evaluation, install, setup, provider sign-in, first Agent | internal architecture or recurring machine operation |
| `using-ronin/` | ordinary Workbench, Team, tile, record, and desk journeys | implementation contracts |
| `operating/` | deliberate machine administration, health, deploy, VPN, secrets | automatic Agent Behavior |
| `products/` | what a named Ronin product is and how it fits | its implementation source |
| `architecture/` | stable implemented contracts, ownership, and data flow | proposals or rollout plans |
| `development/` | contribution, verification, dependency, and release procedure | user installation journey |
| `agents/` | integration contract for each supported provider CLI | Ronin-owned business rules unique to one provider |

A working Agent must not need to discover a `docs/` page to receive an operational rule.
That rule belongs in a Behavior, capability, tool help, or repository `AGENTS.md`.

### Agent composition

`ronin_catalogs/` is the stock, upgrade-owned half of typed resources. Owner resources
live in stores outside the repository and shadow or extend the stock coordinate defined by
each catalog.

- A **capability** exists to group and teach real Agent tools. It must have a `## Tools`
  table. General conduct does not belong there.
- A **Behavior** exists primarily to influence how an Agent works. Its directory is its
  delivery scope: `floor`, `conditional`, `selected`, or `sought`.
- An **installation** describes what a machine can install or enable and what that state
  contributes. It is not an Agent capability.
- A **template** is an authored starting composition, never runtime authority.
- A **desk profile** and **lexicon** are presentation defaults and words, not Agent
  instruction.
- Flat root registries remain flat when their format needs no additional grouping.

The floor currently contains `mandates.md`, `cowork-agent.md`, and the stock-empty
`user-intro.md`. Registration writes the owner's two-line introduction to
`ways/floor/user-intro.md`, which shadows the placeholder whole. Team-lead teaching lives
in `conditional/team-lead.md`, and a lead with managed worktrees also gets
`conditional/lead-worktrees.md`; Team remains the tool capability in
`capabilities/cowork_team.md`.

### Session Boot

`ronin_session_boot/all/` is deliberately small background material the owner should not
need to compose: the KOTOBA glossary and Ronin utility. Universal working rules
belong in the Behavior floor. Tool workflows belong in capabilities. Do not rebuild a
second universal instruction shelf here.

House and routine readings exist only for their declared startup mechanisms. Owner root
reading remains in the external Session Boot store, not in this stock repository.

### Executable and runtime code

- Put public Agent commands in `ronin_bin/`; put operator/build/install commands in `bin/`.
- Put implementation helpers invoked behind commands in `libexec/` or their owning
  TypeScript module. A helper is not a second public tool.
- Put server authority and typed contracts in `src/`; browser code calls those contracts
  from `public/`.
- `src/services/` is assembled from Ronin Services at boot and is not an authoring
  location. Make optional-part changes in the Services repository.
- Every tmux operation goes through `src/tmux-client.ts`; non-tmux processes start through
  `src/spawn-broker.ts`.

### Generated, diagnostic, and local material

Generated files must name their generator and canonical source. Never edit `src/services/`
as source. `artifacts/` may contain disposable diagnostics only and must not become an
input contract. User data, owner shadows, runtime state, desks, and generated birth
READMEs live in their external stores, not in this repository.

Do not add `plans/`, `wip/`, or a compatibility holding directory. Move unfinished work
to Ronin Lab; once implemented, leave only the current product documentation and contract
here.

## Change checklist

Before adding or moving a directory:

1. Name its single canonical owner and whether its contents are stock, owner-authored,
   generated, or disposable.
2. Confirm an existing directory cannot own the material without mixing authorities.
3. Update this outline and the narrower child `README.md` in the same change.
4. Update links and consumers; do not leave aliases merely to preserve an old layout.
5. Preserve owner shadows at the same semantic coordinate when a catalog changes.
6. Run focused checks for the changed paths and links. Leave the full `npm run verify`
   verdict to the lead's combined gate ([verification guidance](../development/verification.md));
   after changing an installed box or its user stores, run `npm run byoin`.

The [contributor map](../contributor-map.md) answers which product surface a change
crosses. This page answers where its files belong.
