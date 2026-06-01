---
title: "Query"
sidebar_position: 9
description: Dynamic target selection via label, package, prefix, or codegen output matchers.
---

# Query

The query plugin enables dynamic target selection via predicates — label,
package, package prefix, or codegen output location. Instead of hardcoding a
list of targets, you describe the criteria they must satisfy and let heph
resolve the set for you. This keeps build and test commands stable as the
monorepo grows: new targets that match an existing query are picked up
automatically, and targets that no longer match drop out without anyone editing
a list.

A query returns a **group** of targets matching the specified criteria,
allowing you to build or test coherent subsets of your monorepo. Query
addresses use the `@heph/query` package and expand into a single group target
containing all matched results. See [group](/docs/plugins/group) for more
details.

## Provider

A **provider** is a plugin that contributes targets to the graph without
registering its own execution driver — the targets it emits run on an existing
driver. The query plugin is a provider: it emits group targets that run on the
`group` driver. It registers **no** driver of its own.

## Enabling it

Built-in and always-on; no registration required in `.hephconfig`.

## Usage

Address the `@heph/query` package with one or more matcher arguments:

```text
# Query all targets with the lint label and group them
//@heph/query:lint-targets@label=lint

# Query all targets in the src/tools package
//@heph/query:tools@package=src/tools

# Query all targets under cmd/ prefix and exclude go provider
//@heph/query:cmd@package_prefix=cmd,exclude_provider=go

# Combine matchers (AND logic)
//@heph/query:fast-tests@package_prefix=tests,label=fast
```
