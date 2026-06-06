---
name: heph-explain
description: Explain why a heph target rebuilt (or why a cache hit/miss happened) by tracing its input hash.
---

You are explaining heph caching behavior — "why did this rebuild?" or "why
didn't this rebuild?" Use the `heph` skill (`references/concepts.md` →
*Caching*, and `references/cli.md`).

Target / question: $ARGUMENTS

The model in one line: heph hashes a target's **complete** declared inputs into
one digest (`hashin`); a matching digest already in the cache is a hit, so the
stored output is returned without executing.

Trace it:

1. **Compute the key.** `heph inspect hashin <addr>` prints the current input
   hash. If it differs from the last run, *something in the inputs changed* —
   that is the entire cause of a rebuild.

2. **Enumerate what feeds the hash:** the target's own sources, each
   dependency's *outputs*, the tools it uses, its environment (`env` +
   `pass_env` values captured at hash time), and the target definition itself.
   Walk `heph inspect deps <addr>` and `heph inspect def <addr>` to see the
   actual set. A changed upstream output ripples downstream through the edges.

3. **Pinpoint the culprit.** Compare against expectation:
   - A source edited / a `glob()` now matching a new file → expected rebuild.
   - An upstream dep's output hash changed (`heph inspect hashout <dep>`) →
     transitive rebuild; narrow the edge with an output-group selector
     (`//pkg:t|group`) so unrelated groups don't invalidate this target.
   - A `pass_env` var (e.g. `$HOME`, `$USER`, a timestamp-ish var) varies
     between runs → non-determinism in the key; drop it or move to
     `runtime_pass_env`.
   - Something the command reads but shouldn't affect the build → consider
     `hash_deps` (invalidate without sandboxing) vs `runtime_deps` (in sandbox,
     not hashed) instead of plain `deps`.

4. **"It DIDN'T rebuild but I expected it to"** → the changed thing isn't in the
   hash. Likely an undeclared input (so the sandbox never saw it and it can't be
   in the key), or it's in `runtime_deps` (not hashed). Promote it to `deps` or
   `hash_deps`.

Conclude by naming the **specific** input that did or didn't move the hash, and
the one-line fix if the behavior was wrong.
