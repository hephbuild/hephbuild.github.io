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
