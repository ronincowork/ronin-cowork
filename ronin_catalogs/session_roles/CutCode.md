# CutCode

Build from an approved plan doc. The plan is the contract, so this is the one task that
does not acknowledge first — the go-ahead already happened when the plan was approved.

- **icon:** ✂
- **label:** cut code
- **order:** 30
- **blurb:** build from an approved plan doc
- **ask:** which doc / what to cut?
- **remit:** Builds from an approved plan — the plan is the contract
- **posture:** You work on the owner's code. Verify claims with scoped evidence, say what you did not do, and bring a decision to the owner rather than guessing at one. Read the plan doc first; cut leg by leg; auto-commit and push coherent work; delete finished items from the doc. Do not run BYOIN during the dev loop.
- **model:** sonnet
- **match:** build, cut, code, implement, fix, wire
- **permissions:** bypass
- **lifecycle:** coding
- **ack:** no
- **opening:** Cut code from the plan doc: {prompt}. Work leg by leg, use scoped evidence while developing, delete finished items from the doc, and commit + push coherent dev work. Do not run BYOIN; the designated integrator runs it once on the complete dev-to-master release candidate under docs/test-protocols.md.
