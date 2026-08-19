#!/usr/bin/env python3
"""Set the two Claude Code settings two Ronin features do not work without.

    python3 hostside/claude-settings.py            # set them, report what it did
    python3 hostside/claude-settings.py --check    # report only, exit 1 if unset

RONIN IS NOT A SETTINGS MANAGER AND THIS IS NOT THE START OF ONE. It writes exactly two
keys, and only because a Ronin feature is dark without each:

  statusLine  Ronin scrapes "⛽ ctx NN% · <model>" out of ordinary pane text (src/ctx.ts).
              Claude Code prints that line only if a statusLine command is set. The script
              lives in this repo (hostside/statusline-ronin.sh); settings only names it.
  theme       Ronin's light/dark shell reaches INSIDE the pane only if the agent asks the
              terminal for colours instead of painting its own. Claude Code's plain
              "dark"/"light" hardcode RGB and fill their own backgrounds — on a light pane
              that is a black bar with the owner's own words in it, which is the bug that
              produced this file. The -ansi themes name ANSI slots; Ronin owns the slots.

WHY dark-ansi, EVEN FOR SOMEONE WHO LIVES IN LIGHT MODE. light-ansi's body text is
ansi:black — 1.17:1 on Ronin's dark shell, i.e. invisible the first time they flip.
dark-ansi is whiteBright, and Ronin's light palette maps whiteBright to DARK ink (that
inversion is deliberate, see style.css), so it clears 16:1 in BOTH shells. One value, no
second setting to keep in sync with the browser, and nothing to write when the shell flips.

WHY THIS IS A FILE AND NOT A HEREDOC IN setup.sh, where it started: the common case is not
a fresh box. It is someone who ran setup.sh, then installed Claude Code afterwards — and
their settings.json is written by Claude, with "theme": "dark", long after the installer
stopped existing. A step that only runs at install time misses exactly those people, which
is the gap the owner named ("I just don't have a step in the walkthrough"). bin/ronin-doctor
calls this with --check, so the box says so out loud rather than waiting to be asked.

The contract, unchanged from the setup.sh original: merge into whatever is there, preserve
every key it never heard of, never clobber a value the user chose for themselves, write
atomically, and never fail its caller.
"""
import json
import os
import sys
import tempfile

WANT_THEME = "dark-ansi"
# Claude Code's own two hardcoded defaults. Finding one of these is not a decision ABOUT
# RONIN, so Ronin replaces it with the -ansi sibling and says so. Anything else IS a
# decision — the daltonized variants above all, which are an accessibility choice no
# installer gets to overrule.
REPLACEABLE = ("dark", "light")

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SCRIPT = os.path.join(HERE, "statusline-ronin.sh")
DEFAULT_SETTINGS = os.path.expanduser("~/.claude/settings.json")


def say(msg):
    print("    " + msg)


def load(settings):
    """(data, raw) — or (None, raw) when the file exists but must not be touched."""
    raw = None
    if os.path.exists(settings):
        try:
            with open(settings, encoding="utf-8") as fh:
                raw = fh.read()
        except OSError as err:
            say("could not read %s (%s) — left untouched." % (settings, err))
            return None, raw
    if raw is None or not raw.strip():
        return {}, raw
    try:
        data = json.loads(raw)
    except ValueError as err:
        say("%s is not valid JSON (%s) — left untouched." % (settings, err))
        return None, raw
    if not isinstance(data, dict):
        say("%s is not a JSON object — left untouched." % settings)
        return None, raw
    return data, raw


def write(data, raw, settings, changed):
    directory = os.path.dirname(settings) or "."
    tmp = None
    try:
        os.makedirs(directory, exist_ok=True)
        mode = os.stat(settings).st_mode & 0o777 if os.path.exists(settings) else 0o644
        fd, tmp = tempfile.mkstemp(dir=directory, prefix=".settings.json.ronin.")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        os.chmod(tmp, mode)
        os.replace(tmp, settings)
        tmp = None
    except OSError as err:
        say("could not write %s (%s) — nothing changed." % (settings, err))
        return False
    finally:
        if tmp and os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass
    for line in changed:
        say(line)
    if raw is not None and raw.strip():
        say("in %s — %d other setting(s) preserved" % (settings, len(data) - len(changed)))
    else:
        say("created %s" % settings)
    return True


def main(argv):
    check = "--check" in argv
    rest = [a for a in argv if not a.startswith("--")]
    script = rest[0] if rest else DEFAULT_SCRIPT
    settings = rest[1] if len(rest) > 1 else DEFAULT_SETTINGS

    data, raw = load(settings)
    if data is None:
        return 1 if check else 0

    # NEITHER KEY MAY ABORT THE OTHER. Each decides for itself; the file is written once at
    # the end. The first cut of this exited the moment it found a statusLine of the user's
    # own, which silently skipped the theme for precisely the people who had configured
    # Claude Code most carefully.
    changed, unmet = [], []

    current = data.get("statusLine")
    if current is None:
        data["statusLine"] = {"type": "command", "command": script}
        changed.append("statusLine -> %s" % script)
        unmet.append("statusLine is not set — the ⛽ context gauge stays dark")
    else:
        cmd = current.get("command") if isinstance(current, dict) else current
        mine = isinstance(cmd, str) and os.path.realpath(
            os.path.expanduser(cmd.strip())
        ) == os.path.realpath(script)
        if mine:
            if not check:
                say("statusLine: already registered -> %s" % script)
        else:
            say("statusLine: LEFT ALONE — %s already sets one of your own:" % settings)
            say("  " + json.dumps(current))
            say("  For the ⛽ gauge, point it at: %s" % script)

    theme = data.get("theme")
    if theme is None or theme in REPLACEABLE:
        data["theme"] = WANT_THEME
        was = "unset" if theme is None else '"%s"' % theme
        changed.append('theme %s -> "%s"' % (was, WANT_THEME))
        unmet.append(
            'theme is %s — Claude paints its own colours, so Ronin\'s light/dark stops at '
            "the edge of the pane" % was
        )
    elif theme == WANT_THEME:
        if not check:
            say('theme: already "%s"' % WANT_THEME)
    elif theme == "light-ansi":
        say('theme: LEFT ALONE at "light-ansi" — it is yours, and it does follow Ronin\'s palette.')
        say("  Heads up: its body text is ANSI black, unreadable on Ronin's DARK shell.")
        say('  "%s" reads correctly in both. Switch with /theme in any session.' % WANT_THEME)
    else:
        say('theme: LEFT ALONE at "%s" — that is your choice, not a default.' % theme)
        say('  Ronin\'s light/dark reaches inside the pane only with an -ansi theme.')

    if check:
        for line in unmet:
            say(line)
        return 1 if unmet else 0

    if not changed:
        return 0
    if not write(data, raw, settings, changed):
        return 0
    say("The theme applies to sessions started from now on; /theme changes a running one.")

    # Either key in settings.local.json would win over what was just written.
    local = os.path.join(os.path.dirname(settings) or ".", "settings.local.json")
    try:
        with open(local, encoding="utf-8") as fh:
            other = json.load(fh)
    except Exception:
        other = None
    if isinstance(other, dict):
        for key in ("statusLine", "theme"):
            if other.get(key) is not None:
                say("NOTE: %s also sets %s and takes precedence — remove it or match it here." % (local, key))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
