---
sidebar_position: 1
title: CLI reference
description: The heph commands you'll use daily.
---

# CLI reference

## `heph run` {#run}

Run one or more targets.

```bash title="Usage"
heph run [OPTIONS] <TARGET>...
heph r   [OPTIONS] <TARGET>...   # alias
```

## `heph inspect` {#inspect}

Inspect a target — shows its spec, inputs, outputs, and computed hash.

```bash title="Usage"
heph inspect [OPTIONS] <TARGET>
heph i      [OPTIONS] <TARGET>   # alias
```

## `heph query` {#query}

Query and filter targets by address, label, or package.

```bash title="Usage"
heph query [OPTIONS] <MATCHER>
heph q     [OPTIONS] <MATCHER>   # alias
```

## `heph version` {#version}

Print the heph version.

## `heph tool` {#tool}

Maintenance and developer tools.

### `heph tool gc` {#tool-gc}

Garbage-collect the local cache. Scans all cached targets and removes artifacts for targets that no longer exist or whose inputs have changed.

```bash title="Usage"
heph tool gc [OPTIONS]
```

### `heph tool gen-gitignore` {#tool-gen-gitignore}

Manage the heph-generated block in the root `.gitignore`. Adds or refreshes the list of paths that heph writes so they are not accidentally committed.

```bash title="Usage"
heph tool gen-gitignore [OPTIONS]
```
