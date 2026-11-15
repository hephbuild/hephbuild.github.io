---
title: "Watching running builds"
sidebar_position: 5
description: List the heph runs going on in other terminals, see what one is stuck on, and follow it live.
---

# Watching running builds

Every heph run records what it is doing as a **session**. From another terminal
you can list sessions, print a snapshot of one, or attach to it and watch the
same progress view the run shows. Nothing has to be enabled before the run
starts.

```bash title="terminal"
heph session list                # this workspace's sessions, live first
heph session show 02kf5          # what it is doing and what it is stuck on
heph session attach 02kf5        # follow it live; q detaches
```

Watching only reads: nothing here cancels, signals or cleans up a session.

## Finding a session

A run prints its session id on stderr when it starts in non-interactive
output:

```text
heph: session d1v9q02kf5 (heph session attach d1v9q02kf5)
```

Otherwise, `heph session list` shows one row per session of the current
workspace, live first, with its ID, WORKTREE, COMMAND, STATE, EXIT, PROGRESS
and what it is doing NOW. `--all` lists every workspace's sessions.

Every command that takes an `<id>` accepts:

- the full id,
- the pid of a **live** session,
- a unique prefix or suffix of an id.

Prefer the suffix (the last 4–5 characters) or the pid. An id starts with its
start time, so runs started a couple of minutes apart share their leading
characters. An ambiguous id lists the candidates.

### Session states

| STATE | Meaning |
| --- | --- |
| `running` | Live, with a target working. |
| `waiting` | Live, and every open target is waiting on a lock or on resources. |
| `quiet` | Live, but no event for longer than `--stall-notice` (60s when it is off). Not a verdict: a long compile is quiet too. |
| `ok` / `failed` | Ended, by its exit code. |
| `lost` | The process went away without recording its end (killed or crashed). |
| `unknown` | Recorded by a newer heph that this one cannot read. |

## Commands

| Command | Does | Exit code |
| --- | --- | --- |
| `heph session list [--all] [--json]` | One row per session. | 0 |
| `heph session show <id> [--json]` | Prints the session's progress view once, then a "Stuck on" block: lock waits naming the session that holds the lock, resource waits, targets running over 30s, and a `Next:` line with the command to run next. | 0 |
| `heph session attach <id>` | Follows the session in the interactive view until it ends. `q` or Ctrl-C detaches and leaves the run going. Without a terminal it follows in line form. | The session's exit code; 0 on detach |
| `heph session inflight <id> [--json]` | Asks a running session for its in-flight report: the work it has open right now. Waits up to 5s for the answer. | 0 |

### Exit code 125

Every failure of `heph session` itself exits **125**: no such session, an
ambiguous id, a session `attach` can no longer follow, an `inflight` request
that was not answered.

Because `attach` mirrors the session's exit code, a run that itself exited 125
also makes `attach` exit 125. In that case `attach` says so on stderr:

```text
heph: session d1v9q02kf5 exited 125
```

To tell "the run failed" from "watching it failed" without parsing stderr, use
`heph session show <id> --json`.

## Using it from scripts and agents

`list --json` and `show --json` are the stable interface:

```bash title="terminal"
heph session list --all --json
heph session show 02kf5 --json
```

- `list --json` is `{version, sessions: [...]}`, sorted by id. Each session
  carries `id`, `owner_pid`, `argv`, `workspace_root`, `cwd`, `state`,
  `started_unix_ms`, `last_event_unix_ms`, `exit_code`, `panicked`,
  `progress` (`{done, total, total_complete, running_ops, failed}`), `now` and
  `blocked_on`.
- `show --json` adds `blocked_on`, `chain_root` (the session at the root of a
  chain of lock waits) and `next`: `{kind, command, argv, cwd, reason}`. Run
  `next.argv` in `next.cwd`; `command` is display text, not for parsing.
- `blocked_on` entries are `{kind: "lock", addr, holder_pid, holder_session}`
  or `{kind: "admission", addr, pool}`.
- `inflight --json` is `{id, report}`.

:::tip
`now` is human text and may change wording. Read `blocked_on` and `progress`
instead. `state` depends on the viewer's `--stall-notice`, so two viewers can
disagree on it; `last_event_unix_ms` is the stable "has it gone silent" signal.
:::

Field names are never renamed or removed without a version bump, and `state`
and `next.kind` may gain new values: treat an unknown one as unknown, not as an
error.

## Who is holding the lock

When a run waits on a lock held by another heph run, its own progress output
names the holder: `held by session <id> (pid N)`, or `held by pid N` when no
live session is recorded for that pid. Pass the id to `heph session show` to
see what the holder is doing.

## Turning recording off

| | Effect |
| --- | --- |
| `HEPH_NO_SESSION=1` | Records nothing and prints no start line. |
| `heph run --raw` | Sets up no session at all, so stderr carries only the tool's output and heph's failures. |

A run with no `HOME`, or an unwritable `~/.heph`, records nothing and warns
once.

### heph inside a target

A target that runs heph starts a heph of its own, which records its own
session. With no `HOME` in the target's environment (the default) it records
nothing and warns. If the target points `HOME` inside its sandbox, the session
directory can end up captured in the target's outputs, with a fresh id and
timestamps on every run. A target that runs heph should set
`HEPH_NO_SESSION=1` in its `env`, or use `heph run --raw`.

## Where sessions live

Sessions are stored per user under `~/.heph/sessions/`, readable only by you.
They hold nothing the terminal would not have shown. `heph tool clean` and
`gc` never touch them. Old sessions are pruned automatically when a new run
starts: an ended session is kept while it was last written under 10 minutes
ago **and** is among the 20 most recent ended sessions, and the oldest kept ones
are removed until ended sessions total at most 256 MiB. A live session is never
removed.
