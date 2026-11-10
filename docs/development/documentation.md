# Documentation audiences and ownership

Choose the reader's task before choosing a location. People and Agents can read either
product guidance or construction references. Being an Agent does not make a reader a
Ronin developer.

| Audience and question | Home | What belongs there |
|---|---|---|
| Prospective or current user: what can I do, and how? | Cowork README, `docs/getting-started/`, `docs/using-ronin/`, `docs/operating/`; Services usage guides | Available behavior, steps, outcomes, limits, recovery, and relevant data/consent facts |
| Contributor: how is this constructed or extended? | [Contributor map](../contributor-map.md), `docs/architecture/`, current development references, Services manifest and contracts | Ownership, APIs, state, invariants, extension points, and reproducible verification |
| Ronin creators: what should we build, why, and what did we learn? | The creators' `ronin-lab`: `wip/`, `plans/`, `records/`, design and research areas | Proposals, buildouts, audits, alternatives, dated measurements, review evidence, and rollout notes |

Ronin Lab has the same meaning for users and creators: a place to contemplate ideas,
make plans, and keep notes across work. The creators' Lab is their instance of that
space, not a required part of another owner's installation.

## One current authority

- [KOTOBA](../../KOTOBA.md) owns meanings; the stock lexicon owns default UI wording;
  [KOTOBA_GLOSSARY](../../KOTOBA_GLOSSARY.md) teaches how Agents speak to the owner.
- The seven entries in the [contributor map](../contributor-map.md) remain stable.
  Surface seven is **Work Record**; coordination supports it.
- Cowork owns product UI and the host. Services owns optional part implementations,
  its manifest, and integration contracts. Link across that boundary instead of
  copying the same contract into both repositories.
- A plan cannot override the implementation contract. When work lands, update the
  relevant usage guide and contract; retire or archive the plan in Lab.

## Keeping the routes separate

A usage page starts with the user's task, gives the next action and expected result,
and explains a real limitation where it affects that action. Put source-file tables,
wire formats, and test commands in a linked construction reference. An operator command
that helps a user diagnose their installation belongs in the usage guide.

A construction page describes current behavior and names its code and verification.
It must stand alone without private Lab access. Lab can explain the decision history;
it must not be the only place an implemented rule is specified.

Do not put session names, temporary preview URLs, dated approval directions, resume
checklists, or implementation proposals in user guides. A user asking an Agent to plan
*their own work* is ordinary product use, so work-record instructions and the planning
guide (`docs/using-ronin/planning.md`) still belong in the product.

## Change checklist

1. Follow the journey from the root README through the relevant usage guide.
2. Follow the contributor map to the owning code and construction contract.
3. Check terms against KOTOBA and UI labels against the stock lexicon.
4. Distinguish present source, installed parts, loaded parts, and desired switches.
   A repository commit or a successful test does not prove a running installation.
5. Preserve canonical links. If a mixed page is split, retain its usage entry and
   link to the construction reference; update inbound links that need the latter.
6. Keep creator history in Lab, with source revision and status. Do not package Lab
   drafts as product documentation or present proposed behavior as available.
