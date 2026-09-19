---
title: "Credentials"
sidebar_position: 11
description: Declare an identity a build needs as a target, and let heph obtain it from whatever environment the build is running in.
---

# Credentials

A **credential** is a target — `driver = "credential"` — that declares an
identity a build needs: an ordered list of ways to obtain it, and the shape
it's handed to consumers in. A consuming target names it with
`credentials = [...]` and never learns which of the ways supplied it.

## The contract

> A credential grants **access**; it is not an **input**. A target's outputs
> must be identical whichever identity satisfied its credential requirement.
> A target whose output depends on *who* ran it is not cacheable, and says so
> with `cache = False`.

Nothing about a credential — the material, which source supplied it, the
declaration, even the names of the variables it presents — enters the
[input hash](/docs/concepts/caching). A cache hit acquires nothing: build the
same target twice with two different identities and the second run is still a
cache hit, never a re-acquire.

## Declaring one

```python title="BUILD"
aws = target(
    name = "aws",
    driver = "credential",
    sources = [
        # CI: exchange the runner's own OIDC token for the role, no secret
        # stored anywhere.
        heph.auth.oidc(
            "github_actions",
            audience = "sts.amazonaws.com",
            present = heph.auth.aws_web_identity(
                role = "arn:aws:iam::123456789012:role/deployer",
            ),
        ),
        # Laptop: whatever's already logged in via the AWS CLI.
        heph.auth.exec(
            ["aws", "configure", "export-credentials", "--profile", "acme", "--format", "process"],
            fields = {
                "access_key_id": "AccessKeyId",
                "secret_access_key": "SecretAccessKey",
                "session_token": "SessionToken",
            },
            expires = "Expiration",
            login = [["aws", "sso", "login", "--profile", "acme"]],
            present = heph.auth.aws_process(),
        ),
    ],
)

target(
    name = "deploy",
    driver = "bash",
    credentials = [aws],
    tools = ["//tools:terraform"],
    env = {"AWS_REGION": "eu-west-1"},   # selects bytes — stays an ordinary hashed input
    run = "terraform apply -auto-approve",
    cache = False,   # this target's output depends on which account it ran against
)
```

`//svc:deploy` says one word — `credentials = [aws]` — with no branching on CI
and no environment names. The declaration is environment-independent; the
chain inside it isn't. `AWS_REGION` stays on the consumer because it *selects*
which bytes come back, not because it's a secret.

## The chain

`sources` is ordered, and the **environment** picks the winner, not the
author. A source's **probe** answers *"is this applicable here?"*, not
*"will it succeed?"* — the first applicable source is the one used; if its
acquire step fails, that's a hard failure, not a fallthrough to the next
source. `heph auth explain <addr>` prints the walk: every source, why each
was skipped or chosen.

| Source | Constructor | Probe |
|---|---|---|
| Environment variables | `heph.auth.env(names)` | Every named variable is set |
| A file | `heph.auth.file(path, fields=None, expires=None)` | The path exists |
| A command | `heph.auth.exec(run, fields=None, expires=None, login=None, runner=None)` | `run`'s program resolves |
| Host paths, in place | `heph.auth.passthrough(paths, env=None, login=None)` | Every named path exists |
| A CI provider's own token | `heph.auth.oidc(provider="github_actions", audience=None)` | That CI provider is detected |
| Another target | a bare target address (no wrapper) | none — selected by `when` instead |

`heph.auth.exec`'s command must print JSON to stdout; `fields` maps a material
field name to a key in that JSON, and `expires` names the key holding an
absolute timestamp or a duration in seconds. `heph.auth.file` uses the same
`fields`/`expires` shape against a file's contents instead of a command's
stdout, or presents the whole file as `${value}` when `fields` is omitted.
`heph.auth.passthrough` exposes existing host paths without copying them,
each reachable in a presentation as `${file:<name>}`.

Every source also accepts:

| Option | Meaning |
|---|---|
| `when` | Restrict this source to a condition instead of probing for one — see below. |
| `credentials` | Credentials this source's own acquire step needs (a command that must itself authenticate to a secret manager, say). |
| `present` | Override the credential's presentation for material from this source only. |
| `hint` | Text shown by `heph auth explain` for this source. |

### `when`

A closed vocabulary, not an expression language:

| Value | Matches |
|---|---|
| `"ci"` | Any detected CI provider |
| `"ci:<provider>"` | One named provider — `"ci:github_actions"`, `"ci:gitlab_ci"`, `"ci:buildkite"`, `"ci:circleci"`, `"ci:jenkins"` |
| `"interactive"` | A terminal is attached |
| `"env:NAME"` | A named host environment variable is set and non-empty |
| `"os:linux"` / `"os:darwin"` | The build host's OS |

A source that is a target address has no cheap probe — you can't ask "is this
applicable?" of a target without running it — so it's always selected by
`when` rather than probed.

## A source that's a target

When acquiring needs tools, dependencies, or more than one command, make it an
ordinary target instead of an inline `heph.auth.exec`:

```python title="BUILD"
mint = target(
    name = "mint",
    driver = "bash",
    cache = False,                       # required of every credential source
    out = {"credential": "cred.json"},   # the reserved group, read as JSON
    run = 'vault kv get -format=json -field=data secret/cloudflare > $OUT_CREDENTIAL',
)

cf = target(
    name = "cf",
    driver = "credential",
    sources = [mint],
    present = {"env": {"CLOUDFLARE_API_TOKEN": "${token}"}},
)
```

An output group named `credential` is read as JSON and its top-level keys
become material fields; every other output group becomes a named file,
reachable in a presentation as `${file:<group>}`. Expiry comes from an
`expires_at` or `expires_in` key in that same JSON, or from the credential's
own `ttl`.

The target **must** be `cache = False` — its output is material, and heph
refuses to let it become a cached, shareable artifact.

## Presentation

`present` decides how material reaches a consumer's sandbox — set on the
credential target itself, or per source to override it for that source's
material:

```python
present = {
    "env": {"NAME": "${field}"},        # environment variables
    "files": {"name": "${field}"},      # files, written mode 0600
    "helper": "dialect",                # a callback the consuming tool invokes
}
```

At least one of the three is required. Only material and the handles needed
to use it belong here — a region, an account id, a profile name all *select*
which bytes a tool talks to, so they stay ordinary hashed config on the
consumer, not the credential.

| Shape | Survives the material expiring mid-run? |
|---|---|
| `helper` | Yes — the consuming tool calls back for a fresh credential whenever it needs one. |
| `files` | Sometimes — depends on whether the tool re-reads the file on refresh. |
| `env` | No — handed over once; the target fails if it expires while still running. |

### Template vocabulary

Values inside `present` are templates:

| Written | Resolves to |
|---|---|
| `${<field>}` | A material field, by name. |
| `${file:<name>}` | The absolute path of a presented file. |
| `${helper:command}` / `${helper:args}` | How to invoke the callback (for a hand-written `helper` config). |
| `$$` | A literal `$`. |

A `present` value is also a [deferred-value](/docs/concepts/deferred-values)
field, so `role = "${read://infra/aws:role-arn}"` works the same way it does
anywhere else that accepts one — read the owner of the value from another
target instead of copying it into the BUILD file.

### Presentation presets

Hand-rolling a third-party wire format is how you get a subtly wrong one, so
common ones ship as presets. Each returns a `present` dict — use one directly
in a source's or credential's `present =`:

| Preset | Parameters | Produces |
|---|---|---|
| `heph.auth.aws_process()` | — | An AWS credential-process callback. |
| `heph.auth.aws_web_identity(role, session_name="heph")` | `role`, `session_name` | A web-identity token file plus `AWS_WEB_IDENTITY_TOKEN_FILE`/`AWS_ROLE_ARN`/`AWS_ROLE_SESSION_NAME`. |
| `heph.auth.gcp(audience, impersonate=None)` | `audience`, `impersonate` | A generated `external_account` file plus `GOOGLE_APPLICATION_CREDENTIALS`. |
| `heph.auth.azure_workload(client_id, tenant_id)` | `client_id`, `tenant_id` | A federated token file plus `AZURE_FEDERATED_TOKEN_FILE`/`AZURE_CLIENT_ID`/`AZURE_TENANT_ID`. |
| `heph.auth.github(hosts="github.com")` | `hosts` | `GH_TOKEN` plus a git credential callback for the named host(s). |
| `heph.auth.docker(registries)` | `registries` | A Docker credential-helper callback for the named registries. |
| `heph.auth.git(hosts)` | `hosts` | A git credential callback for the named hosts. |
| `heph.auth.netrc(machines, login="${username}", password="${token}")` | `machines`, `login`, `password` | A generated `netrc` file plus `NETRC`. |

## Using a credential

Reference it by address on a consuming target:

```python title="BUILD"
target(
    name = "fetch",
    driver = "bash",
    credentials = ["//auth:github"],
    run = 'curl -sf -H "Authorization: token $GH_TOKEN" https://api.github.com/user > $OUT',
    out = "response.json",
)
```

Whether the target should still cache depends on the contract above, not on
the fact that it uses a credential: if the output would be identical
regardless of which identity ran it, leave caching on; if the output embeds
the identity — a plan naming an account, a presigned URL — set
`cache = False`.

A target cannot reference the same credential twice, and two credentials
can't both present the same variable name to one target — both are rejected
at parse time rather than silently picked between.

## The CLI

| Command | Does |
|---|---|
| `heph auth status` | One row per declared credential, its state, source, and expiry. `--json` for machine-readable output. |
| `heph auth explain <addr>` | Walks the whole chain: every source, why each was skipped, which won. |
| `heph auth login [addr]` | Runs whichever login commands their probes found stale. |
| `heph auth logout` | Clears cached material from disk. |

A build never signs you in on its own — it fails, naming the exact
`heph auth login` command to run.

## Redaction

Declared credential material is scrubbed from a target's captured output
before it's written anywhere, so a build step that echoes its own token
prints `[redacted]` instead. It's best-effort: material shorter than 8 bytes
isn't scrubbed, a secret the target transformed (base64, URL-encoded) isn't
recognized, and only material *fields* are scrubbed — the contents of a
presented file are not, so `cat`-ing a credential file still leaks it.
