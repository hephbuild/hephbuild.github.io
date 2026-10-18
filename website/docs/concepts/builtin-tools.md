---
title: "Builtin tools"
sidebar_position: 12
description: The POSIX utilities heph ships in its own binary, so a recipe behaves the same on Linux and macOS.
---

# Builtin tools

heph ships a set of POSIX utilities (`cp`, `sed`, `grep`, `tar`, …) inside its own binary and puts them on the `PATH` of every `exec` and `bash` target. A recipe that runs `install -D` or `sed -i` behaves the same on Linux and macOS.

Without them, a recipe runs whatever the host provides: GNU tools on Linux, BSD tools on macOS. `install -D` does not exist on BSD, `sed -i 's/a/b/' f` eats the next argument as a filename, and `sort` orders by the host's locale.

## What's included

| Group | Utilities |
|-------|-----------|
| Files | `cat` `chmod` `cp` `install` `ln` `mkdir` `mktemp` `mv` `readlink` `realpath` `rm` `rmdir` `stat` `tee` `touch` |
| Text | `comm` `cut` `grep` `head` `sed` `sort` `tail` `tr` `uniq` `wc` |
| Search | `find` `xargs` |
| Archives | `tar` `gzip` `gunzip` `zstd` |
| Checksums & encoding | `base64` `md5sum` `sha1sum` `sha256sum` `sha512sum` |
| Shell helpers | `basename` `date` `dirname` `echo` `env` `false` `nproc` `printf` `seq` `sleep` `timeout` `tmpl` `true` |

List them with:

```bash
heph tool coreutils list           # add --json for machine-readable output
heph tool coreutils which cp       # does heph ship cp, and what would the host supply?
heph tool coreutils run cp -r a b  # run one directly to check what a flag does
```

## Enabling and disabling

On by default; there is nothing to configure. To use the host's tools instead, set `coreutils: false` on the driver:

```yaml title=".hephconfig"
plugins:
  - builtin: exec
    options:
      coreutils: false
  - builtin: bash
    options:
      coreutils: false
```

:::warning
Turning the toolbox on or off changes the cache key of every `exec` and `bash` target. A heph release that changes a builtin's behavior does too, so expect those targets to rebuild after such an upgrade.
:::

## What a target's `PATH` contains

A target sees its own tools, what it declared, and the builtins. The host's directories are **not** on `PATH`: a recipe that calls an undeclared host binary fails with `command not found` instead of working only on machines that happen to have it. Declare the tool, or add directories back with the driver's `path` option.

## Where the builtins differ from GNU

| Utility | Behavior |
|---------|----------|
| `sed` | `-i[SUFFIX]` takes GNU's attached-suffix form. BSD's `sed -i '' …` is refused with an explanation. Basic regular expressions work, including `\(…\)` groups and `\1` in the replacement. Backreferences in the *pattern* and lookaround are rejected with an error naming the construct. Command groups (`{ … }`) are not supported. |
| `grep` | No `-P`. Never colorized, whatever the terminal. |
| `tar` | Modes `-c`, `-x`, `-t` with `-z`, `-f`, `-C`, `-v`. Output is reproducible by default (see below). |
| `find`, `xargs` | Arguments must be valid UTF-8; others are refused. |

`sed` supports `s` (flags `g`, `p`, `i`, a number), `y`, `d`, `p`, `q`, `=`, `a`, `i`, `c`; line, `$`, `/re/` and range addresses with `!`; and `-n`, `-e`, `-f`, `-E`/`-r`. Both `a text` and `a\` followed by a newline are accepted.

`grep` supports `-E -F -i -v -n -c -l -L -q -w -x -r -h -H -s`, `-m`, `-e` and `-f`.

## Reproducible archives

`tar`, `gzip` and `zstd` produce the same bytes for the same input on every machine, with no flags to remember:

- entries are sorted by path;
- owner is uid/gid 0 with empty names;
- modes are normalized to the executable bit;
- mtime is `SOURCE_DATE_EPOCH` when set, otherwise 0;
- `gzip` writes no file name or timestamp in its header.

There is no option to turn this off. Extraction detects gzip and zstd from the file contents, not its name.

```python title="BUILD"
target(
    name = "greeting",
    driver = "bash",
    deps = {"src": "//app:template.txt"},
    run = "sed 's/NAME/world/' $SRC > $OUT",
    out = "greeting.txt",
)
```
