---
title: "Diagnosing stalls and hangs"
sidebar_position: 7
description: Read the stall notice heph prints when a run stops making progress, and pull thread dumps from a frozen process.
---

# Diagnosing stalls and hangs

When a run stops making progress, heph notices on its own and says so on
stderr — no flag, no setup. If that paragraph isn't enough, a thread dump is
one signal away.

## The stall notice

heph watches its own event stream. If nothing advances — no target starts or
finishes, no cache read completes, no bytes move — for a configurable
duration while work is still outstanding, it prints one paragraph naming what
is open, for how long, and whether anything is moving:

```text
heph: no progress for 512s
  open ops     98 remote-cache-read (oldest 512s)
  bytes        0 B in the last 60s on remote-cache-read
  progress     4102 done, 0 unsuccessful

  Nothing has been read on remote-cache-read in the last 60s, so this looks like a
  stuck remote-cache-read rather than slow work.
  (diagnostic text, not a stable interface)
```

- **open ops** — how many operations of each kind are in flight, and how long
  the oldest one has been open.
- **bytes** — how much data moved on that subsystem in the last 60 seconds.
  `0 B` next to open reads is what separates a stalled transfer from a slow
  one.
- **progress** — targets done and unsuccessful so far.
- A closing line names a likely cause only when one subsystem clearly
  dominates the open work *and* nothing has moved on it. Otherwise heph shows
  the table and leaves the conclusion to you.

The notice re-prints only if the stall continues, not on every tick, so a
long stall doesn't flood your log. A single slow subprocess doesn't trigger
it either — heph can't see inside a running command, so a handful of open
`execute` spans are given much more slack before being reported.

The paragraph is diagnostic text, not a stable interface — don't parse it in
scripts or CI checks.

### Controlling it

```bash title="terminal"
heph run //... --stall-notice=5m   # widen the threshold
heph run //... --stall-notice=off  # disable it
```

Default threshold is 60 seconds. See the [CLI reference](/docs/reference/cli)
for full flag detail.

## Getting a thread dump

If the paragraph isn't enough, heph can dump every thread's backtrace to a
file. The handler is always installed — no flag required. Send the process
`SIGQUIT` — `Ctrl-\` at a terminal, or:

```bash title="terminal"
kill -QUIT <pid>
```

The dump lands at `.heph3/diag/dump-<pid>.txt`. heph keeps running afterward;
`SIGQUIT` doesn't terminate the process here the way it normally would.
