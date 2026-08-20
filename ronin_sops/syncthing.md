# syncthing — the same folders on every one of your machines

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `syncthing.md`)
> replaces this file whole — a default, not law.
> **Voice: relay.** Written for the agent to walk a person through, not to follow itself.
> **Tool: syncthing's own.** The measuring is the vendor's REST API and systemd, and no
> answer from either is ever written down. `syncthing --paths` names the config file on
> any box; the API key is inside it (`syncthing cli config gui apikey get` prints it).

Syncthing keeps chosen folders identical across the owner's own machines — peer to peer,
continuously, with no cloud copy in the middle. When it is healthy it is invisible, which
is exactly why every conversation about it starts the same way: something the owner
expected on one machine is not there, and nobody has looked at syncthing in months.

## First move: a file someone cannot find

*"I still see the old version"*, *"it's not on my laptop"*, *"the last change I see is
X"* — **resync first, investigate second.** The folder watcher can lag or miss a write,
and a manual rescan costs one call. Do not begin by theorizing.

**Rescan on the machine where the change was made.** A rescan only reads the local disk
of the machine it runs on, so that machine can *announce* its own edits — it fetches
nothing. Receiving is not a button: a connected peer pulls automatically the moment the
other side announces. A person hammering Rescan on the machine that is *missing* the file
is pulling the wrong lever, and it will feel broken while doing exactly what it says.

```bash
KEY=$(syncthing cli config gui apikey get)
curl -s -X POST -H "X-API-Key: $KEY" http://127.0.0.1:8384/rest/db/scan
```

No `folder=` parameter means every folder. Then prove delivery rather than assuming it:

```bash
curl -s -H "X-API-Key: $KEY" http://127.0.0.1:8384/rest/system/connections
curl -s -H "X-API-Key: $KEY" 'http://127.0.0.1:8384/rest/db/completion?device=<peer-id>'
```

The peer connected and at `"completion": 100` with `needItems` 0 **has the file** — at
that point the fix is on the other machine's side of the desk: have the person refresh
the listing or the app they are looking at. One file's fate can be pinned exactly with
`/rest/db/file?folder=<id>&file=<relative/path>` — its versions and which devices hold it.

## The trap: two services with one name

systemd can run syncthing two ways on the same box — a **user** unit
(`systemctl --user status syncthing`) and a **system** unit
(`systemctl status syncthing@<login>`) — and each scope answers only for itself. An agent
here checked the user unit, saw `inactive`, announced syncthing was down, and started a
second instance into a port collision — while the system unit had been running for seven
days. Do not be the second agent.

**Never conclude "not running" from one unit's status.** Establish what is true, in this
order, and stop at the first yes:

1. **Does the API answer?** `curl` the GUI address (above). An answer *is* a running
   syncthing, whatever any unit file says.
2. **Is there a process?** `pgrep -a syncthing`. Two identical `serve` lines are one
   instance — the monitor and its child, not a double start.
3. **Which unit owns it?** Ask both scopes, and believe the active one.

And the mirror rule: **if it is running, never start another.** The second instance fails
on the bound port and leaves a `failed` unit behind to alarm the next reader — if you
caused one, `systemctl --user reset-failed` cleans up your own mess. Only when all three
checks come back empty is starting it the move, and then it is the unit this box actually
uses — found from the unit files, not from memory of some other box.

## When a resync does not fix it

In rough order of how often each is the answer:

1. **The other machine is off, asleep, or not connected.** `/rest/system/connections`
   shows it absent or `"connected": false`. Nothing is broken; nothing syncs to a machine
   that is not there.
2. **The folder is paused, or not shared with that device.** The folder's own status
   says so; so does the GUI.
3. **The file is ignored.** A pattern in that folder's `.stignore` matches it, and an
   ignored file syncs nowhere, silently.
4. **A conflict copy is holding the content.** Both sides edited; syncthing kept both.
   Look for `*.sync-conflict-*` beside the original and let the **owner** choose which
   survives — never resolve a conflict for them.
5. **The two machines disagree about who is on the network.** Device not accepted on one
   side, or a folder offered but never accepted — the GUI on either end says so plainly.

## What never gets written down

Which unit runs it on a box, the folder roster and ids, device ids, addresses, whether a
peer is currently connected. All of it is measured, every time, by the calls above. A
written answer about somebody's box is wrong the day the box changes and nobody notices.
