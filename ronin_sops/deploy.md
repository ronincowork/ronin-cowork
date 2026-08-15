# deploy — getting a thing running where other people can reach it

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `deploy.md`) replaces
> this file whole — a default, not law.
> **Voice: relay.** Written for the agent to walk a person through, not to follow itself.

Deploying is not a final step. It either works from early on or it fights you at the end,
so the standard is to do it while nothing is at stake.

## The order

1. **It runs on your machine.**
2. **It runs from a clean checkout** — a fresh clone, a fresh install, nothing that only
   exists on your disk. Most first deploys fail here, and finding that out locally is
   free.
3. **It runs on someone else's machine.** Put the empty shell up early — a page that says
   hello — so the first real deploy is a change rather than an event.

## Choosing where

Match the host to the shape, smallest that fits:

- **Static**, no server of its own → any static host. It is a file copy.
- **A server** → a host that runs a process and hands it a URL.
- **A server plus records** → the same, with a managed database beside it (`data.md`).

Names and prices change; the shape does not. Choose on the shape, and prefer somewhere
the_owner can already log in.

## The parts that bite

- **Secrets are configuration, not code.** They live in the host's environment, never in
  the repo (`github.md`).
- **The build command and the start command are two different things**, and a host asking
  for both is asking a real question.
- **"It works locally"** almost always means a version, a path, or a variable that exists
  on one machine only. Compare those three before guessing.
- **Know how to roll back** before the first deploy that matters.
