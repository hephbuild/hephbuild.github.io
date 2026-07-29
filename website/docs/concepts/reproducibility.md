---
sidebar_position: 2
title: Reproducibility
description: What byte-identical outputs guarantee, and how heph gets there.
---

# Reproducibility

heph's central promise is **byte-identical outputs**: the same inputs produce
the same artifact, on every machine, every time. This is what makes the cache
trustworthy — a cache hit is provably the artifact you would have built.

## How it's enforced

1. **Inputs are hashed before anything runs.** Sources, tool versions,
   environment and rule definition all fold into one digest.
2. **Actions run hermetically.** A sandbox exposes only the declared inputs.
3. **Outputs are content-addressed.** The digest of the inputs is the key; the
   bytes of the output are the value.

:::warning
Non-hermetic targets opt out of caching guarantees. Use them sparingly.
:::

## Path names must be UTF-8

Every path heph reads — a package directory, a source file matched by a
`glob()`, an entry discovered while walking the tree — must be valid UTF-8.
A name that isn't fails the build instead of being silently skipped:

```text
directory entry name is not valid UTF-8: ... heph paths must be UTF-8 —
rename it, or `fs.skip` the containing directory
```

Rename the entry, or add its directory to
[`fs.skip`](/docs/reference/configuration#fs--workspace-ignore-patterns) to
exclude it from every walk.

heph does not apply Unicode normalization to path names either: two
differently-encoded spellings of the same characters (e.g. composed vs.
decomposed accents) are treated as distinct names, matching what the
filesystem itself stores.
