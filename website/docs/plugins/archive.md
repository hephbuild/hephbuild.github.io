---
title: "Archive"
sidebar_position: 12
description: Unpack an archive into a directory, or pack target outputs into a reproducible archive, without a shell.
---

# Archive

The archive plugin unpacks and packs `tar`, `tar.gz`, `tar.zst` and `zip`
archives. It also unpacks `tar.xz` and bare `gz` files (one gzipped file, not
a tar), which it does not write. Use it to unpack a downloaded tarball or to ship a release archive,
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

## Using an unpacked binary as a tool

A [tool](./exec.md#tool-files) is one file. An unpacked directory is a tool
only when it holds exactly one file; to put one binary from a larger archive on
a target's `PATH`, extract only that binary with `include`:

```python title="tool/BUILD"
target(
    name = "tool",
    driver = "archive.extract",
    src = ":dist",
    strip_components = 1,
    include = "bin/tool",          # the path after strip_components
    executable = True,             # in case the archive recorded no mode
)

target(name = "use", driver = "bash", run = ["tool --version"],
       tools = [":tool"])
```

To pick one file out of a target that is not an extract, use a
[`group`](./group.md):

```python title="tool/BUILD"
target(name = "tool", driver = "group", deps = [":unpacked"],
       include = ["tool/unpacked/bin/tool"])
```

A `group`'s `include` matches a dep's paths either workspace-relative,
`<package>/<out>/…` (here package `tool`, directory `unpacked`), or as the
dep's own `BUILD` file writes them (`unpacked/bin/tool`). Run
`heph inspect outputs //tool:unpacked` to list them.

A filter on the tool reference does the same without a group, and takes the
workspace-relative form only:

```python title="tool/BUILD"
tools = ["//tool:unpacked[tool/unpacked/bin/tool]"]
```

:::note
The one-file rule is checked when the consumer runs, not by `heph query` or
`heph validate`. An `include` that matches two files, or none, fails the
consumer with an error naming the tool and the files it found.
:::

## Extracting

| Field              | Default         | Description |
|--------------------|-----------------|-------------|
| `src`              | required        | The target whose output is the archive. It must produce exactly **one** file; pick it with `\|group` if the target has several. |
| `format`           | inferred        | `tar`, `tar.gz`, `tar.xz`, `tar.zst`, `zip` or `gz`. When omitted, taken from the file name's suffix, the longest match winning (`x.tar.gz` is a `tar.gz`, `x.gz` a `gz`; `.tgz`, `.txz` and `.tzst` work too), else from the file's leading bytes. |
| `strip_components` | `0`             | Leading path components dropped from every entry, like `tar --strip-components`. A leading `./` counts as one. Refused with a `gz`. |
| `include`          | every entry     | Glob patterns, a string or a list, matched against each entry's path after `strip_components` (`bin/tool`). Only matching files and links are extracted. See [Picking entries](#picking-entries). |
| `executable`       | `False`         | `True` marks every extracted regular file `0755`. A list of glob patterns (a string or a list) marks only the files that match. The execute bit is only ever added. |
| `out`              | the target name | Directory, relative to the package, the archive unpacks into. |
| `max_bytes`        | 4 GiB           | The most bytes the archive may decode to. In a tar, entries `include` or `strip_components` leave out are still decoded to reach the next one, and count. |
| `max_entries`      | 1,000,000       | The most entries the archive may hold. |
| `cache`            | `True`          | `False` disables caching; `{"remote": False}` keeps it local-only. |
| `resources`        | `{"cpu": 1}`    | See [Resources](/docs/concepts/resources). |

An entry with no more components than `strip_components` is skipped. If
nothing remains, the run fails and lists the archive's first entries.

### Picking entries

`include` extracts only the entries you name. Patterns use the same syntax as a
[`group`](./group.md)'s `include` (`*` within a path component, `**` across
them, `{a,b}`, `[…]`), and see each entry's path below `out`, after
`strip_components`, with `.` and empty components dropped:

```python title="BUILD"
target(
    name = "tool",
    driver = "archive.extract",
    src = ":tool_archive",              # tool-1.0/bin/tool, tool-1.0/README.md, …
    strip_components = 1,
    include = ["bin/tool", "lib/**"],   # not "tool-1.0/bin/tool"
    executable = ["bin/*"],
)
```

- Each pattern must match a file or link in the archive, and each `executable`
  pattern an extracted regular file. One that matches nothing fails the run
  and lists the paths it was matched against, which catches typos. A pattern
  that matches only a directory matches nothing.
- Directory entries are skipped; the parent directories an extracted entry
  needs are created.
- A hard link whose target `include` leaves out is an error, and so is a
  symlink pointing at something `include` left out (or that dangles in the
  archive). Include the target too.
- A pattern no path can match is refused when the target is parsed, with the
  fix: a leading `/` or `./`, a trailing `/` (write `"bin/**"` for a
  directory's files), or a `.`, `..` or empty component.

Patterns are case-sensitive (`bin/*` misses `Bin/tool`), `*` matches dotfiles
(`bin/*` takes `bin/.hidden`), `**/x` also matches a top-level `x`, and a class
is negated with `!` (`[!x]`), not `^`. Names are compared byte for byte: a zip
made on macOS may store an accented name decomposed, which a pattern typed
precomposed does not match; use a `*` there.

### A bare `gz`

Some projects ship a binary as one gzipped file, not a tar
(`rust-analyzer-x86_64-unknown-linux-gnu.gz`). A `gz` unpacks to one file in
`out`, named after the archive with the trailing `.gz` removed, as `gzip -d`
names it. gzip records no mode, so set `executable = True` for a binary:

```python title="BUILD"
target(
    name = "ra",
    driver = "archive.extract",
    src = ":ra_gz",                  # rust-analyzer-x86_64-unknown-linux-gnu.gz
    executable = True,
)
# ra/rust-analyzer-x86_64-unknown-linux-gnu, mode 0755
```

- `strip_components` is refused: there is nothing to strip.
- Concatenated gzip members are one file. Trailing garbage or zeros after the
  last member are an error, where `gzip -d` only warns.
- With `format` omitted, a `.gz` file whose contents are a tar is unpacked as a
  `tar.gz`.

### Safe unpacking

Every archive is treated as untrusted. Unpacking fails on:

- an absolute path or a `..` component, or an entry written through a symlink
  the archive created;
- a symlink pointing outside the output directory, or to an absolute path;
- a device or fifo entry, or a path that is not UTF-8;
- a path listed twice (a directory listed again is fine);
- more than `max_bytes` decoded or `max_entries` entries;
- a `tar.xz` whose decoder would need more than 256 MiB of memory (`xz -9`
  uses 64 MiB).

Hard links become copies. File modes are normalized: `0755` when any execute
bit is set, else `0644`; directories `0755`. Owners and timestamps are not
applied.

A `tar.xz`, a `gz` and a `zip` have their integrity checks verified. A
`tar.gz` or `tar.zst` is read only up to the tar's end marker, so its final
checksum is not verified: pin the archive's bytes with `sha256` where it is
fetched.

:::note
On macOS's default case-insensitive filesystem, two entries whose names differ
only by case (`A.txt`, `a.txt`) are one file, so the second fails with an error
naming the collision. On Linux both extract.
:::

## Creating

| Field          | Default            | Description |
|----------------|--------------------|-------------|
| `deps`         | required           | Targets whose outputs are packed, at least one. `\|group` and `[filters]` pick which files. |
| `format`       | from `out`         | `tar`, `tar.gz`, `tar.zst` or `zip`. Inferred from `out`'s suffix when omitted; one of the two must name it. A `format` that contradicts `out`'s suffix is refused, and so is `tar.xz` or `gz`: they are read only. |
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
| `tool target '…' must produce exactly 1 file, found N` | A tool is one file. Narrow it with a `group`'s `include` or a `[filter]`; see [Using an unpacked binary as a tool](#using-an-unpacked-binary-as-a-tool). |
| `must produce exactly one file` | `src` has several outputs; point it at one file, with `\|group` if needed. |
| `… not under strip_prefix …` | Use the suggested `strip_prefix`, narrow `deps`, or shorten `strip_prefix`. |
| `` `format` is "zip" but `out` "x.tar.gz" names a "tar.gz" `` | Drop `format`, or rename `out`. |
| `a dep staged that path` | `out` collides with a file a dep produced; rename `out`. |
| `` `include` pattern "…" matches no file or link in the archive `` | Match one of the listed paths. They are below `out` and after `strip_components`: write `bin/tool`, not `tool-1.0/bin/tool`. A pattern matching only a directory (`bin`) needs `bin/*`. |
| `` `executable` pattern "…" matches no extracted regular file `` | The pattern names a typo, a directory, a symlink, or a file `include` left out. |
| `hard link target "…" is not included` | Add the linked file's path to `include`. |
| `` symlink "…": points at "…", which `include` left out `` | Add the symlink's target to `include`. |
| `"bin/" matches no file; to take a directory's files write "bin/**"` | Write what the error suggests. |
| `` `strip_components` with `format = "gz"` `` | A bare `gz` is one file; drop `strip_components`. |
| `the xz stream's dictionary needs more decoder memory than the 256 MiB cap` | Recompress the archive with a smaller dictionary (`xz -9` uses 64 MiB). |
| `archive.create cannot write a "tar.xz"` (or `"gz"`) | Pick a written format, or rename `out`. |
