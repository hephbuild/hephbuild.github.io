# Writing docs

Docs live in `website/docs/` (`.md` / `.mdx`). Write for the **user of heph**,
not the person who built it.

## Voice

- **To the point.** Short sentences. Lead with what the reader does or gets, not
  with background. Cut every word that doesn't add information.
- **Not verbose.** A concept page is a page, not an essay. If a sentence only
  restates the heading, delete it.
- **Practical.** Every page should leave the reader able to *do* something. Show
  the command, the config, the build file — give a concrete example.

## Don't

- **No implementation details.** Don't describe how heph works internally, its
  architecture, or its algorithms. The reader cares about behavior, not the guts.
- **No library or tooling name-drops.** Don't mention the languages, frameworks,
  or third-party libraries heph is built with. They're irrelevant to users and
  they go stale.
- **No source-code references.** Don't point at internal package names, file
  paths, function names, or link into the codebase. Document the public surface:
  commands, config keys, build-file functions, outputs.
- **No commands in headings.** Section headings describe the concept, not the
  command. Put the command in the body, not the title. Write
  `## Detecting output conflicts` not `## Detecting output conflicts: \`heph validate\``.

## Do

- **Define the term, then use it.** When a page introduces a concept, give it a
  one-line definition up front (see the "Driver" section in `plugins/exec.md`).
- **Show, then explain.** A short code block beats a paragraph. Annotate blocks
  with the filename: ` ```yaml title=".hephconfig" ` or ` ```python title="BUILD" `.
- **Use the public vocabulary.** `target`, `driver`, `cache hit`, `sandbox`,
  `.hephconfig`, `BUILD` — the words a user types and reads, not internal names.
- **Tables for enumerations.** Driver variants, config keys, terms → table.
- **Admonitions for asides.** `:::tip`, `:::note`, `:::warning` for things that
  would otherwise interrupt the flow.

## Page shape

```markdown
---
title: "Short title"
sidebar_position: 3
description: One sentence, user-facing, what this page is for.
---

# Title

One or two sentences: what this is and when you'd reach for it.

## Concept / Enabling it / Configuration / Usage

Prose kept minimal, carried by a concrete example.
```

After adding a page, register it in `website/sidebars.ts`.

## Checklist before committing a doc

- [ ] No internal architecture, library names, or code paths.
- [ ] At least one concrete example (command, config, or build file).
- [ ] New terms defined on first use.
- [ ] Added to `website/sidebars.ts`.
