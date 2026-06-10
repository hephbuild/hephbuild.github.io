---
title: "Environment Variables"
sidebar_position: 4
description: Environment variables that control heph's behavior.
---

# Environment Variables

These environment variables alter heph's behavior at runtime. They are
read on startup and do not require changes to `.hephconfig`.

## Output

| Variable | Description |
|----------|-------------|
| `NO_COLOR` | Set to any non-empty value to disable ANSI color in all output. Follows the [no-color.org](https://no-color.org) convention. Useful when capturing logs in scripts or CI pipelines. |

:::note
Color is also disabled automatically when stderr is not a terminal (e.g. when
piped or redirected to a file), so `NO_COLOR` is only needed to suppress color
when running interactively.
:::
