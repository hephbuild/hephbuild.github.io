---
title: "Consuming build outputs"
sidebar_position: 2
description: List, print, or copy a target's artifacts after running it.
---

# Consuming build outputs

After `heph run` resolves a target, its artifacts live in the cache. A few
flags let you surface those artifacts into your local workflow.

## List output paths

Print each output file path to stdout, one per line:

```bash title="terminal"
heph run //app:bundle --list-out
```

## Print output contents

Stream the contents of every output artifact to stdout:

```bash title="terminal"
heph run //app:bundle --cat-out
```

`--cat-out` and `--list-out` are mutually exclusive.

## Copy outputs to a directory

Copy all output artifacts into a local directory, creating it if it does not
exist:

```bash title="terminal"
heph run //app:bundle --copy-out dist/
```

Relative paths resolve against the current directory; absolute paths are used
as-is. The copied tree mirrors the workspace-relative artifact paths — the
same layout `--list-out` prints.

## Selecting specific output groups

When a target declares multiple named [output groups](/docs/plugins/exec#output-groups),
use `--output` to restrict any of the above flags to one or more groups:

```python title="BUILD"
target(
    name = "compile",
    driver = "bash",
    run = "go build -o $OUT_BIN .; go doc . > $OUT_DOC",
    out = {"bin": "app", "doc": "app.txt"},
)
```

```bash title="terminal"
heph run //app:compile --output bin --copy-out dist/
heph run //app:compile --output bin --output doc --list-out
```

`--output` is repeatable. When omitted, all groups are included. Requesting a
name the target does not declare is an error.
