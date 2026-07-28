---
title: "Group"
sidebar_position: 6
description: Bundle multiple targets as transparent, pass-through dependencies.
---

# Group

Groups multiple targets as transparent, pass-through dependencies.
This makes a group a convenient handle for referring to a set of 
targets as one address, while staying invisible to the build graph at run time.

## Driver

A driver is the engine that interprets a target and knows how to execute it.
This plugin registers the `group` driver.

## Enabling it

Built-in; always registered by the heph engine. No configuration or plugin
registration needed — the `group` driver is automatically available to all
builds.

## Usage

```python title="BUILD"
target(
    name = "g",
    driver = "group",
    deps = ["t1", "t2"],
)
```

## Members are dependencies

A group's members are dependencies of whatever depends on the group. They
run like any other dependency and never receive the interactive terminal,
even when the group itself is run from an interactive terminal.

A group with **exactly one** member is just an alias: running or shelling
into the group behaves exactly like running or shelling into that member —
including through nested groups, where a group of one group of one target
still forwards through to the target at the bottom.

A group with **two or more** members is not a single target, so
[`--shell`](/docs/plugins/exec#interactive-debugging-with---shell) on it is
rejected with an error naming the members and the target to shell into
instead:

```bash title="terminal"
$ heph run //pkg:g --shell
--shell needs exactly one target; //pkg:g is a group with 2 members
  members: //pkg:t1, //pkg:t2
  try: heph run --shell //pkg:t1
```

Plain `heph run //pkg:g` (without `--shell`) still runs every member.
