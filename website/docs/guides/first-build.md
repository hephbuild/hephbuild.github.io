---
title: "Your first build"
sidebar_position: 1
description: Go from an empty repo to a cached build wiring a dependency and a tool.
---

# Your first build

This walkthrough takes you from nothing to a working, cached build with two
targets — one that produces an output, and one that consumes it.

## 1. Mark the workspace

Drop a [`.hephconfig`](/docs/reference/configuration) at the repo root. It pins
the toolchain and registers the plugins this build uses:

```yaml title=".hephconfig"
version: <HEPH_VERSION>
providers:
  - name: buildfile
drivers:
  - name: bash
```

## 2. Write a BUILD file

Create a `BUILD` file. The first target writes a greeting to its output; the
second depends on it and wraps it.

```python title="hello/BUILD"
greeting = target(
    name = "greeting",
    driver = "bash",
    run = "echo 'hello world' > $OUT",
    out = "greeting.txt",
)

target(
    name = "shout",
    driver = "bash",
    deps = {"msg": greeting},
    run = "tr a-z A-Z < $SRC_MSG > $OUT",
    out = "shout.txt",
)
```

`greeting` returns its [address](/docs/reference/addresses), which `shout` lists
as a dependency. heph surfaces that dependency to the command as `$SRC_MSG` —
the group name `msg` becomes the variable suffix.

## 3. Run it

```bash title="terminal"
$ heph run //hello:shout
0.31s · 2 / 2 done · 0 cached · 0 failed
```

heph builds `greeting` first (the edge forces the order), then `shout`. Inspect
the output:

```bash title="terminal"
$ heph run //hello:shout --cat-out
HELLO WORLD
```

## 4. See the cache work

Run it again without changing anything:

```bash title="terminal"
$ heph run //hello:shout
0.02s · 2 / 2 done · 2 cached · 0 failed
```

Both targets are [cache hits](/docs/concepts/caching) — identical inputs, so
heph returns the stored outputs instead of re-running. Change the `run` script
of `greeting` and only the targets whose inputs changed rebuild.

## Next

- Add a [tool](/docs/plugins/exec#dependencies) the build runs with.
- Split outputs into [groups](/docs/plugins/exec#output-groups).
- Wire codegen checks and caching into [CI](./ci.md).
