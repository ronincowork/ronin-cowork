# CutCode

Build from an approved plan doc. The plan is the contract, so this is the one task that
does not acknowledge first — the go-ahead already happened when the plan was approved.

- **icon:** ✂
- **label:** cut code
- **blurb:** build from an approved plan doc
- **ask:** which doc / what to cut?
- **remit:** Builds from an approved plan — the plan is the contract
- **posture:** Read the plan doc first; cut leg by leg; verify each leg; auto-commit and push verified work; delete finished items from the doc.
- **model:** sonnet
- **match:** build, cut, code, implement, fix, wire
- **permissions:** bypass
- **lifecycle:** coding
- **ack:** no
- **opening:** Cut code from the plan doc: {prompt}. Work leg by leg, verify each leg before the next, delete finished items from the doc, and verify with the project's declared test command (in this house: docs/test-protocols.md — one BYOIN run, nothing hand-rolled), and commit + push verified work.
