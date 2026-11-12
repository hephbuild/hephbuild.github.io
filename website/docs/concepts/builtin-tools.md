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
| Files | `cat` `chmod` `cp` `du` `install` `ln` `ls` `mkdir` `mktemp` `mv` `pwd` `readlink` `realpath` `rm` `rmdir` `stat` `tee` `touch` `truncate` `unlink` |
| Text | `comm` `cut` `grep` `head` `od` `sed` `sort` `tail` `tr` `uniq` `wc` |
| Search | `find` `which` `xargs` |
| Archives | `tar` `gzip` `gunzip` `zstd` |
| Checksums & encoding | `b2sum` `base64` `cksum` `md5sum` `sha1sum` `sha256sum` `sha512sum` |
| Identity | `groups` `id` `whoami` |
| Shell helpers | `basename` `date` `dirname` `echo` `env` `false` `nproc` `printenv` `printf` `seq` `sleep` `test` `timeout` `tmpl` `true` `yes` |

Utilities that differ between GNU and BSD ship so recipes behave the same everywhere. The basics (`ls`, `pwd`, `test`, `which`, `printenv`, …) ship because the host's directories are not on a target's `PATH`: without them, a recipe or a `--shell` session could not even list what it was given.

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
| `which` | Follows BSD `which`: `-a` prints every match, `-s` sets the exit status only, options go before the first name, a name containing `/` is checked as given. Exits 1 unless every name is found. A match through a relative `PATH` entry is printed as an absolute path. |
| `du` | Counts 1K blocks on both Linux and macOS. |

`sed` supports `s` (flags `g`, `p`, `i`, a number), `y`, `d`, `p`, `q`, `=`, `a`, `i`, `c`; line, `$`, `/re/` and range addresses with `!`; and `-n`, `-e`, `-f`, `-E`/`-r`. Both `a text` and `a\` followed by a newline are accepted.

`grep` supports `-E -F -i -v -n -c -l -L -q -w -x -r -h -H -s`, `-m`, `-e` and `-f`.

`which` searches the target's `PATH`, builtins included, not the machine's. Shell builtins take precedence over `PATH`: in a `bash` target, `which printf` names heph's builtin while bash runs its own `printf`. Use `type -a printf` to see what a recipe will actually run.

## Values that describe the machine

`id`, `whoami`, `groups`, `du`, `ls -l`, `pwd` and `which` report facts about the machine running the target: the user, sizes, owners, mtimes, the sandbox path. Those values are not part of the cache key.

Using them at run time is fine:

```bash
docker run --user "$(id -u):$(id -g)" …
```

Writing them into an output is not: `docker build --build-arg UID=$(id -u)` built on a macOS laptop (uid 501) is served from cache to a Linux machine (uid 1000). When the value belongs in the output, pass it in through the target's `env` or `pass_env` so it is hashed, or mark the target `cache = False`.

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
