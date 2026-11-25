---
title: "Copying from the dashboard"
sidebar_position: 9
description: Select text in heph's full-screen views with the mouse and copy it to your clipboard.
---

# Copying from the dashboard

heph's full-screen views — the dashboard (`Tab` from the status line opens it),
a target's screen and the approval view — use the mouse for their own clicks
and scrolling, which turns off your terminal's usual text selection. heph puts
it back: drag to select, release to copy.

## Selecting text

1. Press the left button where the selection starts. The screen freezes so
   what you select doesn't move under you.
2. Drag. The selection runs from the press to the pointer in reading order,
   the way a terminal selects.
3. Release. The selected text goes to your clipboard, and the bottom row
   confirms how many characters were copied.

Press any key while the button is down to cancel without copying. A click that
doesn't drag is still a click — a little pointer jitter doesn't turn it into a
selection or overwrite your clipboard.

## Selecting in a scrolling pane

A drag that starts in a scrolling pane, such as a target's log or an approval
notice, selects in the pane's whole text, not just the rows on screen:

- Scroll the wheel while holding the button, or hold the pointer past the
  pane's top or bottom edge, to scroll it. The further past the edge, the
  faster it scrolls.
- Rows that scroll out of view stay selected and are copied.
- Line numbers and indentation are left out of the copy.
- A line wrapped across several rows is copied as one line, and a row cut off
  at the screen's edge is copied whole when the selection reaches that edge.

The pane stays where the drag scrolled it.

## When nothing reaches the clipboard

heph copies through your terminal (an OSC 52 escape sequence), so the terminal
decides whether to accept it. Some terminals have it off, and tmux drops it
unless `set-clipboard` is enabled. heph can't tell whether the copy landed.

A single copy is capped at 64 KiB of text; past that, only the beginning is
copied and the confirmation says so.

If your terminal won't take the copy, turn off heph's mouse handling to get
the terminal's own selection back:

```bash title="terminal"
HEPH_NO_MOUSE=1 heph run //...
```

Any value other than empty or `0` disables it. Clicking and wheel-scrolling in
the dashboard are turned off with it.
