# vpn — reaching your own Ronin from your other devices

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `vpn.md`) replaces
> this file whole — a default, not law.
> **Voice: relay.** Written for the agent to walk a person through, not to follow itself.
> **Tool: `bin/ronin-doctor`** — it resolves the address Ronin is actually bound to and
> rules on whether that address is safe. Run it before the conversation starts and again
> at the end; the whole of this SOP is about moving that address and then proving it moved.
> The other half of the measuring is the VPN's own — `tailscale status` and
> `tailscale serve status` — and neither answer is ever written down.

Ronin runs on one machine. A VPN puts that machine and **all their other devices** — the
phone, the laptop, the tablet, a virtual machine somewhere — onto one small private network
of their own, so any of them can open Ronin **from anywhere**, not just from the room the
machine is in. That is the entire reason we do this, and it is the only reason worth saying
out loud.

**Two situations fetch this file, and they enter it at different doors.** Someone setting it
up for the first time reads it in order. Someone who had it working and now cannot reach
their Ronin — *"it worked yesterday"*, *"it works at home but not on my phone"* — is a
**§ When it does not work** conversation, and going back through the steps from the top
wastes their time and yours. Go to that list, work down it, and only come back up here if
one of the answers turns out to be that a device was never set up at all.

## Who is reading this over your shoulder

**Assume the person knows none of it.** Someone who was comfortable here would have done it
already; the situation that fetched this SOP is nearly always someone who is not sure what
a VPN is, has never heard of the product, and will not tell you when they are lost.

**So explain like you are explaining it to your grandmother, and keep doing it after they
say they understand.** This is the SOP's main instruction. Everything below is easy; the
only thing that actually goes wrong is an agent moving at its own speed past things it
assumes are obvious.

These are the ones people genuinely do not know — including people who have used this for
years:

- **There are two kinds of VPN, and theirs is the other one.** Say this first, unprompted:
  they are picturing the thing advertised on television, the one people buy to hide what
  country they are in. Both are genuinely VPNs — both build a private tunnel — but they do
  opposite jobs. **The advertised kind sends everything they do out through a stranger's
  company, somewhere else.** Theirs sends nothing anywhere: it builds a small private network
  that **only their own machines are on**, so those machines can find each other. Nothing
  about their internet changes, nothing is hidden, nothing is slower, and there is no monthly
  bill.
- **Their computer and phone will call it a VPN too, and that is a good thing.** A Mac shows a
  VPN badge up in the top strip, an iPhone shows the word VPN beside the clock, and it appears
  under VPN in the phone's own settings. **Do not talk them out of that** — it is the same
  word for the same reason, and it is the fastest way for them to check the thing is on
  without opening anything. Point at it: *if that badge is showing, you are connected.*
- **It is an app, and an app has an on switch.** The most common failure in this whole
  procedure, and it catches experienced people. Installed is not signed in. Signed in is not
  turned **on**. It has to be on, on **both** devices, at the same time, for anything to
  work.
- **It hides where they will not think to look.** On a Mac it is a small icon in the strip
  along the very top of the screen, not in the Dock. On Windows it is in the tray by the
  clock, sometimes behind an arrow. On a phone it is an ordinary app icon. **Tell them where
  to look — do not say "open Tailscale" and wait.**
- **It contains a list of their machines, and that list is the whole idea.** Get them to open
  the app and read the list out to you. Once someone has seen their own laptop and their own
  phone sitting in one list, everything else in this SOP explains itself, and they stop
  needing you.
- **A device that is asleep or switched off is not on the list, and that is normal.** Their
  Ronin machine has to be awake and running. This is the answer to half of "it stopped
  working" later on.
- **It keeps working when they leave the house.** Worth saying because it sounds too good —
  people assume anything to do with "home network" stops at the front door. It does not. The
  same address works from a train.
- **Ask them to say it back.** "Does that make sense?" gets a yes from everybody. "Tell me
  what you just did" does not.

And go **one step at a time**. Do not paste four commands. Say what a command is for, let
them run it, hear what happened, then move.

## Before you install anything

**Check whether it is already there.** Plenty of people already have this app on one or more
of their devices and have forgotten, or had it installed by someone else. `tailscale status`
on the Ronin box answers for that machine; for the others, have them look for the app.

If it is already installed, the work is usually just signing in — and making sure it is the
**same account** everywhere (step 3).

## The order, and why it is the order

**One device at a time, and prove each one before starting the next.** Someone who installs
on two machines and then tries to connect has two places the fault could be and no way to
tell which. Someone who does the Ronin box, proves it works, and then does the phone knows
straight away which end broke.

### 1 · Put the VPN on the Ronin box

Install it and sign in.

The product is **Tailscale**, from `tailscale.com/download`. It is free at the size one
person's own devices come to. The sign-in uses an account they already have — a Google
account, a GitHub account, an email — so they are **not** creating a new password.

**Write down which account they picked.** You will need that exact answer at every other
device, and picking a different one there is the single most common way this goes wrong.

### 2 · Restart Ronin, then get its address

**This step is easy to skip and nothing works without it.** Ronin works out its address when
it starts. If Ronin was already running when the VPN arrived, it is still on the address it
had before — reachable from nowhere but the machine itself. A perfectly healthy Ronin that
answers nobody.

So: restart it, then run `bin/ronin-doctor`. Its `operator` section prints
`serving at http://<address>:<port>/`. If it instead reports that nothing answers that
address, the restart is what is missing.

**Give them the machine's name, not its number.** The VPN gives the box both — a number like
`100.x.x.x` and a name like `their-machine.something.ts.net`. Doctor reports the number,
because a number is what an address is; the name is in `tailscale status`, on this machine's
own row, and `setup.sh` prints both at the end of a run. Both work — but the name is the one
a person can remember, read down a phone line, and type on a phone without errors, and it is
the only one step 4 can put a certificate on.

### 3 · Now their other devices

On each one — phone, laptop, whatever they want to reach Ronin from — install the same app
and sign in with **the same account as step 1**.

On a phone that means the App Store or Play Store, under the same name. On a phone it will
also ask permission to set up a VPN connection, in an official-looking box from the phone
itself. **Warn them that box is coming and that it is expected** — it looks alarming, and a
person who taps Deny will be stuck with no idea why.

Signing into one device with Google and another with GitHub makes **two separate private
networks that cannot see each other**, and every symptom of that looks like a broken
connection rather than a wrong login. If nothing can reach anything, check this before
anything else.

Then have them open the address from step 2 on that device. It should simply answer.

### 4 · Turn on HTTPS, once

Optional, and worth doing while you are here. One command, **on the Ronin box only**, gives
the address a proper certificate — so browsers stop putting "Not secure" next to it, and the
address behaves like any normal website:

```
sudo tailscale serve --bg --https=8443 http://<the-address-doctor-gave-you>:<ronin's port>
```

**The installer already printed this line with their numbers filled in.** If that terminal is
still open, use that copy rather than assembling it by hand — `setup.sh` prints it again at
the end of any run.

**On a Mac this may answer `command not found`, and that is not their fault.** The version of
Tailscale installed from the Mac App Store does not put the `tailscale` command where a
terminal can find it — the app is there and working, only the typed command is missing. It
lives inside the app:

```
/Applications/Tailscale.app/Contents/MacOS/Tailscale
```

Run it by that full path, or make the short name work once and for good:

```
sudo ln -s /Applications/Tailscale.app/Contents/MacOS/Tailscale /usr/local/bin/tailscale
```

The standalone download from `tailscale.com` does not have this problem. Do not let anyone
conclude the install failed — say plainly that the app is fine and the shortcut is missing.

Finally, hand them the `https://` address and **ask them to bookmark it** on every device
they just set up. That is the address that works from everywhere. Ronin cannot make a
bookmark for them.

## What we do not do

**We never open a door on their router.** Port forwarding, finding their own public address,
keeping it current, putting a certificate on it — it is the exact friction this whole
approach exists to delete, and on a lot of home internet connections it is not even possible.
It is not a fallback and it does not get offered as one, including when the VPN is being
awkward. If the VPN truly will not work for someone, the honest answer is that Ronin runs on
the machine in front of them today.

**We do not publish Ronin to the open web.** The vendor offers a feature that puts a service
on a public address; nobody here has walked it end to end, and it would leave the login page
as the only thing between a stranger and the box. It is not part of this SOP.

**We hold nothing.** The VPN account is theirs, with that vendor, and no credential from it
comes anywhere near Ronin or gets written into a file (`secrets.md`).

## When it does not work

In order, because this is roughly how often each one turns out to be the answer:

1. **The app is not turned on.** On one device, or the other, or it signed itself out. Do this
   before thinking about anything else, and start with the badge — the VPN mark in the top
   strip on a Mac, beside the clock on an iPhone. No badge, not connected, and the app itself
   is the next place to look. Check **both** ends and have them tell you what each one says.
2. **Different accounts on the two ends.** Have each device say who it is signed in as, and
   compare. Nothing else matters until those match.
3. **The Ronin machine is asleep or switched off.** It will simply be absent from the list in
   the app. Nothing is broken.
4. **Ronin was not restarted after the VPN went on.** `bin/ronin-doctor` names the VPN address
   and then reports that nothing answers it — that pair is the signature. Restart and re-run.
5. **They are typing the number and expecting `https://`.** A number cannot carry a
   certificate. Give them the name.
6. **There is no name to give.** The feature that hands out machine names can be switched off
   for a whole network, and then `tailscale status` shows numbers only. It is one toggle on
   their account's admin page on the vendor's website.
7. **Ronin itself is not running.** Check on the box before blaming the network.

**Say which of the two it is, every time.** *Your machine cannot be reached* and *Ronin is not
answering* have completely different fixes, and a person told only "it doesn't work" will go
looking in the wrong one. `bin/ronin-doctor` separates them.

## What never gets written down

Their address, their machine name, their network's name, whether the app is installed, whether
it is switched on. All of it is measured, every time, by the tools in the header. A written
answer about somebody's box is wrong the day the box changes and nobody notices.
