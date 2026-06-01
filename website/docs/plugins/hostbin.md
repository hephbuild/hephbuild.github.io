---
title: "Hostbin"
sidebar_position: 7
description: Wraps host system binaries as heph targets via generated wrapper scripts.
---

# Hostbin

Hostbin wraps host system binaries as heph targets. The plugin discovers
binaries on the system `PATH` and generates executable wrapper scripts that can
be used as build dependencies — letting targets depend on tools already
installed on the machine.

## Driver

A **driver** is the component that knows how to execute a target's action; it
turns a resolved target into runnable work. Hostbin registers the `hostbin`
driver.

## Enabling it

Built-in and always-on. The provider and driver are registered automatically.
No configuration in `.hephconfig` is required.

## Usage

Targets in the `@heph/bin` package are generated on-demand. For example, to
reference the system `sh` binary:

```python
//@heph/bin:sh
```
