---
title: "Approval gates"
sidebar_position: 8
description: Require explicit user confirmation before a target executes — useful for deploys and other irreversible actions.
---

# Approval gates

An **approval gate** pauses a target until you explicitly approve or reject it.
Use it for targets that have irreversible effects — deploys, infrastructure
changes, database migrations — where an accidental run must be prevented.

## Declaring an approval gate

Add `approval = True` to any target:

```python title="BUILD"
target(
    name = "deploy",
    driver = "bash",
    approval = True,
    run = ["./deploy.sh"],
)
```

The map form lets you attach a **notice** — content shown to you before you
decide:

```python title="BUILD"
target(
    name = "deploy",
    driver = "bash",
    approval = {"required": True, "notice": ["plan"]},
    deps = {"plan": ["//infra:plan"]},
    run = ["./apply.sh"],
)
```

`notice` is a list of input group names. Before asking for your decision, heph
resolves each named group and displays the contents of its files. In the example
above the output of `//infra:plan` is shown so you can review what will change
before approving.

### `approval` field shape

| Value | Meaning |
|-------|---------|
| `True` | Gate is required; no notice. |
| `False` (default) | No gate. |
| `{"required": True, "notice": ["group", ...]}` | Gate is required; listed input groups are rendered as the notice. |
| `{"required": False, "notice": [...]}` | Notice only — content is shown but no approval is required. |

Unknown keys in the map form are an error, so typos fail loudly instead of
silently disabling the gate.

## Interactive prompt

When you run a gated target in a terminal, heph pauses and waits for your
decision:

- Press `y` to approve and continue execution.
- Press `n` to reject — the target fails immediately with a clear error.

In the full TUI the prompt appears inline on the progress view. In a plain
terminal session the notice prints to stderr and heph reads your answer from the
controlling terminal.

## Non-interactive runs

With no terminal attached, a gated target fails unless you pass `--auto-approve`:

```bash title="terminal"
heph run //infra:deploy --auto-approve
```

`--auto-approve` approves all gated targets in the run without prompting. The
notice still prints to stderr — the decision is automatic but the notice is
never suppressed.

:::warning
Running without a terminal and without `--auto-approve` fails with a clear
error asking you to pass the flag. This is intentional — a gated target must
never execute silently.
:::

## Cache interaction

A cache hit skips execution entirely — and with it, the approval gate. For
targets that must always prompt (a deploy, for example), disable caching:

```python title="BUILD"
target(
    name = "deploy",
    driver = "bash",
    approval = True,
    cache = False,
    run = ["./deploy.sh"],
)
```

With `cache = False` the target always runs, so the gate always fires.
