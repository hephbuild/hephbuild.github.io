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
