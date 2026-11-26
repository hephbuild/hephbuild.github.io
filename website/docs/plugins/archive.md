---
title: "Archive"
sidebar_position: 12
description: Unpack an archive into a directory, or pack target outputs into a reproducible archive, without a shell.
---

# Archive

The archive plugin unpacks and packs `tar`, `tar.gz`, `tar.zst` and `zip`
archives. Use it to unpack a downloaded tarball or to ship a release archive,
instead of calling `tar` or `unzip` in a shell command. It works the same on
Linux and macOS and needs no tool on the host.

## Driver

A **driver** is the component that knows how to execute a target of a given
kind. This plugin registers two:

| Driver            | Does                                                      |
|-------------------|-----------------------------------------------------------|
| `archive.extract` | Unpacks the one archive file a target produced into a directory. |
| `archive.create`  | Packs the outputs of `deps` into one archive file.        |

## Enabling it

Built-in; automatically registered and always available. `archive` is a
reserved plugin name: a `plugins:` entry named `archive` fails at startup.

## Usage

```python title="tool/BUILD"
# :bin and :docs output out/bin/tool and out/share/doc/README
target(
    name = "dist",
    driver = "archive.create",
    deps = [":bin", ":docs"],
    strip_prefix = "tool/out",     # tool/out/bin/tool → bin/tool
    prefix = "tool-1.0",           #                   → tool-1.0/bin/tool
    out = "tool-1.0.tar.gz",       # format inferred from the suffix
)

target(
    name = "unpacked",
    driver = "archive.extract",
    src = ":dist",                 # format inferred: tool-1.0.tar.gz
    strip_components = 1,          # tool-1.0/bin/tool → bin/tool
)
```

`strip_prefix` + `prefix` on `create` and `strip_components` on `extract` undo
each other: this example round-trips to `unpacked/bin/tool`.

Pair `archive.extract` with an [`http_fetch`](./http-fetch.md) target to
unpack a downloaded tarball:

```python title="BUILD"
target(
    name = "tool_archive",
    driver = "http_fetch",
    url = "https://example.com/tool-1.0-linux-amd64.tar.gz",
    sha256 = "…",
)

target(
    name = "tool",
    driver = "archive.extract",
    src = ":tool_archive",
    strip_components = 1,
)
```

## Extracting

| Field              | Default         | Description |
|--------------------|-----------------|-------------|
| `src`              | required        | The target whose output is the archive. It must produce exactly **one** file; pick it with `\|group` if the target has several. |
| `format`           | inferred        | `tar`, `tar.gz`, `tar.zst` or `zip`. When omitted, taken from the file name's suffix (`.tgz` and `.tzst` work too), else from the file's leading bytes. |
| `strip_components` | `0`             | Leading path components dropped from every entry, like `tar --strip-components`. A leading `./` counts as one. |
| `out`              | the target name | Directory, relative to the package, the archive unpacks into. |
| `max_bytes`        | 4 GiB           | The most bytes the archive may unpack to. |
| `max_entries`      | 1,000,000       | The most entries the archive may hold. |
| `cache`            | `True`          | `False` disables caching; `{"remote": False}` keeps it local-only. |
| `resources`        | `{"cpu": 1}`    | See [Resources](/docs/concepts/resources). |

An entry with no more components than `strip_components` is skipped. If
nothing remains, the run fails and lists the archive's first entries.

### Safe unpacking

Every archive is treated as untrusted. Unpacking fails on:

- an absolute path or a `..` component, or an entry written through a symlink
  the archive created;
- a symlink pointing outside the output directory, or to an absolute path;
- a device or fifo entry, or a path that is not UTF-8;
- a path listed twice (a directory listed again is fine);
- more than `max_bytes` written or `max_entries` entries.

Hard links become copies. File modes are normalized: `0755` when any execute
bit is set, else `0644`; directories `0755`. Owners and timestamps are not
applied.

:::note
On macOS's default case-insensitive filesystem, two entries whose names differ
only by case (`A.txt`, `a.txt`) are one file, so the second fails with an error
naming the collision. On Linux both extract.
:::

## Creating

| Field          | Default            | Description |
|----------------|--------------------|-------------|
| `deps`         | required           | Targets whose outputs are packed, at least one. `\|group` and `[filters]` pick which files. |
| `format`       | from `out`         | `tar`, `tar.gz`, `tar.zst` or `zip`. Inferred from `out`'s suffix when omitted; one of the two must name it. A `format` that contradicts `out`'s suffix is refused. |
| `out`          | `<name>.<format>`  | Archive file, relative to the package. It must not collide with a file a dep produced. |
| `strip_prefix` | none               | Leading directory removed from every entry, written workspace-relative (`pkg/out`). |
| `prefix`       | none               | Leading directory added to every entry, after `strip_prefix`. |
| `cache`        | `True`             | `False` disables caching; `{"remote": False}` keeps it local-only. |
| `resources`    | `{"cpu": 1}`       | See [Resources](/docs/concepts/resources). |

### Where a file lands

An entry's name is the file's **workspace-relative path**, as its target
declared it, with `strip_prefix` removed and then `prefix` added:

| File               | `strip_prefix` | `prefix`   | Entry               |
|--------------------|----------------|------------|---------------------|
| `tool/out/bin/tool`|                |            | `tool/out/bin/tool` |
| `tool/out/bin/tool`| `tool/out`     |            | `bin/tool`          |
| `tool/out/bin/tool`| `tool/out`     | `tool-1.0` | `tool-1.0/bin/tool` |

- `strip_prefix` matches whole path components: `tool/outer/x` is not under
  `tool/out`.
- A packed file **not under `strip_prefix` is an error**. The error suggests
  the deepest directory all files share. Narrow `deps` with `|group` or
  `[filters]`, or shorten `strip_prefix`.
- A file two deps both produce is packed once. Two different files landing on
  the same entry name are an error.
- Only files and symlinks are packed; empty directories are not. Symlinks are
  stored as symlinks, never followed.
- Path options are relative and `/`-separated, with no empty, `.` or `..`
  component.

### Reproducible archives

The same deps give the same bytes on every machine, at any time, for any user:

- entries are sorted by name;
- owners are cleared and modes normalized (`0755` with any execute bit, else
  `0644`; symlinks `0777`);
- every tar entry's timestamp is 0; a zip entry's is 1980-01-01, the earliest
  zip can record;
- compression settings are fixed, and the gzip header carries no name or
  timestamp.

Nothing is read from the environment, `SOURCE_DATE_EPOCH` included. The
builtin [`tar`](/docs/concepts/builtin-tools) produces the same bytes as
`archive.create` given the same timestamp.

:::note
On macOS's default case-insensitive filesystem, two deps producing names that
differ only by case collapse into one file, so the archive holds one entry
there and two on Linux.
:::

## Caching

Both drivers cache by default. A target rebuilds when its options change or
when any output of its deps changes content or path.

:::warning
A dep picked with `|group` contributes **all** of its outputs to the cache key,
not only that group's, and the group's name is not part of the key. Changing
another group reruns the target needlessly. A dep that swaps which files belong
to two groups keeps the same key, so clean and rebuild its consumers after such
a change.
:::

## Troubleshooting

| Error | Fix |
|-------|-----|
| `nothing to extract: strip_components = N removed every entry` | Count the leading directories of the listed entries and lower `strip_components`. |
| `raise max_bytes` / `raise max_entries` | The archive is larger than the default bounds; set the option if that is expected. |
| `set format` | The archive's name has no known suffix and its bytes match no format; set `format`. |
| `must produce exactly one file` | `src` has several outputs; point it at one file, with `\|group` if needed. |
| `… not under strip_prefix …` | Use the suggested `strip_prefix`, narrow `deps`, or shorten `strip_prefix`. |
| `` `format` is "zip" but `out` "x.tar.gz" names a "tar.gz" `` | Drop `format`, or rename `out`. |
| `a dep staged that path` | `out` collides with a file a dep produced; rename `out`. |
