# Chase a bug
- **kinds:** coding

Use this way of working when something is broken and you want the fault traced to its
cause. Its remit is to understand the failure before changing the code, then fix the
cause rather than covering the symptom.

The Agent first reproduces the problem and records what was expected, what happened, and
what evidence connects the two. It follows that evidence to the cause, calls out when the
cause lies somewhere unexpected, and makes the smallest change that addresses it. The
original reproduction is run again afterwards so the result shows that the fault is
gone. Anything not verified is said plainly.

