---
title: "Formatting BUILD files"
sidebar_position: 4
description: Use heph tool build-fmt to keep BUILD files consistently formatted across the workspace.
---

# Formatting BUILD files

`heph tool build-fmt` rewrites BUILD files in place to a canonical style —
consistent indentation, argument spacing, and quote normalization. Run it with
`--check` in CI to enforce formatting without writing.

## Usage

```bash title="terminal"
heph tool build-fmt              # format every BUILD file in the workspace
heph tool build-fmt //pkg/...    # scope to a package matcher
heph tool build-fmt -            # read from stdin, write formatted result to stdout
```

With no argument the formatter walks the whole workspace and rewrites every
BUILD file it finds. With a [package matcher](/docs/reference/addresses), only
the matched packages are touched.

The stdin mode (`-`) reads source from stdin and writes the formatted result to
stdout. It is useful for editor integrations and shell pipelines.

## In CI

Pass `--check` to report unformatted files and exit non-zero without writing:

```bash title="terminal"
heph tool build-fmt --check
```

A CI job that requires `--check` to pass keeps the workspace consistently
formatted. See [Using heph in CI](/docs/guides/ci) for a representative setup.

## Opting a file out

Add `# heph:fmt skip-file` as the first comment in a BUILD file to leave it
untouched by the formatter:

```python title="BUILD"
# heph:fmt skip-file
target(name  =  "generated",   driver = "exec")   # preserved exactly as written
```

The directive must appear before the first statement. A file with this directive
passes `--check` even when it is not formatted.

## Configuration

The formatter reads the `buildfile` plugin options from `.hephconfig`. Both
settings are shared with the buildfile provider, so the formatter and the
provider always agree on which files are BUILD files and how they are indented.

```yaml title=".hephconfig"
plugins:
  - builtin: buildfile
    options:
      indent: 4
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `indent` | number | `4` | Spaces per indentation level. |
| `patterns` | `string[]` | `["BUILD", "*.BUILD"]` | File names (and globs) the formatter treats as BUILD files, matching what the buildfile provider uses. |
