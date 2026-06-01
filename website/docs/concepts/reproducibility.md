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
2. **Actions run hermetically.** A sandbox exposes only the declared inputs;
   the clock, network and ambient filesystem are withheld unless requested.
3. **Outputs are content-addressed.** The digest of the inputs is the key; the
   bytes of the output are the value.

```bash
$ heph build //app:server --check-reproducible
//app:server     digest sha256:9f2c…b07
//app:server     rebuild matches            ✓ reproduced
```

## When something is not reproducible

heph is honest about boundaries. If an action reads an undeclared input, the
sandbox surfaces it rather than silently caching a wrong result:

```
Build failed: action //app:server read undeclared path /etc/hostname.
Declare it as an input or mark the action non-hermetic.
```

:::warning
Non-hermetic actions opt out of caching guarantees. Use them sparingly, and
always say so plainly — trust is the product.
:::
