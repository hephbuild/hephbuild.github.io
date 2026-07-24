---
title: "The interactive build view"
sidebar_position: 3
description: Read and navigate the live progress box heph shows while a build runs in a terminal.
---

# The interactive build view

When heph runs in a terminal, it prints a live progress box above your output
and keeps it pinned while the build runs:

```text
╭─ heph · N built · N cached · N running · N failed ──── <workers> ─╮
  <slow targets + lock waits, scrollable>
╰─── <label> ───────────────────────────────────────────────────────╯
  ↑/↓ scroll · ←/→ pan · tab/⇧tab switch view · a all
```

In CI, or anywhere `stdin`/`stdout` isn't a terminal, heph falls back to
plain log output automatically. Force that fallback with `--no-tui` — see
[Using heph in CI](./ci.md).

## The header counts

The header's `X / Y done · C cached · F failed` segment is a live summary:

- **`X / Y done`** — `X` targets finished out of `Y`. `Y` is prefixed with `~`
  while heph is still matching targets, since the total isn't final yet.
- **`C cached`** — targets that hit cache instead of executing, including
  [remote cache](./remote-cache.md) pulls.
- **`F failed`** — targets that errored.

Press `a` to toggle what the counts cover: the **matched** set (the top-level
targets you asked to build) or **all** targets touched, including transitive
dependencies.

## Switching views

`X`, `Y`, `C cached`, and `F failed` are each a tab into a scrollable list of
the matching targets. Cycle through them with `Tab` / `Shift+Tab`:

| Tab | Lists |
|-----|-------|
| `X` (done) | Targets that have finished. |
| `Y` (matched) | Every matched top-level target, finished or still running. |
| Cached | Targets that hit cache (local or remote). |
| Failed | Targets that errored. |

`Tab` cycles forward from the live view through each list in that order and
back; `Shift+Tab` cycles backward.

## Navigating a list view

- `↑`/`↓` scrolls the list; `←`/`→` pans long lines horizontally.
- `/` opens a filter — type to narrow the list to matching addresses, `Enter`
  confirms, `Esc` clears it.
- `Esc` or `q` returns to the live view. From the live view, `Ctrl-C` quits
  (and cancels the run).

If the build finishes while you're reading a list view, heph holds the box
open instead of closing it out from under you — press `Esc`/`q` to go back to
the live view, then `q` again (or `Ctrl-C`) to close it.
